#!/usr/bin/env node
/**
 * audit-touch-targets.mjs — headless-browser walk of the built SPA. Every
 * interactive element (role=button, button, role=switch, [tabindex="0"],
 * a[href], input, select, textarea) must have an effective hit-area of at
 * least 44×44 CSS px on a 375×667 mobile viewport.
 *
 * The effective hit area includes the transparent `::before` pseudo-element
 * extension pattern documented at `touch-target-audit.md §2` — an element
 * whose visible width/height is below 44px passes if its `::before` is
 * ≥ 44×44 absolutely-positioned.
 *
 * Exit codes:
 *   0 — every interactive element meets the 44×44 effective hit area floor
 *   1 — one or more elements fail; per-element report printed + JSON report
 *   2 — playwright boot / dist-not-found error
 *
 * Report: packages/haiku-ui/reports/touch-targets.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, "..")
const REPORTS_DIR = path.join(PACKAGE_DIR, "reports")
const DIST_DIR = path.join(PACKAGE_DIR, "dist")

const MIN_SIZE = 44 // CSS px on a 375×667 mobile viewport

async function loadInlinedHtml() {
	const distHtml = path.join(DIST_DIR, "index.html")
	let html = await readFile(distHtml, "utf8")
	const scriptRe = /<script\b[^>]*\bsrc="\/assets\/([^"]+)"[^>]*><\/script>/g
	const linkRe = /<link\b[^>]*\bhref="\/assets\/([^"]+\.css)"[^>]*>/g
	html = html.replace(scriptRe, (m, filename) => {
		const p = path.join(DIST_DIR, "assets", filename)
		if (!fs.existsSync(p)) return m
		return `<script type="module">${fs.readFileSync(p, "utf8")}</script>`
	})
	html = html.replace(linkRe, (m, filename) => {
		const p = path.join(DIST_DIR, "assets", filename)
		if (!fs.existsSync(p)) return m
		return `<style>${fs.readFileSync(p, "utf8")}</style>`
	})
	return html
}

async function main() {
	let html
	try {
		html = await loadInlinedHtml()
	} catch (err) {
		console.error(
			`audit-touch-targets · cannot load ${path.join(DIST_DIR, "index.html")}. Run \`npm run build\` first.`,
		)
		console.error(err instanceof Error ? err.message : String(err))
		process.exit(2)
	}

	let playwright
	try {
		playwright = await import("playwright")
	} catch (err) {
		console.error(
			"audit-touch-targets · playwright not installed. Run `bun install` or `npm install` at the repo root.",
		)
		console.error(err instanceof Error ? err.message : String(err))
		process.exit(2)
	}

	const server = http.createServer((req, res) => {
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
		res.end(html)
	})
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	const port = server.address().port

	const routes = [
		{ path: "/", label: "home" },
		{ path: "/review/example-session", label: "review" },
		{ path: "/question/example-session", label: "question" },
		{ path: "/direction/example-session", label: "direction" },
	]

	const failures = []
	const scanned = []

	try {
		const browser = await playwright.chromium.launch({ headless: true })
		try {
			const context = await browser.newContext({
				viewport: { width: 375, height: 667 },
			})
			const page = await context.newPage()
			await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle" })
			await page.waitForTimeout(1500)

			for (const r of routes) {
				await page.evaluate((href) => {
					window.history.replaceState({}, "", href)
					window.dispatchEvent(new PopStateEvent("popstate"))
				}, r.path)
				await page.waitForTimeout(300)

				const elements = await page.evaluate((MIN) => {
					const selector = [
						'[role="button"]',
						'[role="switch"]',
						"button",
						'[tabindex="0"]',
						"a[href]",
						"input:not([type=hidden])",
						"select",
						"textarea",
					].join(",")
					const nodes = Array.from(document.querySelectorAll(selector))
					const out = []
					for (const el of nodes) {
						// Skip hidden or zero-area elements.
						const rect = el.getBoundingClientRect()
						if (rect.width === 0 && rect.height === 0) continue
						const cs = getComputedStyle(el)
						if (cs.display === "none" || cs.visibility === "hidden") continue
						// sr-only skip-link exception — elements with the sr-only
						// utility class clip themselves to 1px; they only become
						// visible on :focus and at that point carry their own
						// focus-visible styles. Not a touch-tappable surface.
						if (el.classList && el.classList.contains("sr-only")) continue
						// Inline-text-link exception (WCAG 2.5.8) — <a> whose
						// parent contains flowing prose text (non-link text siblings).
						const isLink = el.tagName.toLowerCase() === "a"
						let prose = false
						if (isLink) {
							let node = el.parentElement
							while (node) {
								const t = node.tagName
								if (t === "P" || t === "BLOCKQUOTE" || t === "LI") {
									prose = true
									break
								}
								if (t === "BODY") break
								node = node.parentElement
							}
							// Also count as prose if the immediate parent has
							// non-whitespace text siblings of the link (i.e. the
							// link is truly inline in flowing content).
							if (!prose && el.parentElement) {
								for (const child of el.parentElement.childNodes) {
									if (child === el) continue
									if (
										child.nodeType === 3 &&
										(child.nodeValue || "").trim()
									) {
										prose = true
										break
									}
								}
							}
						}
						// ::before hit-area extension — if the ::before pseudo is
						// absolutely positioned AND is ≥ 44×44, treat as effective.
						const before = getComputedStyle(el, "::before")
						const beforeIsExt =
							before &&
							before.content &&
							before.content !== "none" &&
							before.position === "absolute" &&
							(Number.parseFloat(before.width) >= MIN ||
								before.width === "auto") &&
							(Number.parseFloat(before.height) >= MIN ||
								before.height === "auto")
						const effectiveW = Math.max(
							rect.width,
							beforeIsExt ? Number.parseFloat(before.width) || 0 : 0,
						)
						const effectiveH = Math.max(
							rect.height,
							beforeIsExt ? Number.parseFloat(before.height) || 0 : 0,
						)
						out.push({
							tag: el.tagName.toLowerCase(),
							role: el.getAttribute("role") || "",
							testid: el.getAttribute("data-testid") || "",
							ariaLabel: el.getAttribute("aria-label") || "",
							textSample: (el.textContent || "").trim().slice(0, 40),
							visibleW: Math.round(rect.width),
							visibleH: Math.round(rect.height),
							effectiveW: Math.round(effectiveW),
							effectiveH: Math.round(effectiveH),
							beforeIsExt,
							prose,
							pass:
								prose ||
								(effectiveW >= MIN && effectiveH >= MIN),
						})
					}
					return out
				}, MIN_SIZE)

				for (const el of elements) {
					scanned.push({ ...el, route: r.label })
					if (!el.pass) {
						failures.push({ ...el, route: r.label })
					}
				}
			}
		} finally {
			await browser.close()
		}
	} finally {
		server.close()
	}

	await mkdir(REPORTS_DIR, { recursive: true })
	const reportPath = path.join(REPORTS_DIR, "touch-targets.json")
	await writeFile(
		reportPath,
		`${JSON.stringify(
			{ scanned: scanned.length, failures },
			null,
			2,
		)}\n`,
	)

	console.log(
		`audit-touch-targets · ${scanned.length} interactive elements · ${failures.length} fail`,
	)
	console.log(`  report: ${path.relative(process.cwd(), reportPath)}`)

	if (failures.length > 0) {
		for (const f of failures) {
			const name =
				f.ariaLabel || f.testid || f.textSample || `${f.tag}[${f.role}]`
			console.error(
				`  FAIL [${f.route}] ${name} — visible ${f.visibleW}×${f.visibleH}, effective ${f.effectiveW}×${f.effectiveH}`,
			)
		}
		process.exit(1)
	}
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(2)
})
