import type { ParsedIntent, ParsedUnit, CriterionItem, Section } from "@ai-dlc/shared";
import { markdownToHtml } from "@ai-dlc/shared";
import { escapeHtml, escapeAttr } from "./layout.js";
import {
  renderTabs,
  renderBadge,
  renderCriteriaChecklist,
  renderBreadcrumb,
  renderMockupEmbed,
  card,
  sectionHeading,
  type TabDef,
} from "./components.js";

export interface MockupRef {
  label: string;
  src: string;
}

export function renderUnitPage(
  intent: ParsedIntent,
  unit: ParsedUnit,
  criteria: CriterionItem[],
  mockups: MockupRef[],
): string {
  const findSection = (name: string): string => {
    const section = unit.sections.find(
      (s: Section) => s.heading.toLowerCase() === name.toLowerCase(),
    );
    return section?.content ?? "";
  };

  const description = findSection("Description") || findSection("Overview");
  const techSpec = findSection("Technical Spec") || findSection("Technical Specification") || findSection("Implementation");
  const domainEntities = findSection("Domain Entities") || findSection("Entities");

  // Tab 1: Spec
  const specContent = `
    ${renderBreadcrumb([
      { label: "Dashboard", href: "../../index.html" },
      { label: intent.title, href: "../index.html" },
      { label: unit.title },
    ])}

    <div class="flex flex-wrap items-center gap-2 mb-6">
      ${renderBadge("Unit", "unit")}
      ${renderBadge("Status", unit.frontmatter.status)}
      ${unit.frontmatter.discipline ? renderBadge("Discipline", unit.frontmatter.discipline) : ""}
    </div>

    ${description ? card(`
      ${sectionHeading("Description")}
      <div class="prose prose-sm dark:prose-invert max-w-none">${markdownToHtml(description)}</div>
    `) : ""}

    ${techSpec ? card(`
      ${sectionHeading("Technical Spec")}
      <div class="prose prose-sm dark:prose-invert max-w-none">${markdownToHtml(techSpec)}</div>
    `) : ""}

    ${domainEntities ? card(`
      ${sectionHeading("Domain Entities")}
      <div class="prose prose-sm dark:prose-invert max-w-none">${markdownToHtml(domainEntities)}</div>
    `) : ""}
  `;

  // Tab 2: Wireframe
  const hasWireframe = mockups.length > 0;
  const wireframeContent = hasWireframe
    ? card(`
        ${sectionHeading("Wireframe")}
        ${mockups.map((m) => `
          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <h4 class="text-sm font-medium text-gray-600 dark:text-gray-400">${escapeHtml(m.label)}</h4>
              <a href="${escapeAttr(m.src)}" target="_blank" rel="noopener noreferrer"
                 class="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                Open in new tab &#8599;
              </a>
            </div>
            <iframe src="${escapeAttr(m.src)}"
                    sandbox="allow-scripts allow-same-origin"
                    class="w-full h-[600px] border border-gray-200 dark:border-gray-700 rounded-lg bg-white"
                    title="${escapeAttr(m.label)}"></iframe>
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
      <div class="prose prose-sm dark:prose-invert max-w-none">${markdownToHtml(risks)}</div>
    `) : ""}

    ${boundaries ? card(`
      ${sectionHeading("Boundaries (NOT in scope)")}
      <div class="prose prose-sm dark:prose-invert max-w-none">${markdownToHtml(boundaries)}</div>
    `) : ""}

    ${notes ? card(`
      ${sectionHeading("Notes")}
      <div class="prose prose-sm dark:prose-invert max-w-none">${markdownToHtml(notes)}</div>
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

  return renderTabs("unit", tabs);
}
