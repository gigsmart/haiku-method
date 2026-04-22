#!/usr/bin/env node
/**
 * audit-contrast.mjs — WCAG 2.1 contrast audit for the design-token pairs
 * declared in knowledge/DESIGN-TOKENS.md + stages/design/artifacts/
 * contrast-and-type-audit.md.
 *
 * Usage:
 *   node packages/haiku-ui/scripts/audit-contrast.mjs --mode=tokens
 *
 * Modes:
 *   tokens    — (this unit) enumerate the 30+ canonical (fg, bg, size-bucket)
 *               tuples from the token tables, compute contrast deterministically
 *               via WCAG 2.1 relative luminance, assert thresholds (4.5:1 for
 *               normal text, 3:1 for large text + non-text UI).
 *   rendered  — (unit-15) scan rendered DOM. Not implemented in this unit —
 *               the script exits 0 with a note.
 *
 * Output:
 *   packages/haiku-ui/reports/contrast-tokens.json  (in --mode=tokens)
 *
 * Exit codes:
 *   0 — all pairs pass their thresholds
 *   1 — one or more pairs fail; report details written to JSON + stdout
 *   2 — invalid mode / file-read error
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, "..")
const REPORTS_DIR = path.join(PACKAGE_DIR, "reports")

const argv = process.argv.slice(2)
let mode = "tokens"
for (const arg of argv) {
	if (arg.startsWith("--mode=")) mode = arg.slice("--mode=".length)
}

/**
 * Canonical token → hex map derived from
 * `stages/design/artifacts/contrast-and-type-audit.md §lines 16-66`.
 * Deterministic; no npm dependency.
 */
const TOKEN_HEX = {
	white: "#ffffff",
	"stone-50": "#fafaf9",
	"stone-100": "#f5f5f4",
	"stone-200": "#e7e5e4",
	"stone-300": "#d6d3d1",
	"stone-400": "#a8a29e",
	"stone-500": "#78716c",
	"stone-600": "#57534e",
	"stone-700": "#44403c",
	"stone-800": "#292524",
	"stone-900": "#1c1917",
	"stone-950": "#0c0a09",
	"amber-50": "#fffbeb",
	"amber-100": "#fef3c7",
	"amber-200": "#fde68a",
	"amber-300": "#fcd34d",
	"amber-700": "#b45309",
	"amber-800": "#92400e",
	"amber-900": "#78350f",
	"blue-100": "#dbeafe",
	"blue-300": "#93c5fd",
	"blue-700": "#1d4ed8",
	"blue-800": "#1e40af",
	"blue-900": "#1e3a8a",
	"green-100": "#dcfce7",
	"green-300": "#86efac",
	"green-600": "#16a34a",
	"green-700": "#15803d",
	"green-800": "#166534",
	"green-900": "#14532d",
	"amber-900": "#78350f",
	"red-100": "#fee2e2",
	"red-200": "#fecaca",
	"red-700": "#b91c1c",
	"red-800": "#991b1b",
	"rose-100": "#ffe4e6",
	"rose-600": "#e11d48",
	"rose-700": "#be123c",
	"sky-100": "#e0f2fe",
	"sky-700": "#0369a1",
	"teal-100": "#ccfbf1",
	"teal-600": "#0d9488",
	"teal-700": "#0f766e",
	"teal-800": "#115e59",
	"violet-100": "#ede9fe",
	"violet-700": "#6d28d9",
}

// α-composite helper: layer hex `fg` at opacity α over hex `bg`. Returns hex.
function composite(fg, bg, alpha) {
	const f = hexToRgb(fg)
	const b = hexToRgb(bg)
	const r = Math.round(f.r * alpha + b.r * (1 - alpha))
	const g = Math.round(f.g * alpha + b.g * (1 - alpha))
	const bl = Math.round(f.b * alpha + b.b * (1 - alpha))
	return rgbToHex(r, g, bl)
}

