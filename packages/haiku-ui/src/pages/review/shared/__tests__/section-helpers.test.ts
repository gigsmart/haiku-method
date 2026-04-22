import { describe, expect, it } from "vitest"
import { markdownToSimpleHtml } from "../section-helpers"

/**
 * Security regression tests for markdownToSimpleHtml.
 *
 * The function feeds `<InlineComments htmlContent={...} />`, which renders
 * via `dangerouslySetInnerHTML`. The source markdown comes from on-disk
 * artifacts (intent.md, knowledge files, output artifacts) that agents
 * write, so we must not trust it. `remark-html` does NOT sanitize by
 * default — `markdownToSimpleHtml` wraps the pipeline with DOMPurify.
 */
describe("markdownToSimpleHtml sanitization", () => {
	it("strips <script> tags embedded in markdown", () => {
		const md = 'Some text\n\n<script>window.__pwned = true;</script>\n\nmore text'
		const html = markdownToSimpleHtml(md)
		expect(html).not.toContain("<script")
		expect(html).not.toContain("__pwned")
	})

	it("removes inline event handlers on images", () => {
		const md = '![alt](/img.png)\n\n<img src="x" onerror="window.__pwned=true">'
		const html = markdownToSimpleHtml(md)
		expect(html).not.toMatch(/onerror\s*=/i)
		expect(html).not.toContain("__pwned")
	})

	it("removes <iframe> and srcdoc-style embeds", () => {
		const md = '# Title\n\n<iframe srcdoc="<script>alert(1)</script>"></iframe>'
		const html = markdownToSimpleHtml(md)
		expect(html).not.toContain("<iframe")
		expect(html).not.toContain("srcdoc")
	})

	it("strips javascript: URIs from links", () => {
		const md = "[click me](javascript:window.__pwned=true)"
		const html = markdownToSimpleHtml(md)
		expect(html).not.toMatch(/href\s*=\s*["']?javascript:/i)
	})

	it("preserves ordinary markup (headings, lists, code)", () => {
		const md = "# Heading\n\n- item 1\n- item 2\n\n`inline code`\n\n```\nblock\n```"
		const html = markdownToSimpleHtml(md)
		expect(html).toContain("<h1")
		expect(html).toContain("<ul")
		expect(html).toContain("<code")
		expect(html).toContain("item 1")
	})

	it("preserves GFM tables", () => {
		const md = "| a | b |\n|---|---|\n| 1 | 2 |\n"
		const html = markdownToSimpleHtml(md)
		expect(html).toContain("<table")
		expect(html).toContain("<td")
	})
})
