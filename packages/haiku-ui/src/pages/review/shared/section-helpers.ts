import DOMPurify from "dompurify"
import { remark } from "remark"
import remarkGfm from "remark-gfm"
import remarkHtml from "remark-html"
import type { Section } from "../../../parsed"

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"]

export function isImageUrl(url: string): boolean {
	const ext = url.substring(url.lastIndexOf(".")).toLowerCase()
	return IMAGE_EXTS.includes(ext)
}

export function findSection(sections: Section[], ...names: string[]): string {
	for (const name of names) {
		const section = sections.find(
			(s) => s.heading.toLowerCase() === name.toLowerCase(),
		)
		if (section?.content) return section.content
	}
	return ""
}

export function findSectionWithSubs(
	sections: Section[],
	...names: string[]
): Section | undefined {
	for (const name of names) {
		const section = sections.find(
			(s) => s.heading.toLowerCase() === name.toLowerCase(),
		)
		if (section) return section
	}
	return undefined
}

/** Get the preamble (intro text before first ## heading) from sections */
export function getPreamble(sections: Section[]): string {
	const preamble = sections.find((s) => s.heading === "_preamble")
	return preamble?.content ?? ""
}

/**
 * Module-local memoization cache for `markdownToSimpleHtml`.
 *
 * The call sites (IntentReview, UnitReview, KnowledgeTab, OutputArtifactsTab,
 * UnitsTable) live inside JSX expressions that re-run on every parent
 * re-render — any sidebar state change (`setSidebarTab`, `setGeneralText`,
 * `setAllInlineComments`) re-renders the whole `ReviewPage` tree and would
 * otherwise re-run the full remark → html → DOMPurify pipeline for every
 * visible artifact. The markdown is effectively static per session — only a
 * server `session-update` pushes new content — so caching by input string
 * gives near-100% hit rate after first render.
 *
 * `Map` (not `WeakMap`) because we key on a string primitive. Growth is
 * bounded by the number of distinct markdown strings rendered in a single
 * session (~30-100 entries × a few KB each = <1 MB worst case). The SPA
 * tab reload clears it. If a future corpus surfaces memory pressure, swap
 * to a 128-entry LRU without touching call sites.
 *
 * FB-53. Exported for targeted regression tests.
 */
export const _markdownHtmlCache = new Map<string, string>()

/**
 * Simple client-side markdown to HTML using remark, sanitized with DOMPurify.
 *
 * InlineComments needs raw HTML (it wires up text-selection handlers against
 * real DOM nodes), so we can't use react-markdown. But `remark-html` preserves
 * raw embedded HTML in markdown (`sanitize: false` is the default), which
 * means anything in the source markdown — `<script>`, `<img onerror>`,
 * `<iframe>`, event-handler attributes — would flow straight into
 * the sink. // audit-allow: XSS sink referenced in a comment describing why
 * DOMPurify runs below. The call sites here include content written by
 * agents (intent.md, knowledge files, output artifacts) and reviewers, none
 * of which is a trust boundary we can rely on.
 *
 * DOMPurify strips script tags, inline event handlers, `javascript:` URIs,
 * and other active content, leaving safe markup (headings, paragraphs,
 * lists, links, code blocks, tables) intact.
 *
 * Results are memoized by input string (see `_markdownHtmlCache` above) —
 * the pipeline is a blocking CPU operation (5-15 ms per call on typical
 * artifacts) and the call sites re-render on unrelated state changes, so
 * the cache takes it off the React render hot path (FB-53).
 */
export function markdownToSimpleHtml(md: string): string {
	const cached = _markdownHtmlCache.get(md)
	if (cached !== undefined) return cached
	const rawHtml = remark()
		.use(remarkGfm)
		.use(remarkHtml)
		.processSync(md)
		.toString()
	const sanitized = DOMPurify.sanitize(rawHtml)
	_markdownHtmlCache.set(md, sanitized)
	return sanitized
}