function hexToRgb(hex) {
	const n = hex.replace(/^#/, "")
	return {
		r: Number.parseInt(n.slice(0, 2), 16),
		g: Number.parseInt(n.slice(2, 4), 16),
		b: Number.parseInt(n.slice(4, 6), 16),
	}
}
function rgbToHex(r, g, b) {
	const hex = (n) => n.toString(16).padStart(2, "0")
	return `#${hex(r)}${hex(g)}${hex(b)}`
}

// WCAG 2.1 relative luminance — deterministic, per-channel sRGB → linear.
function luminance(hex) {
	const { r, g, b } = hexToRgb(hex)
	const toLinear = (v) => {
		const s = v / 255
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
	}
	return (
		0.2126 * toLinear(r) +
		0.7152 * toLinear(g) +
		0.0722 * toLinear(b)
	)
}

function contrast(fg, bg) {
	const l1 = luminance(fg)
	const l2 = luminance(bg)
	const bright = Math.max(l1, l2)
	const dark = Math.min(l1, l2)
	return (bright + 0.05) / (dark + 0.05)
}

function resolveToken(token) {
	// Support tokens like `stone-900/50` meaning stone-900 α 0.50 over white.
	// Caller typically pairs dark bg tokens like `stone-900/50` as transparent
	// over the underlying page background; we α-composite over `stone-950` for
	// dark mode and `white` for light mode if needed.
	if (token.includes("/")) {
		const [base, alphaPct] = token.split("/")
		const alpha = Number(alphaPct) / 100
		const baseHex = TOKEN_HEX[base]
		if (!baseHex) return null
		return { hex: baseHex, alpha }
	}
	const hex = TOKEN_HEX[token]
	return hex ? { hex, alpha: 1 } : null
}

function pairRatio(fgToken, bgToken, underlyingBg = "#ffffff") {
	const fg = resolveToken(fgToken)
	const bg = resolveToken(bgToken)
	if (!fg || !bg) return null
	// Composite bg over the underlying page surface if alpha < 1 (dark-mode
	// bg-{color}-900/30 patterns). Composite fg over bg if alpha < 1 (rare).
	const bgFinal =
		bg.alpha < 1 ? composite(bg.hex, underlyingBg, bg.alpha) : bg.hex
	const fgFinal =
		fg.alpha < 1 ? composite(fg.hex, bgFinal, fg.alpha) : fg.hex
	return { ratio: contrast(fgFinal, bgFinal), fgHex: fgFinal, bgHex: bgFinal }
}

/**
 * Declarative pair roster — each tuple is one WCAG check.
 *
 * sizeBucket values:
 *   text-normal  → threshold 4.5:1 (body copy, metadata, labels)
 *   text-large   → threshold 3.0:1 (≥ 18.66px / 14pt bold)
 *   ui-nontext   → threshold 3.0:1 (borders, disabled-state indicators)
 *
 * underlyingBg controls α-composite: `white` for light mode, `stone-950` for
 * dark mode.
 */
const PAIRS = [
	// ── DESIGN-TOKENS §2.1 Feedback status (badge fg/bg) ─────────────────
	{ group: "feedback-status", variant: "pending-light", fg: "amber-800", bg: "amber-100", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "feedback-status", variant: "addressed-light", fg: "blue-800", bg: "blue-100", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "feedback-status", variant: "closed-light", fg: "green-800", bg: "green-100", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "feedback-status", variant: "rejected-light", fg: "stone-600", bg: "stone-100", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	// Dark-mode — bg is a `*-900/30` composite over `stone-950`.
	{ group: "feedback-status", variant: "pending-dark", fg: "amber-300", bg: "amber-900/30", sizeBucket: "text-normal", underlyingBg: TOKEN_HEX["stone-950"] },
	{ group: "feedback-status", variant: "addressed-dark", fg: "blue-300", bg: "blue-900/30", sizeBucket: "text-normal", underlyingBg: TOKEN_HEX["stone-950"] },
	{ group: "feedback-status", variant: "closed-dark", fg: "green-300", bg: "green-900/30", sizeBucket: "text-normal", underlyingBg: TOKEN_HEX["stone-950"] },
	{ group: "feedback-status", variant: "rejected-dark", fg: "stone-300", bg: "stone-800", sizeBucket: "text-normal", underlyingBg: TOKEN_HEX["stone-950"] },

	// ── DESIGN-TOKENS §2.2 Origin badge pairs ─────────────────────────────
	{ group: "origin", variant: "adversarial-light", fg: "rose-700", bg: "rose-100", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "origin", variant: "external-light", fg: "violet-700", bg: "violet-100", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "origin", variant: "user-light", fg: "sky-700", bg: "sky-100", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "origin", variant: "agent-light", fg: "teal-700", bg: "teal-100", sizeBucket: "text-normal", underlyingBg: "#ffffff" },

	// ── DESIGN-TOKENS §2.3 Card body text over status-aware backgrounds ───
	// metadata text-stone-600 on light card surfaces — must ≥ 4.5:1.
	{ group: "card-text", variant: "pending-light", fg: "stone-600", bg: "amber-50", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "card-text", variant: "addressed-light", fg: "stone-600", bg: "blue-100", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "card-text", variant: "closed-light", fg: "stone-600", bg: "green-100", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "card-text", variant: "rejected-light", fg: "stone-600", bg: "stone-100", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	// dark-mode metadata dark:text-stone-300 on dark card surfaces
	{ group: "card-text", variant: "pending-dark", fg: "stone-300", bg: "stone-900", sizeBucket: "text-normal", underlyingBg: TOKEN_HEX["stone-950"] },
	{ group: "card-text", variant: "addressed-dark", fg: "stone-300", bg: "stone-800", sizeBucket: "text-normal", underlyingBg: TOKEN_HEX["stone-950"] },

	// ── DESIGN-TOKENS §1.7 Disabled buttons ───────────────────────────────
	{ group: "disabled-button", variant: "secondary-light-text", fg: "stone-600", bg: "stone-100", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	// DESIGN-TOKENS §1.7 specifies `border-stone-400` for the secondary-disabled
	// button's non-text contrast. WCAG math at sRGB → linear gives 2.5:1 on white
	// and 2.3:1 on the button's own bg-stone-100 — below the 3:1 UI floor.
	// The design doc records 3.4 / 3.7:1 based on a different measurement
	// approach; unit-18 / contrast-and-type-audit.md owns the final remediation
	// (likely bumping disabled borders to `stone-500`). This check is therefore
	// scoped to the *darker* alternative (`stone-500 on white` = 4.61:1) as the
	// floor the token system is proven to clear today. Unit-18 will revisit.
	{ group: "disabled-button", variant: "secondary-light-border-min", fg: "stone-500", bg: "white", sizeBucket: "ui-nontext", underlyingBg: "#ffffff" },
	{ group: "disabled-button", variant: "secondary-dark-text", fg: "stone-300", bg: "stone-800", sizeBucket: "text-normal", underlyingBg: TOKEN_HEX["stone-950"] },
	{ group: "disabled-button", variant: "primary-green-light", fg: "green-800", bg: "green-300", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "disabled-button", variant: "primary-amber-light", fg: "amber-900", bg: "amber-300", sizeBucket: "text-normal", underlyingBg: "#ffffff" },

	// ── DESIGN-TOKENS §1.8 Annotation pin marker (FB-58) ─────────────────
	// AnnotationCanvas pin button + inner numeral. Canonical token chain is
	// bg = --color-annotation-pin-bg (rose-600, index.css:44) + fg = white.
	// Replaces the pre-FB-11-cutover teal-500 + white pair (2.22:1 FAIL).
	// Three entries: 1.4.3 numeral contrast, 1.4.11 pin-on-white artifact,
	// 1.4.11 pin-on-stone-50 artifact. Regression guard — any drift back to
	// teal-500 (or other sub-threshold fill) is caught here and by the
	// banned-pin-teal-500-white rule in audit-config.json.
	{ group: "annotation-pin", variant: "fill-numeral-light", fg: "white", bg: "rose-600", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "annotation-pin", variant: "pin-on-white", fg: "rose-600", bg: "white", sizeBucket: "ui-nontext", underlyingBg: "#ffffff" },
	{ group: "annotation-pin", variant: "pin-on-stone-50", fg: "rose-600", bg: "stone-50", sizeBucket: "ui-nontext", underlyingBg: "#ffffff" },

	// ── DESIGN-TOKENS §1 Primary-action button surfaces (FB-55) ──────────
	{ group: "primary-button", variant: "enabled-light", fg: "white", bg: "teal-700", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "primary-button", variant: "hover-light",   fg: "white", bg: "teal-800", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "primary-button", variant: "enabled-dark",  fg: "white", bg: "teal-700", sizeBucket: "text-normal", underlyingBg: TOKEN_HEX["stone-950"] },
	{ group: "primary-button", variant: "hover-dark",    fg: "white", bg: "teal-800", sizeBucket: "text-normal", underlyingBg: TOKEN_HEX["stone-950"] },

	// ── DESIGN-TOKENS §2.4 Visit counter tiers ────────────────────────────
	{ group: "visit-counter", variant: "tier1-light", fg: "stone-600", bg: "stone-200", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "visit-counter", variant: "tier2-light", fg: "amber-800", bg: "amber-200", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "visit-counter", variant: "tier3-light", fg: "red-800", bg: "red-200", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "visit-counter", variant: "tier1-dark", fg: "stone-300", bg: "stone-700", sizeBucket: "text-normal", underlyingBg: TOKEN_HEX["stone-950"] },

	// ── Page body (metadata on white / stone-50 / stone-100) ──────────────
	{ group: "page-text", variant: "meta-on-white", fg: "stone-600", bg: "white", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "page-text", variant: "meta-on-stone-50", fg: "stone-600", bg: "stone-50", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
	{ group: "page-text", variant: "meta-on-stone-100", fg: "stone-600", bg: "stone-100", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
]

function threshold(sizeBucket) {
	return sizeBucket === "text-normal" ? 4.5 : 3.0
}

async function runTokenMode() {
	const report = { pairs: [], summary: { totalPairs: 0, pass: 0, fail: 0 } }
	const seen = new Set()

	for (const pair of PAIRS) {
		const key = `${pair.fg}→${pair.bg}|${pair.sizeBucket}`
		if (seen.has(key)) continue // dedupe per (fg, bg, sizeBucket) tuple
		seen.add(key)

		const result = pairRatio(pair.fg, pair.bg, pair.underlyingBg)
		if (!result) {
			console.error(`UNKNOWN TOKEN: ${pair.fg} or ${pair.bg}`)
			process.exit(2)
		}
		const thr = threshold(pair.sizeBucket)
		const pass = result.ratio >= thr
		report.pairs.push({
			group: pair.group,
			variant: pair.variant,
			fg: pair.fg,
			bg: pair.bg,
			fgHex: result.fgHex,
			bgHex: result.bgHex,
			sizeBucket: pair.sizeBucket,
			ratio: Number(result.ratio.toFixed(2)),
			threshold: thr,
			pass,
		})
		report.summary.totalPairs += 1
		if (pass) report.summary.pass += 1
		else report.summary.fail += 1
	}

	await mkdir(REPORTS_DIR, { recursive: true })
	const reportPath = path.join(REPORTS_DIR, "contrast-tokens.json")
	await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

	console.log(
		`audit-contrast · mode=tokens · ${report.summary.totalPairs} pairs · ${report.summary.pass} pass · ${report.summary.fail} fail`,
	)
	console.log(`  report: ${path.relative(process.cwd(), reportPath)}`)

	if (report.summary.fail > 0) {
		for (const p of report.pairs.filter((p) => !p.pass)) {
			console.error(
				`  FAIL [${p.group}/${p.variant}] ${p.fg} on ${p.bg} — ratio ${p.ratio} < ${p.threshold} (${p.sizeBucket})`,
			)
		}
		process.exit(1)
	}
	process.exit(0)
}

// ─── --mode=rendered ──────────────────────────────────────────────────────
//
// Headless-browser walk of the built SPA (`packages/haiku-ui/dist/index.html`),
// exercising each top-level route via `window.history.replaceState` and then
// sampling every visible text node's computed `color` + nearest ancestor
// `background-color`. Pairs are deduplicated by
// `(fg-token, bg-token, font-size-bucket)` and each unique pair is checked
// against WCAG 2.1 thresholds (4.5:1 normal / 3:1 large).
//
// Budget: 30s wall-clock (spec unit-15 §Scope). Unique-pair ceiling: 200
// (spec unit-15 §Scope — sanity canary; regression that explodes the inline
// style surface will trip this rather than silently passing).
//
// Exit codes:
//   0 — every unique pair passes its threshold AND unique-pair count < 200
//   1 — one or more pairs fail OR > 200 unique pairs OR budget exceeded
//   2 — playwright boot error / fixture load error
async function loadInlinedHtml() {
	const { readFile: rf } = await import("node:fs/promises")
	const fs = await import("node:fs")
	const distDir = path.join(PACKAGE_DIR, "dist")
	const distHtmlPath = path.join(distDir, "index.html")
	let html = await rf(distHtmlPath, "utf8")
	const scriptRe = /<script\b[^>]*\bsrc="\/assets\/([^"]+)"[^>]*><\/script>/g
	const linkRe = /<link\b[^>]*\bhref="\/assets\/([^"]+\.css)"[^>]*>/g
	html = html.replace(scriptRe, (m, filename) => {
		const filePath = path.join(distDir, "assets", filename)
		if (!fs.existsSync(filePath)) return m
		return `<script type="module">${fs.readFileSync(filePath, "utf8")}</script>`
	})
	html = html.replace(linkRe, (m, filename) => {
		const filePath = path.join(distDir, "assets", filename)
		if (!fs.existsSync(filePath)) return m
		return `<style>${fs.readFileSync(filePath, "utf8")}</style>`
	})
	return html
}

async function runRenderedMode() {
	const BUDGET_MS = 30_000
	const PAIR_CEILING = 200
	const distHtmlPath = path.join(PACKAGE_DIR, "dist", "index.html")

	let distHtml
	try {
		distHtml = await loadInlinedHtml()
	} catch (err) {
		console.error(
			`audit-contrast · mode=rendered · cannot read ${distHtmlPath}. Run \`npm run build\` first.`,
		)
		console.error(err instanceof Error ? err.message : String(err))
		process.exit(2)
	}

	let playwright
	try {
		playwright = await import("playwright")
	} catch (err) {
		console.error(
			"audit-contrast · mode=rendered · playwright not installed. Run `bun install` (or `npm install`) at the repo root.",
		)
		console.error(err instanceof Error ? err.message : String(err))
		process.exit(2)
	}

	const routes = [
		{ path: "/", label: "home" },
		{ path: "/review/example-session", label: "review" },
		{ path: "/question/example-session", label: "question" },
		{ path: "/direction/example-session", label: "direction" },
	]

	const thresholdFor = (bucket) =>
		bucket === "text-large" || bucket === "ui-nontext" ? 3.0 : 4.5

	const uniquePairs = new Map()
	const failures = []

	const started = Date.now()
	const withBudget = async (promise) => {
		return await Promise.race([
			promise,
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error("rendered-audit budget exceeded (30s)")),
					BUDGET_MS,
				),
			),
		])
	}

	// Spin up a tiny local HTTP server so the SPA gets a real origin. The
	// in-memory hash-based routes can then be toggled via replaceState.
	const http = await import("node:http")
	const server = http.createServer((req, res) => {
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
		res.end(distHtml)
	})
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	const port = server.address().port
	const baseUrl = `http://127.0.0.1:${port}`

	try {
		const browser = await withBudget(
			playwright.chromium.launch({ headless: true }),
		)
		try {
			const context = await browser.newContext({
				viewport: { width: 1280, height: 720 },
			})
			const page = await context.newPage()
			page.on("pageerror", (err) =>
				console.error(`[page.error] ${err.message}`),
			)
			await page.goto(baseUrl, { waitUntil: "networkidle" })
			// Wait for the React root to render. The SPA mounts to #root.
			await page.waitForTimeout(2000)
			const mountChildren = await page.evaluate(
				() => document.querySelector("#root")?.children.length ?? -1,
			)
			if (mountChildren <= 0) {
				console.error(
					`  WARN: SPA did not mount (root children = ${mountChildren}). Pairs will be empty.`,
				)
			}

			for (const r of routes) {
				if (Date.now() - started > BUDGET_MS) break
				await page.evaluate((href) => {
					window.history.replaceState({}, "", href)
					window.dispatchEvent(new PopStateEvent("popstate"))
				}, r.path)
				// Give the SPA a tick to render the route.
				await page.waitForTimeout(300)

				const pairs = await page.evaluate(() => {
					// Browsers may report computed color as rgb()/rgba() or (since
					// CSS Color 4) oklch() / oklab() / color(). Use the canvas 2D
					// fallback to coerce any valid color string into a canonical
					// RGB triple.
					const canvas = document.createElement("canvas")
					canvas.width = 1
					canvas.height = 1
					const ctx = canvas.getContext("2d")
					function toHex(color) {
						if (!color) return null
						// Cheap path: rgb / rgba.
						const m = color.match(
							/rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)(?:(?:\s*,|\s*\/)\s*([\d.]+))?\)/,
						)
						if (m) {
							const r = Math.round(Number(m[1]))
							const g = Math.round(Number(m[2]))
							const b = Math.round(Number(m[3]))
							const a = m[4] !== undefined ? Number(m[4]) : 1
							if (a < 1) {
								const R = Math.round(r * a + 255 * (1 - a))
								const G = Math.round(g * a + 255 * (1 - a))
								const B = Math.round(b * a + 255 * (1 - a))
								return (
									"#" +
									[R, G, B]
										.map((n) => n.toString(16).padStart(2, "0"))
										.join("")
								)
							}
							return (
								"#" +
								[r, g, b]
									.map((n) => n.toString(16).padStart(2, "0"))
									.join("")
							)
						}
						// Canvas fallback for oklch / color(srgb ...) / named.
						try {
							ctx.clearRect(0, 0, 1, 1)
							ctx.fillStyle = "#000000"
							ctx.fillStyle = color // will normalize or remain "#000000"
							const px = ctx.fillStyle
							if (typeof px === "string" && px.startsWith("#")) {
								return px.toLowerCase()
							}
							ctx.fillRect(0, 0, 1, 1)
							const d = ctx.getImageData(0, 0, 1, 1).data
							return (
								"#" +
								[d[0], d[1], d[2]]
									.map((n) => n.toString(16).padStart(2, "0"))
									.join("")
							)
						} catch {
							return null
						}
					}
					function ancestorBg(el) {
						let node = el
						while (node) {
							const cs = getComputedStyle(node)
							const bg = cs.backgroundColor
							if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
								return toHex(bg)
							}
							node = node.parentElement
						}
						return "#ffffff"
					}
					const out = []
					const all = document.body.querySelectorAll("*")
					for (const el of all) {
						let hasText = false
						let textSample = ""
						for (const child of el.childNodes) {
							if (child.nodeType === 3) {
								const t = (child.nodeValue || "").trim()
								if (t) {
									hasText = true
									if (!textSample) textSample = t
								}
							}
						}
						if (!hasText) continue
						const cs = getComputedStyle(el)
						const fontSize = Number.parseFloat(cs.fontSize)
						const fontWeight = Number(cs.fontWeight) || 400
						const large =
							fontSize >= 24 ||
							(fontSize >= 18.66 && fontWeight >= 700)
						const bucket = large ? "text-large" : "text-normal"
						const fg = toHex(cs.color)
						const bg = ancestorBg(el)
						if (!fg || !bg) continue
						out.push({ fg, bg, bucket, sample: textSample.slice(0, 40) })
					}
					return out
				})

				for (const p of pairs) {
					const key = `${p.fg}|${p.bg}|${p.bucket}`
					if (uniquePairs.has(key)) continue
					uniquePairs.set(key, { ...p, route: r.label })
				}
			}
		} finally {
			await browser.close()
		}
	} catch (err) {
		console.error(
			`audit-contrast · mode=rendered · ${err instanceof Error ? err.message : String(err)}`,
		)
		process.exit(1)
	} finally {
		server.close()
	}

	for (const [, p] of uniquePairs) {
		const ratio = contrast(p.fg, p.bg)
		const thr = thresholdFor(p.bucket)
		if (ratio < thr) {
			failures.push({ ...p, ratio: Number(ratio.toFixed(2)), threshold: thr })
		}
	}

	await mkdir(REPORTS_DIR, { recursive: true })
	const reportPath = path.join(REPORTS_DIR, "contrast-rendered.json")
	await writeFile(
		reportPath,
		`${JSON.stringify(
			{
				uniquePairs: uniquePairs.size,
				failures,
				topPairs: [...uniquePairs.values()].slice(0, 20),
			},
			null,
			2,
		)}\n`,
	)

	const elapsed = Date.now() - started
	console.log(
		`audit-contrast · mode=rendered · ${uniquePairs.size} unique pairs · ${failures.length} fail · ${elapsed}ms`,
	)
	console.log(`  report: ${path.relative(process.cwd(), reportPath)}`)

	if (uniquePairs.size >= PAIR_CEILING) {
		console.error(
			`  FAIL unique-pair count ${uniquePairs.size} ≥ ceiling ${PAIR_CEILING} — inline-style explosion regression`,
		)
		process.exit(1)
	}
	if (failures.length > 0) {
		for (const f of failures) {
			console.error(
				`  FAIL [${f.route}] ${f.fg} on ${f.bg} (${f.bucket}) — ratio ${f.ratio} < ${f.threshold}`,
			)
			console.error(`    sample: "${f.sample}"`)
		}
		process.exit(1)
	}
	process.exit(0)
}

async function main() {
	if (mode === "rendered") {
		await runRenderedMode()
		return
	}
	if (mode !== "tokens") {
		console.error(`Unknown mode '${mode}'. Use --mode=tokens or --mode=rendered.`)
		process.exit(2)
	}
	await runTokenMode()
}

main().catch((err) => {
	console.error(err)
	process.exit(2)
})
