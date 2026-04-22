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
 * Simple client-side markdown to HTML using remark, sanitized with DOMPurify.
 *
 * InlineComments needs raw HTML (it wires up text-selection handlers against
 * real DOM nodes), so we can't use react-markdown. But `remark-html` preserves
 * raw embedded HTML in markdown (`sanitize: false` is the default), which
 * means anything in the source markdown — `<script>`, `<img onerror>`,
 * `<iframe>`, event-handler attributes — would flow straight into
 * `dangerouslySetInnerHTML`. The call sites here include content written by
 * agents (intent.md, knowledge files, output artifacts) and reviewers, none
 * of which is a trust boundary we can rely on.
 *
 * DOMPurify strips script tags, inline event handlers, `javascript:` URIs,
 * and other active content, leaving safe markup (headings, paragraphs,
 * lists, links, code blocks, tables) intact.
 */
export function markdownToSimpleHtml(md: string): string {
	const rawHtml = remark()
		.use(remarkGfm)
		.use(remarkHtml)
		.processSync(md)
		.toString()
	return DOMPurify.sanitize(rawHtml)
}
