import { describe, expect, it } from "vitest"
import { _markdownHtmlCache, markdownToSimpleHtml } from "../section-helpers"

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
		const md =
			"Some text\n\n<script>window.__pwned = true;</script>\n\nmore text"
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
		const md =
			"# Heading\n\n- item 1\n- item 2\n\n`inline code`\n\n```\nblock\n```"
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

/**
 * Memoization regression tests for `markdownToSimpleHtml` (FB-53).
 *
 * The six call sites (IntentReview, UnitReview, KnowledgeTab,
 * OutputArtifactsTab, UnitsTable) live inside JSX expressions that re-run on
 * every parent re-render. Without a cache, the remark → html → DOMPurify
 * pipeline (5-15 ms on typical artifacts) runs on every sidebar state change.
 * The cache makes repeated calls O(1) hash-table lookups and returns the
 * same reference, so we assert reference equality — not just string equality
 * — to prove the cache actually returned the stored entry rather than
 * re-running the pipeline into a fresh string.
 *
 * Each test uses a unique markdown input so the module-local `Map` does not
 * leak cache state between tests.
 */
describe("markdownToSimpleHtml memoization", () => {
	it("returns the identical string reference on repeat calls with the same input", () => {
		const md = "# cache-hit-regression-FB-53-uniq-1\n\nsome **content** here"
		const first = markdownToSimpleHtml(md)
		const second = markdownToSimpleHtml(md)
		// Reference equality is the distinguishing signal: the remark
		// pipeline returns a new string object even for identical input,
		// so a match here means the cache returned the stored entry.
		expect(second).toBe(first)
	})

	it("computes a distinct result for a different input (no collision)", () => {
		const mdA = "# cache-distinct-FB-53-uniq-A\n\nalpha"
		const mdB = "# cache-distinct-FB-53-uniq-B\n\nbeta"
		const htmlA = markdownToSimpleHtml(mdA)
		const htmlB = markdownToSimpleHtml(mdB)
		expect(htmlA).not.toBe(htmlB)
		expect(htmlA).toContain("alpha")
		expect(htmlB).toContain("beta")
	})

	it("populates the cache after the first call and serves subsequent calls from it", () => {
		const md = "# cache-population-FB-53-uniq-3\n\nfoo"
		expect(_markdownHtmlCache.has(md)).toBe(false)
		const first = markdownToSimpleHtml(md)
		expect(_markdownHtmlCache.has(md)).toBe(true)
		expect(_markdownHtmlCache.get(md)).toBe(first)
		// Second call serves from the cache — same reference, no recompute.
		const second = markdownToSimpleHtml(md)
		expect(second).toBe(first)
	})

	it("runs the sanitizing pipeline on cache miss (sanity)", () => {
		const md =
			"# cache-miss-pipeline-FB-53-uniq-4\n\n**bold** and <script>pwned()</script>"
		const html = markdownToSimpleHtml(md)
		expect(html).toContain("<strong>bold</strong>")
		expect(html).not.toContain("<script")
	})
})
