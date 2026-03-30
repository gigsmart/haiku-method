import type { ParsedIntent, ParsedUnit, CriterionItem, Section } from "@ai-dlc/shared";
import type { MockupInfo } from "./types.js";
import { escapeHtml, escapeAttr } from "./layout.js";
import {
  renderTabs,
  renderBadge,
  renderCriteriaChecklist,
  renderDecisionForm,
  renderBreadcrumb,
  renderMarkdownBlock,
  renderMockupEmbeds,
  card,
  sectionHeading,
  type TabDef,
} from "./components.js";

export function renderUnitReview(
  intent: ParsedIntent,
  unit: ParsedUnit,
  criteria: CriterionItem[],
  sessionId: string,
  wireframeMockups: MockupInfo[],
): string {
  const findSection = (name: string): string => {
    const section = unit.sections.find(
      (s: Section) => s.heading.toLowerCase() === name.toLowerCase(),
    );
    return section?.content ?? "";
  };

  const findSectionWithSubs = (name: string): Section | undefined => {
    return unit.sections.find(
      (s: Section) => s.heading.toLowerCase() === name.toLowerCase(),
    );
  };

  const description = findSection("Description") || findSection("Overview");
  const techSpec = findSection("Technical Spec") || findSection("Technical Specification") || findSection("Implementation");
  const domainEntities = findSection("Domain Entities") || findSection("Entities");

  // Tab 1: Spec
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

    ${description ? card(`
      ${sectionHeading("Description")}
      ${renderMarkdownBlock("unit-description", description)}
    `) : ""}

    ${techSpec ? card(`
      ${sectionHeading("Technical Spec")}
      ${renderMarkdownBlock("unit-techspec", techSpec)}
    `) : ""}

    ${domainEntities ? card(`
      ${sectionHeading("Domain Entities")}
      ${renderMarkdownBlock("unit-entities", domainEntities)}
    `) : ""}
  `;

  // Tab 2: Wireframe
  const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"];
  function isImageUrl(url: string): boolean {
    const ext = url.substring(url.lastIndexOf(".")).toLowerCase();
    return IMAGE_EXTS.includes(ext);
  }

  const hasWireframe = wireframeMockups.length > 0;
  const wireframeContent = hasWireframe
    ? card(`
        ${sectionHeading("Wireframe")}
        ${wireframeMockups.map((m) => `
          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <h4 class="text-sm font-medium text-gray-600 dark:text-gray-400">${escapeHtml(m.label)}</h4>
              <a href="${escapeAttr(m.url)}" target="_blank" rel="noopener noreferrer"
                 class="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                Open in new tab &#8599;
              </a>
            </div>
            ${isImageUrl(m.url)
              ? `<img src="${escapeAttr(m.url)}"
                     alt="${escapeAttr(m.label)}"
                     class="max-w-full h-auto border border-gray-200 dark:border-gray-700 rounded-lg" />`
              : `<iframe src="${escapeAttr(m.url)}"
                        sandbox="allow-scripts allow-same-origin"
                        class="w-full h-[600px] border border-gray-200 dark:border-gray-700 rounded-lg bg-white"
                        title="${escapeAttr(m.label)}"></iframe>`
            }
          </div>
        `).join("")}
      `)
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

  return `
    ${renderTabs("unit", tabs)}
    ${renderDecisionForm(sessionId)}
  `;
}
