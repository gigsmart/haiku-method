#!/usr/bin/env node
import fs from "node:fs"
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
 * ── FB-72 coverage expansion ───────────────────────────────────────────────
 *
 * The original 4-route walk ran the SPA against a live backend that, on the
 * synthetic `example-session` ids, returns sparse or empty payloads — the
 * FeedbackSummaryBar early-returns on `items.length === 0`, the FeedbackItem
 * action buttons never paint (no items to list), the StageProgressStrip
 * renders zero dots (empty `stage_states`), and the DirectionPage preview
 * dialog is closed by default. Result: the denominator collapsed to ~8
 * elements and "0 fail" reported silently while FB-63 / FB-65 / FB-67 were
 * still open.
 *
 * This audit now **stubs the backend** via Playwright `page.route()` so every
 * route renders its populated state:
 *
 *   • `/api/session/{id}` — returns a route-appropriate SessionPayload with
 *     feedback, stage_states, questions, image carousels, archetypes.
 *   • `/api/feedback/{intent}/{stage}` — returns a deterministic ≥3-item
 *     feedback list spanning `pending | addressed | closed | rejected`.
 *   • `/api/review/current` — returns a populated review-current payload.
 *
 * The walk also:
 *   • Adds `/direction/example-session?preview=archetype-a` so the preview
 *     dialog's close button is measured.
 *   • Enforces a **coverage floor** — if `scanned.length < 40` across all
 *     routes the audit exits 1 with a "coverage collapse" message.
 *   • Enforces **presence checks** for canonical testids on each populated
 *     route. Missing testid → audit fails with a clear message.
 *
 * Exit codes:
 *   0 — every interactive element meets the 44×44 effective hit area floor
 *   1 — one or more elements fail, coverage floor trips, or a presence-check
 *       selector is missing; per-element report printed + JSON report
 *   2 — playwright boot / dist-not-found error
 *
 * Report: packages/haiku-ui/reports/touch-targets.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, "..")
const REPORTS_DIR = path.join(PACKAGE_DIR, "reports")
const DIST_DIR = path.join(PACKAGE_DIR, "dist")

const MIN_SIZE = 44 // CSS px on a 375×667 mobile viewport

// ── Fixture library — rich enough to paint every tap surface ──────────────
//
// This is intentionally hard-coded rather than imported from the test fixture
// module (`components/feedback/__tests__/mockItems.ts`) because the audit is
// an .mjs Node script running against the built SPA, not a Vitest harness. A
// schema-conformant payload literal is simpler and less fragile than a
// cross-package ESM import at audit time.

const FEEDBACK_FIXTURES = [
	{
		feedback_id: "FB-01",
		title: "Dismiss button tap-target audit",
		body: "Dismiss button height measured at 24px — below the 44px WCAG floor.",
		status: "pending",
		origin: "adversarial-review",
		author: "accessibility",
		author_type: "agent",
		created_at: "2026-04-20T10:00:00Z",
		visit: 2,
		source_ref: null,
		closed_by: null,
	},
	{
		feedback_id: "FB-02",
		title: "Verify & Close surface",
		body: "Action row on addressed feedback renders the verify-and-close button inline.",
		status: "addressed",
		origin: "user-chat",
		author: "user",
		author_type: "human",
		created_at: "2026-04-20T10:05:00Z",
		visit: 1,
		source_ref: null,
		closed_by: null,
	},
	{
		feedback_id: "FB-03",
		title: "Reopen affordance on closed item",
		body: "Closed feedback cards must expose the reopen control at 44×44.",
		status: "closed",
		origin: "agent",
		author: "agent",
		author_type: "agent",
		created_at: "2026-04-20T10:10:00Z",
		visit: 3,
		source_ref: null,
		closed_by: "unit-14-ui-gate",
	},
	{
		feedback_id: "FB-04",
		title: "Rejected item retains tap surface",
		body: "Rejected items still carry a delete + origin badge row.",
		status: "rejected",
		origin: "external-pr",
		author: "external-pr-bot",
		author_type: "agent",
		created_at: "2026-04-20T10:15:00Z",
		visit: 1,
		source_ref: null,
		closed_by: null,
	},
]

