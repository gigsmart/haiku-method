import { markdownToHtml } from "../markdown.js"
import type {
	CriterionItem,
	ParsedIntent,
	ParsedUnit,
	Section,
} from "../types.js"
import { renderAnnotationCanvas } from "./annotation-canvas.js"
import {
	type TabDef,
	card,
	renderBadge,
	renderCriteriaChecklist,
	renderMarkdownBlock,
	renderMockupEmbeds,
	renderReviewSidebar,
	renderReviewSidebarScript,
	renderTabs,
	sectionHeading,
} from "./components.js"
import { renderInlineComments } from "./inline-comments.js"
import { escapeAttr, escapeHtml } from "./layout.js"
import type { MockupInfo } from "./types.js"

export interface ReviewResult {
	body: string
	sidebar: string
	sidebarScript: string
}

export function renderIntentReview(
	intent: ParsedIntent,
	units: ParsedUnit[],
	criteria: CriterionItem[],
	sessionId: string,
	mermaid: string,
	intentMockups: MockupInfo[],
	unitMockups: Map<string, MockupInfo[]>,
): ReviewResult {
	const findSection = (name: string): string => {
		const section = intent.sections.find(
			(s: Section) => s.heading?.toLowerCase() === name.toLowerCase(),
		)
		return section?.content ?? ""
	}

	const findSectionWithSubs = (name: string): Section | undefined => {
		return intent.sections.find(
			(s: Section) => s.heading?.toLowerCase() === name.toLowerCase(),
		)
	}

	const problem = findSection("Problem")
	const solution = findSection("Solution")

	// Tab 1: Overview (with inline comments on text, annotation canvas on mockups)
	const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"]
	function isImageUrl(url: string): boolean {
		const ext = url.substring(url.lastIndexOf(".")).toLowerCase()
		return IMAGE_EXTS.includes(ext)
	}

	// Build inline-commentable text content from problem + solution
	let overviewMarkdown = ""
	if (problem) overviewMarkdown += `## Problem\n\n${problem}\n\n`
	if (solution) overviewMarkdown += `## Solution\n\n${solution}\n\n`

	// Find first image mockup for annotation canvas
	const firstIntentImageMockup = intentMockups.find((m) => isImageUrl(m.url))
	const remainingIntentMockups = intentMockups.filter(
		(m) => m !== firstIntentImageMockup,
	)

	const overviewContent = `
    <div class="flex flex-wrap items-center gap-2 mb-6">
      ${renderBadge("Review type", "intent")}
      ${renderBadge("Status", intent.frontmatter.status)}
    </div>

    ${
			overviewMarkdown
				? card(`
      ${sectionHeading("Overview — Comment on text")}
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">Select text to add inline comments.</p>
      ${renderInlineComments(markdownToHtml(overviewMarkdown))}
    `)
				: ""
		}

    ${
			criteria.length > 0
				? card(`
      ${sectionHeading("Success Criteria")}
      ${renderCriteriaChecklist(criteria)}
    `)
				: ""
		}

    ${
			firstIntentImageMockup
				? card(`
      ${sectionHeading("Mockup — Annotate")}
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-medium text-gray-600 dark:text-gray-400">${escapeHtml(firstIntentImageMockup.label)}</h4>
        <a href="${escapeAttr(firstIntentImageMockup.url)}" target="_blank" rel="noopener noreferrer"
           class="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          Open in new tab &#8599;
        </a>
      </div>
      ${renderAnnotationCanvas(firstIntentImageMockup.url)}
    `)
				: ""
		}

    ${
			remainingIntentMockups.length > 0
				? card(`
      ${sectionHeading(firstIntentImageMockup ? "Additional Mockups" : "Mockups")}
      ${renderMockupEmbeds(remainingIntentMockups)}
    `)
				: ""
		}
  `

	// Tab 2: Units & DAG
	const unitRows = units
		.map((u) => {
			const deps = u.frontmatter.depends_on?.length
				? u.frontmatter.depends_on.join(", ")
				: "—"
			const um = unitMockups.get(u.slug) ?? []
			return `<tr class="border-b border-gray-100 dark:border-gray-800">
        <td class="py-3 pr-3 font-mono text-sm text-gray-500 dark:text-gray-400">${u.number.toString().padStart(2, "0")}</td>
        <td class="py-3 pr-3 font-medium">${escapeHtml(u.title)}</td>
        <td class="py-3 pr-3 text-sm">${escapeHtml(u.frontmatter.discipline ?? u.frontmatter.type ?? "")}</td>
        <td class="py-3 pr-3">${u.frontmatter.model ? renderBadge("Model", u.frontmatter.model) : "—"}</td>
        <td class="py-3 pr-3">${renderBadge("Status", u.frontmatter.status)}</td>
        <td class="py-3 text-sm text-gray-500 dark:text-gray-400">${escapeHtml(deps)}</td>
      </tr>
      ${um.length > 0 ? `<tr><td colspan="6" class="pb-4">${renderMockupEmbeds(um)}</td></tr>` : ""}`
		})
		.join("")

	const unitsAndDagContent = `
    ${
			mermaid
				? card(`
      ${sectionHeading("Dependency Graph")}
      <div class="overflow-x-auto p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <pre class="mermaid">${mermaid}</pre>
      </div>
    `)
				: ""
		}

    ${card(`
      ${sectionHeading("Units")}
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b-2 border-gray-200 dark:border-gray-700">
              <th class="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">#</th>
              <th class="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Name</th>
              <th class="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Discipline</th>
              <th class="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Model</th>
              <th class="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
              <th class="py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Dependencies</th>
            </tr>
          </thead>
          <tbody>${unitRows}</tbody>
        </table>
      </div>
    `)}
  `

	// Tab 3: Domain Model
	const domainSection = findSectionWithSubs("Domain Model")
	let domainContent = ""
	if (domainSection) {
		domainContent = card(`
      ${sectionHeading("Domain Model")}
      ${renderMarkdownBlock("domain-overview", domainSection.content)}
      ${domainSection.subsections
				.map(
					(sub: Section, i: number) => `
        <div class="mt-6">
          ${sectionHeading(sub.heading, 3)}
          ${renderMarkdownBlock(`domain-sub-${i}`, sub.content)}
        </div>`,
				)
				.join("")}
    `)
	} else {
		domainContent = card(`
      ${sectionHeading("Domain Model")}
      <p class="text-gray-500 dark:text-gray-400 italic">No domain model defined.</p>
    `)
	}

	// Tab 4: Technical Details
	const gitConfig = intent.frontmatter.git ?? {
		change_strategy: "",
		auto_merge: false,
		auto_squash: false,
	}
	const workflow = intent.frontmatter.workflow ?? ""
	const announcements = intent.frontmatter.announcements ?? []
	const contextSection = findSection("Context")

	const technicalContent = `
    ${
			contextSection
				? card(`
      ${sectionHeading("Context")}
      ${renderMarkdownBlock("tech-context", contextSection)}
    `)
				: ""
		}

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

    ${
			announcements.length > 0
				? card(`
      ${sectionHeading("Announcements")}
      <ul class="space-y-2">
        ${announcements
					.map(
						(a: string) => `<li class="flex items-start gap-2">
          <span class="text-blue-500 mt-0.5" aria-hidden="true">&#8226;</span>
          <span>${escapeHtml(a)}</span>
        </li>`,
					)
					.join("")}
      </ul>
    `)
				: ""
		}
  `

	const tabs: TabDef[] = [
		{ id: "overview", label: "Overview", content: overviewContent },
		{ id: "units-dag", label: "Units & DAG", content: unitsAndDagContent },
		{ id: "domain", label: "Domain Model", content: domainContent },
		{ id: "technical", label: "Technical Details", content: technicalContent },
	]

	return {
		body: renderTabs("intent", tabs),
		sidebar: renderReviewSidebar(sessionId),
		sidebarScript: renderReviewSidebarScript(sessionId),
	}
}
