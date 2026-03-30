import type { ParsedIntent, ParsedUnit, CriterionItem, Section } from "@ai-dlc/shared";
import type { MockupInfo } from "./types.js";
import { escapeHtml } from "./layout.js";
import {
  renderTabs,
  renderBadge,
  renderCriteriaChecklist,
  renderDecisionForm,
  renderMarkdownBlock,
  renderMockupEmbeds,
  card,
  sectionHeading,
  type TabDef,
} from "./components.js";

export function renderIntentReview(
  intent: ParsedIntent,
  units: ParsedUnit[],
  criteria: CriterionItem[],
  sessionId: string,
  mermaid: string,
  intentMockups: MockupInfo[],
  unitMockups: Map<string, MockupInfo[]>,
): string {
  const findSection = (name: string): string => {
    const section = intent.sections.find(
      (s: Section) => s.heading.toLowerCase() === name.toLowerCase(),
    );
    return section?.content ?? "";
  };

  const findSectionWithSubs = (name: string): Section | undefined => {
    return intent.sections.find(
      (s: Section) => s.heading.toLowerCase() === name.toLowerCase(),
    );
  };

  const problem = findSection("Problem");
  const solution = findSection("Solution");

  // Tab 1: Overview
  const overviewContent = `
    <div class="flex flex-wrap items-center gap-2 mb-6">
      ${renderBadge("Review type", "intent")}
      ${renderBadge("Status", intent.frontmatter.status)}
    </div>

    ${problem ? card(`
      ${sectionHeading("Problem")}
      ${renderMarkdownBlock("intent-problem", problem)}
    `) : ""}

    ${solution ? card(`
      ${sectionHeading("Solution")}
      ${renderMarkdownBlock("intent-solution", solution)}
    `) : ""}

    ${criteria.length > 0 ? card(`
      ${sectionHeading("Success Criteria")}
      ${renderCriteriaChecklist(criteria)}
    `) : ""}

    ${intentMockups.length > 0 ? card(`
      ${sectionHeading("Mockups")}
      ${renderMockupEmbeds(intentMockups)}
    `) : ""}
  `;

  // Tab 2: Units & DAG
  const unitRows = units
    .map((u) => {
      const deps = u.frontmatter.depends_on?.length
        ? u.frontmatter.depends_on.join(", ")
        : "—";
      const um = unitMockups.get(u.slug) ?? [];
      return `<tr class="border-b border-gray-100 dark:border-gray-800">
        <td class="py-3 pr-3 font-mono text-sm text-gray-500 dark:text-gray-400">${u.number.toString().padStart(2, "0")}</td>
        <td class="py-3 pr-3 font-medium">${escapeHtml(u.title)}</td>
        <td class="py-3 pr-3 text-sm">${escapeHtml(u.frontmatter.discipline)}</td>
        <td class="py-3 pr-3">${renderBadge("Status", u.frontmatter.status)}</td>
        <td class="py-3 text-sm text-gray-500 dark:text-gray-400">${escapeHtml(deps)}</td>
      </tr>
      ${um.length > 0 ? `<tr><td colspan="5" class="pb-4">${renderMockupEmbeds(um)}</td></tr>` : ""}`;
    })
    .join("");

  const unitsAndDagContent = `
    ${mermaid ? card(`
      ${sectionHeading("Dependency Graph")}
      <div class="overflow-x-auto p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <pre class="mermaid">${mermaid}</pre>
      </div>
    `) : ""}

    ${card(`
      ${sectionHeading("Units")}
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b-2 border-gray-200 dark:border-gray-700">
              <th class="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">#</th>
              <th class="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Name</th>
              <th class="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Discipline</th>
              <th class="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
              <th class="py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Dependencies</th>
            </tr>
          </thead>
          <tbody>${unitRows}</tbody>
        </table>
      </div>
    `)}
  `;

  // Tab 3: Domain Model
  const domainSection = findSectionWithSubs("Domain Model");
  let domainContent = "";
  if (domainSection) {
    domainContent = card(`
      ${sectionHeading("Domain Model")}
      ${renderMarkdownBlock("domain-overview", domainSection.content)}
      ${domainSection.subsections
        .map(
          (sub: Section, i: number) => `
        <div class="mt-6">
          ${sectionHeading(sub.heading, 3)}
          ${renderMarkdownBlock("domain-sub-" + i, sub.content)}
        </div>`,
        )
        .join("")}
    `);
  } else {
    domainContent = card(`
      ${sectionHeading("Domain Model")}
      <p class="text-gray-500 dark:text-gray-400 italic">No domain model defined.</p>
    `);
  }

  // Tab 4: Technical Details
  const gitConfig = intent.frontmatter.git;
  const workflow = intent.frontmatter.workflow;
  const announcements = intent.frontmatter.announcements;
  const contextSection = findSection("Context");

  const technicalContent = `
    ${contextSection ? card(`
      ${sectionHeading("Context")}
      ${renderMarkdownBlock("tech-context", contextSection)}
    `) : ""}

    ${card(`
      ${sectionHeading("Git Configuration")}
      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt class="text-gray-500 dark:text-gray-400">Change Strategy</dt>
          <dd class="font-medium mt-0.5">${escapeHtml(gitConfig.change_strategy)}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">Auto-merge</dt>
          <dd class="font-medium mt-0.5">${gitConfig.auto_merge ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">Auto-squash</dt>
          <dd class="font-medium mt-0.5">${gitConfig.auto_squash ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">Workflow</dt>
          <dd class="font-medium mt-0.5">${escapeHtml(workflow)}</dd>
        </div>
      </dl>
    `)}

    ${announcements.length > 0 ? card(`
      ${sectionHeading("Announcements")}
      <ul class="space-y-2">
        ${announcements.map((a: string) => `<li class="flex items-start gap-2">
          <span class="text-blue-500 mt-0.5" aria-hidden="true">&#8226;</span>
          <span>${escapeHtml(a)}</span>
        </li>`).join("")}
      </ul>
    `) : ""}
  `;

  const tabs: TabDef[] = [
    { id: "overview", label: "Overview", content: overviewContent },
    { id: "units-dag", label: "Units & DAG", content: unitsAndDagContent },
    { id: "domain", label: "Domain Model", content: domainContent },
    { id: "technical", label: "Technical Details", content: technicalContent },
  ];

  return `
    ${renderTabs("intent", tabs)}
    ${renderDecisionForm(sessionId)}
  `;
}
