// Light markdown + inline-code rendering used inside modals. Mirrors the
// renderers from the original prototype so existing copy lands the same way.

export function escHTML(s: string): string {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
}

/** Render a string with inline backticks → <code> and **bold** → <strong>. */
export function renderInline(s: string): string {
	return escHTML(s)
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/(^|\W)_([^_]+)_(?=\W|$)/g, "$1<em>$2</em>")
}

/** Tiny markdown → HTML renderer (headings / lists / code / bold / blockquotes / hr). */
export function renderMarkdown(src: string | null | undefined): string {
	if (!src) return ""
	const lines = src.split("\n")
	const out: string[] = []
	let inCode = false
	let codeBuf: string[] = []
	let listBuf: string[] = []
	let listType: "ul" | "ol" | null = null

	const flushList = () => {
		if (listBuf.length && listType) {
			out.push(`<${listType}>${listBuf.join("")}</${listType}>`)
			listBuf = []
			listType = null
		}
	}
	const flushCode = () => {
		if (codeBuf.length) {
			out.push(`<pre><code>${escHTML(codeBuf.join("\n"))}</code></pre>`)
			codeBuf = []
		}
	}

	for (const raw of lines) {
		if (/^```/.test(raw.trim())) {
			flushList()
			if (inCode) {
				flushCode()
				inCode = false
			} else {
				inCode = true
			}
			continue
		}
		if (inCode) {
			codeBuf.push(raw)
			continue
		}
		if (raw.trim() === "") {
			flushList()
			continue
		}
		if (/^---+\s*$/.test(raw.trim())) {
			flushList()
			out.push("<hr>")
			continue
		}
		const h = raw.match(/^(#{1,6})\s+(.*)$/)
		if (h) {
			flushList()
			out.push(`<h${h[1].length}>${renderInline(h[2])}</h${h[1].length}>`)
			continue
		}
		const ul = raw.match(/^\s*[-*]\s+(.*)$/)
		if (ul) {
			if (listType !== "ul") {
				flushList()
				listType = "ul"
			}
			listBuf.push(`<li>${renderInline(ul[1])}</li>`)
			continue
		}
		const ol = raw.match(/^\s*\d+\.\s+(.*)$/)
		if (ol) {
			if (listType !== "ol") {
				flushList()
				listType = "ol"
			}
			listBuf.push(`<li>${renderInline(ol[1])}</li>`)
			continue
		}
		if (/^>\s/.test(raw)) {
			flushList()
			out.push(
				`<blockquote>${renderInline(raw.replace(/^>\s/, ""))}</blockquote>`,
			)
			continue
		}
		flushList()
		out.push(`<p>${renderInline(raw)}</p>`)
	}
	flushList()
	flushCode()
	return out.join("\n")
}

/** Abbreviate a long hat name to fit the hat circle. */
export function shortHat(name: string): string {
	if (name.length <= 8) return name
	const parts = name.split(/[-_ ]+/)
	if (parts.length > 1)
		return parts
			.map((p) => p[0] || "")
			.join("")
			.toUpperCase()
	return `${name.slice(0, 6)}…`
}

export function gateClass(opt: string): string {
	if (opt === "approve" || opt === "advance") return "approve"
	if (opt === "request changes") return "reject"
	if (opt === "external") return "external"
	return ""
}

/** Normalize STAGE.md `review:` value into a gate descriptor. */
export function gateFromReview(review: unknown): {
	label: string
	type: string
	options: string[]
} {
	if (!review) return { label: "auto", type: "auto", options: ["advance"] }
	if (Array.isArray(review)) {
		const label = `[${review.join(", ")}]`
		const options: string[] = []
		if (review.includes("ask")) options.push("approve", "request changes")
		if (review.includes("external")) options.push("external")
		if (review.includes("await")) options.push("await")
		return {
			label,
			type: label,
			options: options.length ? options : ["advance"],
		}
	}
	if (review === "ask")
		return {
			label: "ask",
			type: "ask",
			options: ["approve", "request changes"],
		}
	if (review === "external")
		return { label: "external", type: "external", options: ["external"] }
	if (review === "await")
		return { label: "await", type: "await", options: ["await"] }
	return { label: String(review), type: String(review), options: ["advance"] }
}

export function formatInputs(inputs: unknown): string[] {
	if (!Array.isArray(inputs)) return []
	return inputs
		.map((i) => {
			if (!i || typeof i !== "object") return String(i)
			const stage = (i as { stage?: string }).stage ?? ""
			const kind =
				(i as { discovery?: string; output?: string }).discovery ??
				(i as { output?: string }).output ??
				""
			return stage && kind ? `${stage}.${kind}` : kind || stage || ""
		})
		.filter(Boolean) as string[]
}

/** Demo waves/units — illustrative scheduling shape, NOT a real plan. */
export function demoWavesAndUnits(hatCount: number): {
	waves: { label: string; units: string[] }[]
	units: { id: string; model: string }[]
} {
	const models = ["sonnet", "opus", "haiku", "sonnet"]
	const unitCount = Math.max(2, Math.min(4, hatCount >= 3 ? 3 : 2))
	const units = Array.from({ length: unitCount }, (_, i) => ({
		id: `u${i + 1}`,
		model: models[i % models.length] ?? "sonnet",
	}))
	const waves =
		unitCount >= 3
			? [
					{
						label: "wave 1",
						units: units.slice(0, unitCount - 1).map((u) => u.id),
					},
					{
						label: "wave 2",
						units: units.slice(unitCount - 1).map((u) => u.id),
					},
				]
			: [{ label: "wave 1", units: units.map((u) => u.id) }]
	return { waves, units }
}

export function effectiveMode(
	idx: number,
	mode: "continuous" | "discrete" | "hybrid" | "auto",
	continuousFromIdx: number,
): "continuous" | "discrete" | "auto" {
	if (mode === "continuous") return "continuous"
	if (mode === "discrete") return "discrete"
	if (mode === "auto") return "auto"
	return idx < continuousFromIdx ? "discrete" : "continuous"
}

export function branchName(
	stageNameLower: string,
	mode: "continuous" | "discrete" | "auto",
): string {
	return mode === "discrete"
		? `haiku/{slug}/${stageNameLower}`
		: "haiku/{slug}/main"
}

/** Strip a leading frontmatter block (---...---) from raw markdown. */
export function stripFrontmatter(src: string): string {
	if (!src) return ""
	const m = /^---\n[\s\S]*?\n---\n?/.exec(src)
	return m ? src.slice(m[0].length) : src
}

/** Render a frontmatter block + markdown body to a single HTML string for the
 *  modal preview. Frontmatter keys / string scalars are HTML-escaped; arrays
 *  and objects are stringified via JSON. */
export function renderMdFile(file: {
	frontmatter?: Record<string, unknown>
	content?: string | null
	body?: string
}): string {
	const fm = file.frontmatter ?? {}
	const fmEntries = Object.entries(fm).filter(
		([, v]) => v !== undefined && v !== null && v !== "",
	)
	const fmHtml = fmEntries.length
		? `<div class="fm-panel">${fmEntries
				.map(
					([k, v]) =>
						`<div class="fm-row"><span class="fm-key">${escHTML(k)}</span><span class="fm-val">${renderInline(
							typeof v === "string" ? v : JSON.stringify(v),
						)}</span></div>`,
				)
				.join("")}</div>`
		: ""
	const body = file.body ?? stripFrontmatter(file.content ?? "")
	return `${fmHtml}<div class="md-content">${renderMarkdown(body)}</div>`
}