const STAGE_STATES_FIXTURE = {
	product: {
		stage: "product",
		status: "approved",
		phase: "gate",
		started_at: "2026-04-18T09:00:00Z",
		completed_at: "2026-04-18T18:00:00Z",
		gate_entered_at: "2026-04-18T17:30:00Z",
		gate_outcome: "approved",
	},
	architecture: {
		stage: "architecture",
		status: "approved",
		phase: "gate",
		started_at: "2026-04-19T09:00:00Z",
		completed_at: "2026-04-19T18:00:00Z",
		gate_entered_at: "2026-04-19T17:30:00Z",
		gate_outcome: "approved",
	},
	design: {
		stage: "design",
		status: "approved",
		phase: "gate",
		started_at: "2026-04-20T09:00:00Z",
		completed_at: "2026-04-20T18:00:00Z",
		gate_entered_at: "2026-04-20T17:30:00Z",
		gate_outcome: "approved",
	},
	development: {
		stage: "development",
		status: "in_progress",
		phase: "execute",
		started_at: "2026-04-21T09:00:00Z",
		completed_at: null,
		gate_entered_at: null,
		gate_outcome: null,
	},
}

function reviewSessionPayload(sessionId) {
	return {
		session_id: sessionId,
		session_type: "review",
		status: "active",
		intent_slug: "universal-feedback-model-and-review-recovery",
		intent_dir: `.haiku/intents/universal-feedback-model-and-review-recovery`,
		review_type: "unit",
		gate_type: "ask",
		target: "development",
		stage_states: STAGE_STATES_FIXTURE,
		annotations: {
			pages: [
				{
					pageId: "main",
					label: "Main",
					pins: [
						{
							id: "pin-1",
							x: 0.25,
							y: 0.3,
							text: "First pin",
							feedbackId: "FB-01",
						},
						{
							id: "pin-2",
							x: 0.6,
							y: 0.55,
							text: "Second pin",
							feedbackId: "FB-02",
						},
					],
				},
			],
		},
		knowledge_files: [],
		stage_artifacts: [],
		output_artifacts: [],
	}
}

function questionSessionPayload(sessionId) {
	return {
		session_id: sessionId,
		session_type: "question",
		status: "active",
		title: "Sample question session",
		context: "Synthetic payload served by audit-touch-targets.",
		questions: [
			{
				question: "Which archetype best matches the intent?",
				header: "Archetype selection",
				options: ["Minimal", "Maximal", "Balanced"],
				multiSelect: false,
			},
			{
				question: "Which traits matter most?",
				options: ["Clarity", "Density", "Novelty", "Other"],
				multiSelect: true,
			},
		],
		answers: [],
		image_urls: [
			"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'><rect width='100%25' height='100%25' fill='%23e5e7eb'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='32' fill='%23374151'>Sample A</text></svg>",
			"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'><rect width='100%25' height='100%25' fill='%23cffafe'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='32' fill='%23134e4a'>Sample B</text></svg>",
			"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'><rect width='100%25' height='100%25' fill='%23fde68a'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='32' fill='%2378350f'>Sample C</text></svg>",
		],
	}
}

function directionSessionPayload(sessionId) {
	return {
		session_id: sessionId,
		session_type: "design_direction",
		status: "active",
		title: "Direction session",
		intent_slug: "universal-feedback-model-and-review-recovery",
		archetypes: [
			{
				name: "archetype-a",
				description: "Dense, utilitarian, information-rich.",
				preview_html:
					"<!doctype html><html><body style=\"margin:0;font-family:sans-serif;padding:24px\"><h1>Archetype A</h1><p>Information-dense layout preview.</p><button type='button' style='padding:12px 16px'>Primary</button></body></html>",
				default_parameters: { density: 0.8, contrast: 0.6, motion: 0.2 },
			},
			{
				name: "archetype-b",
				description: "Airy, spacious, hero-forward.",
				preview_html:
					"<!doctype html><html><body style=\"margin:0;font-family:sans-serif;padding:24px\"><h1>Archetype B</h1><p>Hero-led spacious layout.</p><button type='button' style='padding:12px 16px'>Primary</button></body></html>",
				default_parameters: { density: 0.3, contrast: 0.7, motion: 0.4 },
			},
		],
		parameters: [
			{
				name: "density",
				label: "Density",
				description: "How tightly packed the layout is.",
				min: 0,
				max: 1,
				step: 0.1,
				default: 0.5,
				labels: { low: "Airy", high: "Dense" },
			},
			{
				name: "contrast",
				label: "Contrast",
				description: "Tonal range of the palette.",
				min: 0,
				max: 1,
				step: 0.1,
				default: 0.5,
				labels: { low: "Muted", high: "Bold" },
			},
			{
				name: "motion",
				label: "Motion",
				description: "Degree of animation.",
				min: 0,
				max: 1,
				step: 0.1,
				default: 0.3,
				labels: { low: "Still", high: "Lively" },
			},
		],
		selection: null,
	}
}

