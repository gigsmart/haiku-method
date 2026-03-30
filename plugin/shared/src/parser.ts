import { readFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import matter from "gray-matter";
import { extractSections } from "./markdown.js";
import type {
  IntentFrontmatter,
  UnitFrontmatter,
  DiscoveryFrontmatter,
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
 */
function stripTitle(body: string): string {
  return body.replace(/^# .+\n?/, "").trim();
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
  } catch {
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
  } catch {
    return null;
  }
}

/**
 * Parse all unit-*.md files from an intent directory, sorted by number.
 */
export async function parseAllUnits(
  intentDir: string
): Promise<ParsedUnit[]> {
  try {
    const entries = await readdir(intentDir);
    const unitFiles = entries
      .filter((f) => /^unit-\d+.*\.md$/.test(f))
      .sort();

    const units: ParsedUnit[] = [];
    for (const file of unitFiles) {
      const parsed = await parseUnit(join(intentDir, file));
      if (parsed) {
        units.push(parsed);
      }
    }

    return units.sort((a, b) => a.number - b.number);
  } catch {
    return [];
  }
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
 * List all intent directories in the .ai-dlc root.
 * Excludes worktrees/ and settings.yml.
 */
export async function listIntents(aiDlcDir: string): Promise<string[]> {
  try {
    const entries = await readdir(aiDlcDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !EXCLUDED_ENTRIES.has(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}
