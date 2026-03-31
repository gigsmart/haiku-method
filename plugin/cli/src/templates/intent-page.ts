import type { ParsedIntent, ParsedUnit, CriterionItem, Section } from "@ai-dlc/shared";
import { markdownToHtml } from "@ai-dlc/shared";
import { escapeHtml, escapeAttr } from "./layout.js";
import {
  renderTabs,
  renderBadge,
  renderCriteriaChecklist,
  renderMermaidBlock,
  renderMockupEmbed,
  card,
  sectionHeading,
  type TabDef,
} from "./components.js";

export interface MockupRef {
  label: string;
  src: string;
}

export function renderIntentPage(
  intent: ParsedIntent,
  units: ParsedUnit[],
  criteria: CriterionItem[],
  mermaid: string,
  mockups: MockupRef[],
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
      ${renderBadge("Type", "intent")}
      ${renderBadge("Status", intent.frontmatter.status)}
    </div>

    ${problem ? card(`
      ${sectionHeading("Problem")}
      <div class="prose prose-sm dark:prose-invert max-w-none">${markdownToHtml(problem)}</div>
    `) : ""}

    ${solution ? card(`
      ${sectionHeading("Solution")}
      <div class="prose prose-sm dark:prose-invert max-w-none">${markdownToHtml(solution)}</div>
    `) : ""}

    ${criteria.length > 0 ? card(`
      ${sectionHeading("Success Criteria")}
      ${renderCriteriaChecklist(criteria)}
    `) : ""}

    ${mockups.length > 0 ? card(`
      ${sectionHeading("Mockups")}
      ${renderMockupEmbed(mockups)}
    `) : ""}
  `;

  // Tab 2: Units & DAG
  const unitRows = units
    .map((u) => {
      const deps = u.frontmatter.depends_on?.length
        ? u.frontmatter.depends_on.join(", ")
        : "\u2014";
      return `<tr class="border-b border-gray-100 dark:border-gray-800">
        <td class="py-3 pr-3 font-mono text-sm text-gray-500 dark:text-gray-400">${u.number.toString().padStart(2, "0")}</td>
        <td class="py-3 pr-3 font-medium">
          <a href="units/${escapeAttr(u.slug)}.html" class="text-blue-600 dark:text-blue-400 hover:underline">${escapeHtml(u.title)}</a>
        </td>
        <td class="py-3 pr-3 text-sm">${escapeHtml(u.frontmatter.discipline)}</td>
        <td class="py-3 pr-3">${renderBadge("Status", u.frontmatter.status)}</td>
        <td class="py-3 text-sm text-gray-500 dark:text-gray-400">${escapeHtml(deps)}</td>
      </tr>`;
    })
    .join("");

  const unitsAndDagContent = `
    ${mermaid ? card(`
      ${sectionHeading("Dependency Graph")}
      ${renderMermaidBlock(mermaid)}
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
      <div class="prose prose-sm dark:prose-invert max-w-none">${markdownToHtml(domainSection.content)}</div>
      ${domainSection.subsections
        .map(
          (sub: Section) => `
        <div class="mt-6">
          ${sectionHeading(sub.heading, 3)}
          <div class="prose prose-sm dark:prose-invert max-w-none">${markdownToHtml(sub.content)}</div>
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
  const announcements = intent.frontmatter.announcements ?? [];
  const contextSection = findSection("Context");

  const technicalContent = `
    ${contextSection ? card(`
      ${sectionHeading("Context")}
      <div class="prose prose-sm dark:prose-invert max-w-none">${markdownToHtml(contextSection)}</div>
    `) : ""}

    ${gitConfig ? card(`
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
    `) : ""}

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

  return renderTabs("intent", tabs);
}