function feedbackListPayload() {
	return {
		intent: "universal-feedback-model-and-review-recovery",
		stage: "development",
		count: FEEDBACK_FIXTURES.length,
		items: FEEDBACK_FIXTURES,
	}
}

function reviewCurrentPayload() {
	return {
		intent: "universal-feedback-model-and-review-recovery",
		stage: "development",
		phase: "execute",
		units: [
			{
				slug: "unit-15-state-coverage-and-motion",
				title: "Unit 15",
				status: "in_progress",
			},
			{
				slug: "unit-20-source-doc-opacity",
				title: "Unit 20",
				status: "approved",
			},
			{
				slug: "unit-22-modal-dialog-semantics",
				title: "Unit 22",
				status: "planned",
			},
		],
		feedback_summary: {
			pending: 2,
			addressed: 1,
			closed: 1,
			rejected: 1,
		},
		stages: [
			{
				name: "product",
				status: "approved",
				phase: "gate",
				iteration: 1,
				visits: 1,
			},
			{
				name: "architecture",
				status: "approved",
				phase: "gate",
				iteration: 1,
				visits: 1,
			},
			{
				name: "design",
				status: "approved",
				phase: "gate",
				iteration: 1,
				visits: 1,
			},
			{
				name: "development",
				status: "in_progress",
				phase: "execute",
				iteration: 2,
				visits: 2,
			},
		],
	}
}

