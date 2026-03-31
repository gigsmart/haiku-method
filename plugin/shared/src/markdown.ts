import { marked } from "marked";
import type { Section, CriterionItem } from "./types.js";

/**
 * Convert markdown string to HTML.
 */
export function markdownToHtml(md: string): string {
  // marked.parse with async:false returns string synchronously
  const result = marked.parse(md, { async: false });
  if (typeof result !== "string") {
    throw new Error("marked.parse returned unexpected type");
  }
  return result;
}

/**
 * Split a markdown body into sections based on ## headings.
 * ### subsections are nested under their parent ## section.
 */
export function extractSections(body: string): Section[] {
  const lines = body.split("\n");
  const sections: Section[] = [];
  let currentH2: Section | null = null;
  let currentH3: Section | null = null;
  let buffer: string[] = [];

  function flushBuffer() {
    const text = buffer.join("\n").trim();
    if (currentH3) {
      currentH3.content = text;
    } else if (currentH2) {
      currentH2.content = text;
    }
    buffer = [];
  }

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    const h3Match = line.match(/^### (.+)$/);

    if (h2Match) {
      flushBuffer();
      if (currentH3 && currentH2) {
        currentH2.subsections.push(currentH3);
        currentH3 = null;
      }
      if (currentH2) {
        sections.push(currentH2);
      }
      currentH2 = {
        heading: h2Match[1],
        level: 2,
        content: "",
        subsections: [],
      };
      currentH3 = null;
    } else if (h3Match) {
      flushBuffer();
      if (currentH3 && currentH2) {
        currentH2.subsections.push(currentH3);
      }
      currentH3 = {
        heading: h3Match[1],
        level: 3,
        content: "",
        subsections: [],
      };
    } else {
      buffer.push(line);
    }
  }

  // Flush remaining content
  flushBuffer();
  if (currentH3 && currentH2) {
    currentH2.subsections.push(currentH3);
  }
  if (currentH2) {
    sections.push(currentH2);
  }

  return sections;
}

/**
 * Parse criteria markdown into checked/unchecked items.
 * Matches `- [x]` (checked) and `- [ ]` (unchecked) patterns.
 */
export function parseCriteria(criteriaMarkdown: string): CriterionItem[] {
  const items: CriterionItem[] = [];
  const regex = /^[-*]\s+\[([ xX])\]\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(criteriaMarkdown)) !== null) {
    items.push({
      checked: match[1].toLowerCase() === "x",
      text: match[2].trim(),
    });
  }

  return items;
}
