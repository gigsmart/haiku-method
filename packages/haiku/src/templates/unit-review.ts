import type { ParsedIntent, ParsedUnit, CriterionItem, Section } from "../types.js";
import type { MockupInfo } from "./types.js";
import { escapeHtml, escapeAttr } from "./layout.js";
import {
  renderTabs,
  renderBadge,
  renderCriteriaChecklist,
  renderReviewSidebar,
  renderReviewSidebarScript,
  renderBreadcrumb,
  renderMarkdownBlock,
  renderMockupEmbeds,
  card,
  sectionHeading,
  type TabDef,
} from "./components.js";
import { renderAnnotationCanvas } from "./annotation-canvas.js";
import { renderInlineComments } from "./inline-comments.js";
import { markdownToHtml } from "../markdown.js";

import type { ReviewResult } from "./intent-review.js";

export function renderUnitReview(
  intent: ParsedIntent,
  unit: ParsedUnit,
  criteria: CriterionItem[],
  sessionId: string,
  wireframeMockups: MockupInfo[],
): ReviewResult {
  const findSection = (name: string): string => {
    const section = unit.sections.find(
      (s: Section) => s.heading?.toLowerCase() === name.toLowerCase(),
    );
    return section?.content ?? "";
  };

  const findSectionWithSubs = (name: string): Section | undefined => {
    return unit.sections.find(
      (s: Section) => s.heading?.toLowerCase() === name.toLowerCase(),
    );
  };

  const description = findSection("Description") || findSection("Overview");
  const techSpec = findSection("Technical Spec") || findSection("Technical Specification") || findSection("Implementation");
  const domainEntities = findSection("Domain Entities") || findSection("Entities");

  // Tab 1: Spec (with inline commenting on text content)
  // Combine all spec content into a single commentable block for a unified inline comments experience
  let combinedSpecMarkdown = "";
  if (description) combinedSpecMarkdown += `## Description\n\n${description}\n\n`;
  if (techSpec) combinedSpecMarkdown += `## Technical Spec\n\n${techSpec}\n\n`;
  if (domainEntities) combinedSpecMarkdown += `## Domain Entities\n\n${domainEntities}\n\n`;

  const specContent = `
    ${renderBreadcrumb([
      { label: intent.title },
      { label: unit.title },
    ])}

    <div class="flex flex-wrap items-center gap-2 mb-6">
      ${renderBadge("Unit", "unit")}
      ${renderBadge("Status", unit.frontmatter.status)}
      ${unit.frontmatter.discipline ? renderBadge("Discipline", unit.frontmatter.discipline) : ""}
    </div>

    ${combinedSpecMarkdown ? card(`
      ${sectionHeading("Spec — Comment on text")}
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">Select text to add inline comments.</p>
      ${renderInlineComments(markdownToHtml(combinedSpecMarkdown))}
    `) : card(`
      <p class="text-gray-500 dark:text-gray-400 italic">No spec content available.</p>
    `)}
  `;

  // Tab 2: Wireframe (with annotation canvas for images)
  const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"];
  function isImageUrl(url: string): boolean {
    const ext = url.substring(url.lastIndexOf(".")).toLowerCase();
    return IMAGE_EXTS.includes(ext);
  }

  const hasWireframe = wireframeMockups.length > 0;
  // Use the annotation canvas for the first image mockup so reviewers can pin and draw on it
  const firstImageMockup = wireframeMockups.find((m) => isImageUrl(m.url));
  const remainingMockups = wireframeMockups.filter((m) => m !== firstImageMockup);

  const wireframeContent = hasWireframe
    ? `${firstImageMockup ? card(`
        ${sectionHeading("Wireframe — Annotate")}
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-medium text-gray-600 dark:text-gray-400">${escapeHtml(firstImageMockup.label)}</h4>
          <a href="${escapeAttr(firstImageMockup.url)}" target="_blank" rel="noopener noreferrer"
             class="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Open in new tab &#8599;
          </a>
        </div>
        ${renderAnnotationCanvas(firstImageMockup.url)}
      `) : ""}
      ${remainingMockups.length > 0 ? card(`
        ${sectionHeading(firstImageMockup ? "Additional Wireframes" : "Wireframe")}
        ${renderMockupEmbeds(remainingMockups)}
      `) : ""}`
    : card(`
        ${sectionHeading("Wireframe")}
        <p class="text-gray-500 dark:text-gray-400 italic">No wireframe available for this unit.</p>
      `);

  // Tab 3: Success Criteria
  const criteriaContent = card(`
    ${sectionHeading("Success Criteria")}
    ${renderCriteriaChecklist(criteria)}
  `);

  // Tab 4: Risks & Boundaries
  const risks = findSection("Risks") || findSection("Risk");
  const boundaries = findSection("Boundaries") || findSection("Out of Scope") || findSection("NOT in scope");
  const notes = findSection("Notes") || findSection("Additional Notes");

  const risksContent = `
    ${risks ? card(`
      ${sectionHeading("Risks")}
      ${renderMarkdownBlock("unit-risks", risks)}
    `) : ""}

    ${boundaries ? card(`
      ${sectionHeading("Boundaries (NOT in scope)")}
      ${renderMarkdownBlock("unit-boundaries", boundaries)}
    `) : ""}

    ${notes ? card(`
      ${sectionHeading("Notes")}
      ${renderMarkdownBlock("unit-notes", notes)}
    `) : ""}

    ${!risks && !boundaries && !notes ? card(`
      <p class="text-gray-500 dark:text-gray-400 italic">No risks or boundaries documented for this unit.</p>
    `) : ""}
  `;

  const tabs: TabDef[] = [
    { id: "spec", label: "Spec", content: specContent },
    { id: "wireframe", label: "Wireframe", content: wireframeContent, disabled: !hasWireframe },
    { id: "criteria", label: "Success Criteria", content: criteriaContent },
    { id: "risks", label: "Risks & Boundaries", content: risksContent },
  ];

  return {
    body: renderTabs("unit", tabs),
    sidebar: renderReviewSidebar(sessionId),
    sidebarScript: renderReviewSidebarScript(sessionId),
  };
}
