import { readFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import matter from "gray-matter";
import { extractSections } from "./markdown.js";
import type {
  IntentFrontmatter,
  UnitFrontmatter,
  DiscoveryFrontmatter,
  StageState,
  ParsedIntent,
  ParsedUnit,
  ParsedDiscovery,
} from "./types.js";

const EXCLUDED_ENTRIES = new Set(["worktrees", "settings.yml"]);

/**
 * Normalize frontmatter values: coerce Date objects to ISO date strings.
 * gray-matter auto-parses YAML dates (e.g. 2026-03-27) into Date objects.
 */
function normalizeFrontmatter<T extends Record<string, unknown>>(data: T): T {
  const result = { ...data };
  for (const key in result) {
    const val = result[key];
    if (val instanceof Date) {
      (result as Record<string, unknown>)[key] = val.toISOString().split("T")[0];
    }
  }
  return result;
}

/**
 * Extract the title (first # heading) from markdown body.
 */
function extractTitle(body: string): string {
  const match = body.match(/^# (.+)$/m);
  return match ? match[1].trim() : "";
}

/**
 * Strip the title line (first # heading) from the body for section parsing.
 * Uses the `m` flag so `^` matches at the start of any line, not just string start.
 */
function stripTitle(body: string): string {
  return body.replace(/^# .+$/m, "").trim();
}

/**
 * Parse an intent.md file from an intent directory.
 */
export async function parseIntent(
  intentDir: string
): Promise<ParsedIntent | null> {
  try {
    const filePath = join(intentDir, "intent.md");
    const raw = await readFile(filePath, "utf-8");
    const { data, content } = matter(raw);
    const frontmatter = normalizeFrontmatter(data) as IntentFrontmatter;
    const title = extractTitle(content);
    const bodyWithoutTitle = stripTitle(content);
    const sections = extractSections(bodyWithoutTitle);
    const slug = basename(intentDir);

    return {
      slug,
      frontmatter,
      title,
      sections,
      rawContent: raw,
    };
  } catch (err) {
    const filePath = join(intentDir, "intent.md");
    // Only warn for parse errors, not missing files (ENOENT is expected)
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[haiku/shared] Failed to parse ${filePath}:`, err);
    }
    return null;
  }
}

/**
 * Parse a single unit-*.md file.
 * Extracts unit number from filename pattern: unit-NN-slug.md
 */
export async function parseUnit(
  filePath: string
): Promise<ParsedUnit | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const { data, content } = matter(raw);
    const frontmatter = normalizeFrontmatter(data) as UnitFrontmatter;
    const title = extractTitle(content);
    const bodyWithoutTitle = stripTitle(content);
    const sections = extractSections(bodyWithoutTitle);

    const filename = basename(filePath, ".md");
    const numberMatch = filename.match(/^unit-(\d+)/);
    const number = numberMatch ? parseInt(numberMatch[1], 10) : 0;

    return {
      slug: filename,
      number,
      frontmatter,
      title,
      sections,
      rawContent: raw,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[haiku/shared] Failed to parse ${filePath}:`, err);
    }
    return null;
  }
}

/**
 * Parse all unit-*.md files from an intent directory, sorted by number.
 * Looks in both the intent root and stages/{stage}/units/ subdirectories.
 */
export async function parseAllUnits(
  intentDir: string
): Promise<ParsedUnit[]> {
  const units: ParsedUnit[] = [];

  // Look for unit files in stages/{stage}/units/ subdirectories
  try {
    const stagesDir = join(intentDir, "stages");
    const stageEntries = await readdir(stagesDir, { withFileTypes: true });
    for (const stageEntry of stageEntries) {
      if (!stageEntry.isDirectory()) continue;
      try {
        const unitsDir = join(stagesDir, stageEntry.name, "units");
        const unitEntries = await readdir(unitsDir);
        const unitFiles = unitEntries
          .filter((f) => /^unit-\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(f))
          .sort();

        for (const file of unitFiles) {
          const parsed = await parseUnit(join(unitsDir, file));
          if (parsed) {
            // Tag the unit with its stage for context
            if (!parsed.frontmatter.stage) {
              parsed.frontmatter.stage = stageEntry.name;
            }
            units.push(parsed);
          }
        }
      } catch {
        // No units/ subdirectory in this stage — skip
      }
    }
  } catch {
    // No stages/ directory — skip
  }

  return units.sort((a, b) => a.number - b.number);
}

/**
 * Parse discovery.md from an intent directory. Returns null if missing.
 */
export async function parseDiscovery(
  intentDir: string
): Promise<ParsedDiscovery | null> {
  try {
    const filePath = join(intentDir, "discovery.md");
    const raw = await readFile(filePath, "utf-8");
    const { data, content } = matter(raw);
    const frontmatter = normalizeFrontmatter(data) as DiscoveryFrontmatter;
    const title = extractTitle(content);
    const body = stripTitle(content);

    return { frontmatter, title, body };
  } catch {
    return null;
  }
}

/**
 * List all intent directories in the .haiku root.
 * Excludes worktrees/ and settings.yml.
 */
export async function listIntents(haikuDir: string): Promise<string[]> {
  try {
    const entries = await readdir(haikuDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !EXCLUDED_ENTRIES.has(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Parse all stage state.json files from an intent's stages/ directory.
 * Returns a map of stage name to parsed StageState.
 */
export async function parseStageStates(
  intentDir: string
): Promise<Record<string, StageState>> {
  const states: Record<string, StageState> = {};
  try {
    const stagesDir = join(intentDir, "stages");
    const entries = await readdir(stagesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const stateFile = join(stagesDir, entry.name, "state.json");
        const raw = await readFile(stateFile, "utf-8");
        const parsed = JSON.parse(raw);
        states[entry.name] = {
          stage: parsed.stage ?? entry.name,
          status: parsed.status ?? "pending",
          phase: parsed.phase ?? "",
          started_at: parsed.started_at,
          completed_at: parsed.completed_at,
          gate_entered_at: parsed.gate_entered_at,
          gate_outcome: parsed.gate_outcome,
        };
      } catch {
        // No state.json or parse error — skip
      }
    }
  } catch {
    // No stages/ directory
  }
  return states;
}

/**
 * Read all knowledge files from an intent's knowledge/ directory.
 * Returns an array of { name, content } objects.
 */
export async function parseKnowledgeFiles(
  intentDir: string
): Promise<Array<{ name: string; content: string }>> {
  const files: Array<{ name: string; content: string }> = [];
  try {
    const knowledgeDir = join(intentDir, "knowledge");
    const entries = await readdir(knowledgeDir);
    for (const entry of entries.sort()) {
      if (!entry.endsWith(".md")) continue;
      try {
        const raw = await readFile(join(knowledgeDir, entry), "utf-8");
        const { content } = matter(raw);
        files.push({
          name: entry.replace(/\.md$/, ""),
          content,
        });
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // No knowledge/ directory
  }
  return files;
}

/**
 * Read stage-specific artifact files (like DESIGN-BRIEF.md).
 * Returns an array of { stage, name, content } objects.
 */
export async function parseStageArtifacts(
  intentDir: string
): Promise<Array<{ stage: string; name: string; content: string }>> {
  const artifacts: Array<{ stage: string; name: string; content: string }> = [];
  try {
    const stagesDir = join(intentDir, "stages");
    const stageEntries = await readdir(stagesDir, { withFileTypes: true });
    for (const stageEntry of stageEntries) {
      if (!stageEntry.isDirectory()) continue;
      try {
        const stageDir = join(stagesDir, stageEntry.name);
        const files = await readdir(stageDir);
        for (const file of files.sort()) {
          // Capture markdown files that aren't state.json
          if (file.endsWith(".md")) {
            try {
              const raw = await readFile(join(stageDir, file), "utf-8");
              const { content } = matter(raw);
              artifacts.push({
                stage: stageEntry.name,
                name: file.replace(/\.md$/, ""),
                content,
              });
            } catch {
              // Skip unreadable files
            }
          }
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // No stages/ directory
  }
  return artifacts;
}

const OUTPUT_IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"];
const OUTPUT_HTML_EXTS = [".html", ".htm"];

export interface OutputArtifact {
  stage: string;
  name: string;
  type: "markdown" | "html" | "image";
  /** Markdown and HTML content is inlined; images use a URL */
  content?: string;
  /** Relative path within the stage artifacts dir (for serving via HTTP) */
  relativePath?: string;
}

/**
 * Scan stages/{stage}/artifacts/ directories for output artifacts.
 * Returns markdown/html content inline and image file references for HTTP serving.
 */
export async function parseOutputArtifacts(
  intentDir: string
): Promise<OutputArtifact[]> {
  const artifacts: OutputArtifact[] = [];
  try {
    const stagesDir = join(intentDir, "stages");
    const stageEntries = await readdir(stagesDir, { withFileTypes: true });
    for (const stageEntry of stageEntries) {
      if (!stageEntry.isDirectory()) continue;
      try {
        const artifactsDir = join(stagesDir, stageEntry.name, "artifacts");
        const files = await readdir(artifactsDir);
        for (const file of files.sort()) {
          const ext = file.substring(file.lastIndexOf(".")).toLowerCase();
          if (file.endsWith(".md")) {
            try {
              const raw = await readFile(join(artifactsDir, file), "utf-8");
              const { content } = matter(raw);
              artifacts.push({
                stage: stageEntry.name,
                name: file.replace(/\.md$/, ""),
                type: "markdown",
                content,
              });
            } catch {
              // Skip unreadable files
            }
          } else if (OUTPUT_HTML_EXTS.includes(ext)) {
            try {
              const content = await readFile(join(artifactsDir, file), "utf-8");
              artifacts.push({
                stage: stageEntry.name,
                name: file.replace(/\.[^.]+$/, ""),
                type: "html",
                content,
              });
            } catch {
              // Skip unreadable files
            }
          } else if (OUTPUT_IMAGE_EXTS.includes(ext)) {
            artifacts.push({
              stage: stageEntry.name,
              name: file.replace(/\.[^.]+$/, ""),
              type: "image",
              relativePath: `${stageEntry.name}/artifacts/${file}`,
            });
          }
        }
      } catch {
        // No artifacts/ directory for this stage
      }
    }
  } catch {
    // No stages/ directory
  }
  return artifacts;
}
