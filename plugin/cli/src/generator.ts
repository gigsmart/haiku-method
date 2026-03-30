import { mkdir, readdir, copyFile } from "node:fs/promises";
import { join, basename } from "node:path";
import {
  listIntents,
  parseIntent,
  parseAllUnits,
  buildDAG,
  toMermaidDefinition,
  parseCriteria,
} from "@ai-dlc/shared";
import { renderStaticLayout } from "./templates/layout.js";
import { renderIndexPage, type IntentSummary } from "./templates/index-page.js";
import { renderIntentPage, type MockupRef } from "./templates/intent-page.js";
import { renderUnitPage } from "./templates/unit-page.js";
import { renderBreadcrumb } from "./templates/components.js";

const MOCKUP_EXTS = [".html", ".htm", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"];

/** Scan a mockups/ directory and return labels + file names. */
async function scanMockups(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((f) => {
      const ext = f.substring(f.lastIndexOf(".")).toLowerCase();
      return MOCKUP_EXTS.includes(ext);
    }).sort();
  } catch {
    return [];
  }
}

/** Find the Success Criteria section content from a parsed intent/unit. */
function findCriteriaContent(sections: { heading: string; content: string }[]): string {
  const section = sections.find(
    (s) => s.heading.toLowerCase() === "success criteria" || s.heading.toLowerCase() === "criteria",
  );
  return section?.content ?? "";
}

export interface GeneratorResult {
  totalIntents: number;
  totalUnits: number;
  totalPages: number;
}

export async function generateSite(
  inputDir: string,
  outputDir: string,
  title: string,
): Promise<GeneratorResult> {
  // Discover intents
  const intentSlugs = await listIntents(inputDir);
  const summaries: IntentSummary[] = [];

  let totalUnits = 0;
  let totalPages = 1; // index page

  // Parse all intents and their units
  for (const slug of intentSlugs) {
    const intentDir = join(inputDir, slug);
    const intent = await parseIntent(intentDir);
    if (!intent) continue;

    const units = await parseAllUnits(intentDir);
    summaries.push({ intent, units });
    totalUnits += units.length;
  }

  // Create output directories
  await mkdir(outputDir, { recursive: true });

  // Generate index.html
  const indexBody = renderIndexPage(summaries);
  const indexHtml = renderStaticLayout(title, indexBody);
  await Bun.write(join(outputDir, "index.html"), indexHtml);

  // Generate per-intent pages
  for (const { intent, units } of summaries) {
    const intentDir = join(inputDir, intent.slug);
    const intentOutDir = join(outputDir, "intents", intent.slug);
    const unitsOutDir = join(intentOutDir, "units");
    await mkdir(unitsOutDir, { recursive: true });

    // Build DAG and mermaid
    const dag = buildDAG(units);
    const mermaid = units.length > 0 ? toMermaidDefinition(dag, units) : "";

    // Parse criteria from intent sections
    const criteriaContent = findCriteriaContent(intent.sections);
    const criteria = parseCriteria(criteriaContent);

    // Scan intent-level mockups
    const intentMockupDir = join(intentDir, "mockups");
    const intentMockupFiles = await scanMockups(intentMockupDir);
    const intentMockups: MockupRef[] = [];

    if (intentMockupFiles.length > 0) {
      const mockupsOut = join(intentOutDir, "mockups");
      await mkdir(mockupsOut, { recursive: true });
      for (const file of intentMockupFiles) {
        await copyFile(join(intentMockupDir, file), join(mockupsOut, file));
        intentMockups.push({
          label: file.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
          src: `mockups/${file}`,
        });
      }
    }

    // Generate intent page
    const intentBody = renderIntentPage(intent, units, criteria, mermaid, intentMockups);
    const breadcrumbHtml = renderBreadcrumb([
      { label: "Dashboard", href: "../../index.html" },
      { label: intent.title },
    ]);
    const intentHtml = renderStaticLayout(intent.title, intentBody, {
      navHref: "../../index.html",
      navLabel: "Dashboard",
      breadcrumbHtml,
    });
    await Bun.write(join(intentOutDir, "index.html"), intentHtml);
    totalPages++;

    // Generate per-unit pages
    for (const unit of units) {
      // Parse unit criteria
      const unitCriteriaContent = findCriteriaContent(unit.sections);
      const unitCriteria = parseCriteria(unitCriteriaContent);

      // Scan unit-level mockups
      const unitMockupDir = join(intentDir, "mockups", unit.slug);
      const unitMockupFiles = await scanMockups(unitMockupDir);
      const unitMockups: MockupRef[] = [];

      if (unitMockupFiles.length > 0) {
        const mockupsOut = join(unitsOutDir, "mockups", unit.slug);
        await mkdir(mockupsOut, { recursive: true });
        for (const file of unitMockupFiles) {
          await copyFile(join(unitMockupDir, file), join(mockupsOut, file));
          unitMockups.push({
            label: file.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
            src: `mockups/${unit.slug}/${file}`,
          });
        }
      }

      // Also check for wireframe referenced in frontmatter
      if (unit.frontmatter.wireframe) {
        const wireframePath = join(intentDir, unit.frontmatter.wireframe);
        const wireframeName = basename(unit.frontmatter.wireframe);
        try {
          const wireframeOut = join(unitsOutDir, "wireframes");
          await mkdir(wireframeOut, { recursive: true });
          await copyFile(wireframePath, join(wireframeOut, wireframeName));
          unitMockups.unshift({
            label: "Wireframe",
            src: `wireframes/${wireframeName}`,
          });
        } catch {
          // wireframe file doesn't exist, skip
        }
      }

      // Fallback: scan intent-level mockups/ for unit-slug-named files
      if (unitMockups.length === 0) {
        const mockupsDir = join(intentDir, "mockups");
        try {
          const allFiles = await readdir(mockupsDir);
          const matches = allFiles.filter((f) => {
            const name = f.substring(0, f.lastIndexOf("."));
            return name === unit.slug && MOCKUP_EXTS.includes(f.substring(f.lastIndexOf(".")).toLowerCase());
          });
          if (matches.length > 0) {
            const wireframeOut = join(unitsOutDir, "wireframes");
            await mkdir(wireframeOut, { recursive: true });
            for (const file of matches.sort()) {
              await copyFile(join(mockupsDir, file), join(wireframeOut, file));
              unitMockups.push({ label: "Wireframe", src: `wireframes/${file}` });
            }
          }
        } catch { /* no mockups dir */ }
      }

      const unitBody = renderUnitPage(intent, unit, unitCriteria, unitMockups);
      const unitHtml = renderStaticLayout(unit.title, unitBody, {
        navHref: "../index.html",
        navLabel: intent.title,
      });
      await Bun.write(join(unitsOutDir, `${unit.slug}.html`), unitHtml);
      totalPages++;
    }
  }

  return {
    totalIntents: summaries.length,
    totalUnits,
    totalPages,
  };
}
