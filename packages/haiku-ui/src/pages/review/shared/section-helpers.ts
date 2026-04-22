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

/** Simple client-side markdown to HTML using remark.
 *  InlineComments needs raw HTML, so we use remark instead of react-markdown. */
export function markdownToSimpleHtml(md: string): string {
	return remark().use(remarkGfm).use(remarkHtml).processSync(md).toString()
}