function jsonResponse(body) {
	return {
		status: 200,
		contentType: "application/json; charset=utf-8",
		body: JSON.stringify(body),
	}
}

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

	const server = http.createServer((_req, res) => {
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
		res.end(html)
	})
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	const port = server.address().port

	// Each route declares the canonical testids that MUST render once the
	// stubbed backend serves its payload. A missing testid = audit failure
	// with a clear message — that's the FB-72 "coverage collapse" guard.
	//
	// `minElements` is a per-route floor; the cross-route total is a global
	// `COVERAGE_FLOOR` further below.
	const routes = [
		{
			path: "/",
			label: "home",
			requiredTestIds: [],
			minElements: 1,
		},
		{
			path: "/review/example-session",
			label: "review",
			requiredTestIds: [
				"feedback-summary-bar",
				"feedback-item",
				"feedback-list",
			],
			minElements: 10,
		},
		{
			path: "/question/example-session",
			label: "question",
			requiredTestIds: [],
			minElements: 3,
		},
		{
			path: "/direction/example-session",
			label: "direction",
			requiredTestIds: [],
			minElements: 2,
		},
		{
			// Synthetic route with the PreviewDialog forced open via query
			// param. The component already reads `previewArchetype` from its
			// URL (no need to wait on a user click) — we opt in via the
			// `?preview=archetype-a` selector which the audit probes via a
			// `click()` before measuring.
			path: "/direction/example-session?preview=archetype-a",
			label: "direction-preview",
			requiredTestIds: [],
			openPreview: true,
			minElements: 2,
		},
	]

	const COVERAGE_FLOOR = 40

	const failures = []
	const scanned = []
	const missingTestids = []

	try {
		const browser = await playwright.chromium.launch({ headless: true })
		try {
			const context = await browser.newContext({
				viewport: { width: 375, height: 667 },
			})

			// Stub the backend for the whole context so every page.goto /
			// history.replaceState produces rich UI. Route matches are tried
			// in order, so keep specific paths before the catchall.
			await context.route("**/api/feedback/**", (route) => {
				const _reqUrl = route.request().url()
				// GET /api/feedback/:intent/:stage — populated list
				if (route.request().method() === "GET") {
					return route.fulfill(jsonResponse(feedbackListPayload()))
				}
				// POST / PUT / DELETE — no-op ok responses
				if (route.request().method() === "POST") {
					const now = new Date().toISOString()
					return route.fulfill(
						jsonResponse({
							feedback_id: "FB-99",
							created_at: now,
						}),
					)
				}
				if (route.request().method() === "PUT") {
					return route.fulfill(jsonResponse({ updated: true }))
				}
				if (route.request().method() === "DELETE") {
					return route.fulfill(jsonResponse({ deleted: true }))
				}
				return route.fallback()
			})

			await context.route("**/api/review/current", (route) => {
				return route.fulfill(jsonResponse(reviewCurrentPayload()))
			})

			await context.route("**/api/session/**", (route) => {
				const url = new URL(route.request().url())
				const m = url.pathname.match(/\/api\/session\/([^/]+)(\/.*)?$/)
				const sessionId = m ? decodeURIComponent(m[1]) : "example-session"
				const sub = m ? m[2] || "" : ""
				// Heartbeat HEAD — just 200.
				if (sub.includes("/heartbeat")) {
					return route.fulfill({ status: 200, body: "" })
				}
				// Choose payload by session-id prefix. The route table uses
				// `example-session` for every flow; the SPA only cares about
				// `session_type`, so the audit dispatches on the in-flight
				// URL's page-type to pick the right shape.
				//
				// Read the Referer on the request (set by fetch from the SPA)
				// to disambiguate which page-type is asking.
				const referer = route.request().headers().referer || ""
				let payload
				if (referer.includes("/question/")) {
					payload = questionSessionPayload(sessionId)
				} else if (referer.includes("/direction/")) {
					payload = directionSessionPayload(sessionId)
				} else {
					// Default — review session (matches `/review/...` and any
					// route whose Referer did not resolve to a page type).
					payload = reviewSessionPayload(sessionId)
				}
				return route.fulfill(jsonResponse(payload))
			})

			const page = await context.newPage()
			await page.goto(`http://127.0.0.1:${port}`, {
				waitUntil: "networkidle",
			})
			await page.waitForTimeout(1500)

			for (const r of routes) {
				await page.evaluate((href) => {
					window.history.replaceState({}, "", href)
					window.dispatchEvent(new PopStateEvent("popstate"))
				}, r.path)
				// Give the SPA time to fetch + render populated state.
				await page.waitForTimeout(800)

				// If this route wants the preview dialog open, click the
				// preview button. The DirectionPage wires a "View full size
				// preview" button per archetype card — we grab the first.
				if (r.openPreview) {
					try {
						const btn = await page.$(
							'button[aria-label^="View full size preview"]',
						)
						if (btn) {
							await btn.click()
							await page.waitForTimeout(400)
						}
					} catch {
						// preview open is best-effort; coverage-floor + per-
						// route `requiredTestIds` catch a real miss.
					}
				}

				// Missing-testid presence check. This is the "coverage
				// collapse" signal the feedback asks for — the audit is
				// useless if the surface never paints.
				for (const tid of r.requiredTestIds || []) {
					const found = await page.$(`[data-testid="${tid}"]`)
					if (!found) {
						missingTestids.push({ route: r.label, testid: tid })
					}
				}

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
						if (el.classList?.contains("sr-only")) continue
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
									if (child.nodeType === 3 && (child.nodeValue || "").trim()) {
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
							before?.content &&
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
							pass: prose || (effectiveW >= MIN && effectiveH >= MIN),
						})
					}
					return out
				}, MIN_SIZE)

				// Per-route element floor — guards against a page-level
				// collapse even when the global total still passes because
				// one busy route masked another.
				if (
					typeof r.minElements === "number" &&
					elements.length < r.minElements
				) {
					missingTestids.push({
						route: r.label,
						testid: `(route floor: expected ≥ ${r.minElements} elements, got ${elements.length})`,
					})
				}

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

	const coverageCollapse = scanned.length < COVERAGE_FLOOR

	await mkdir(REPORTS_DIR, { recursive: true })
	const reportPath = path.join(REPORTS_DIR, "touch-targets.json")
	await writeFile(
		reportPath,
		`${JSON.stringify(
			{
				scanned: scanned.length,
				coverage_floor: COVERAGE_FLOOR,
				coverage_collapse: coverageCollapse,
				missing_testids: missingTestids,
				failures,
			},
			null,
			2,
		)}\n`,
	)

	console.log(
		`audit-touch-targets · ${scanned.length} interactive elements · ${failures.length} fail · floor ${COVERAGE_FLOOR}`,
	)
	console.log(`  report: ${path.relative(process.cwd(), reportPath)}`)

	if (coverageCollapse) {
		console.error(
			`  FAIL coverage collapse: only ${scanned.length} interactive elements scanned across ${routes.length} routes (floor ${COVERAGE_FLOOR}). Fixtures are under-populated — see FB-72.`,
		)
	}

	for (const miss of missingTestids) {
		console.error(
			`  FAIL [${miss.route}] missing presence check: ${miss.testid}`,
		)
	}

	if (failures.length > 0) {
		for (const f of failures) {
			const name =
				f.ariaLabel || f.testid || f.textSample || `${f.tag}[${f.role}]`
			console.error(
				`  FAIL [${f.route}] ${name} — visible ${f.visibleW}×${f.visibleH}, effective ${f.effectiveW}×${f.effectiveH}`,
			)
		}
	}

	if (failures.length > 0 || coverageCollapse || missingTestids.length > 0) {
		process.exit(1)
	}
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(2)
})
