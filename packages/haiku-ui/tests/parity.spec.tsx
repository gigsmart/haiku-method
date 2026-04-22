/**
 * DOM parity test.
 *
 * Per unit-03 spec: render each committed fixture through `<App>` and
 * assert the rendered DOM tree matches a committed snapshot. Volatile
 * attributes are stripped via `./dom-parity-transformer` so the diff
 * is signal, not noise.
 *
 * This is the local (jsdom-based) interpretation of the spec's Playwright
 * contract. The reviewer explicitly acknowledged this alternative (see
 * FB-04 §"Suggested fix" option: `vitest + happy-dom/jsdom rendering <App>
 * with a mocked ApiClient hydrated from the fixture JSON`). Booting a
 * Playwright harness + test MCP would add a multi-package toolchain for
 * the same structural guarantee — we opt for jsdom because the cost is
 * lower and the regression-catching power is equivalent for this unit's
 * scope (pure relocation, no visual change).
 *
 * First-run behavior: writes the snapshot. Subsequent runs: diffs against
 * the committed snapshot and fails on mismatch. To refresh intentionally:
 * `npx vitest run tests/parity.spec.tsx -u` or delete the snapshot file.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, waitFor } from "@testing-library/react"
import type {
	DirectionSessionPayload,
	QuestionSessionPayload,
	ReviewSessionPayload,
	SessionPayload,
} from "haiku-api"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiClient } from "../src/api/client"
import { ApiClientProvider } from "../src/api/context"
import { normalizeDomSnapshot } from "./dom-parity-transformer"
import { RouterHarness } from "./router-harness"

type FixtureRoute = {
	name: string
	file: string
	pathname: string
	sessionId: string
}

const FIXTURES: readonly FixtureRoute[] = [
	{
		name: "review",
		file: "review-session.json",
		pathname: "/review/test-review-1",
		sessionId: "test-review-1",
	},
	{
		name: "question",
		file: "question-session.json",
		pathname: "/question/test-question-1",
		sessionId: "test-question-1",
	},
	{
		name: "direction",
		file: "direction-session.json",
		pathname: "/direction/test-direction-1",
		sessionId: "test-direction-1",
	},
] as const

function loadFixture(file: string): SessionPayload {
	const p = join(__dirname, "..", "test-fixtures", file)
	return JSON.parse(readFileSync(p, "utf-8")) as SessionPayload
}

function makeMockClient(session: SessionPayload): ApiClient {
	return {
		fetchSession: vi.fn(async () => session),
		fetchReviewCurrent: vi.fn(),
		submitDecision: vi.fn(),
		submitAnswer: vi.fn(),
		submitDirection: vi.fn(),
		feedback: {
			list: vi.fn(async () => ({ items: [] })),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		setSessionId: vi.fn(),
		getSessionId: () => null,
		openWebSocket: () => null,
	}
}

function Wrap({
	client,
	children,
}: {
	client: ApiClient
	children: ReactNode
}) {
	return <ApiClientProvider client={client}>{children}</ApiClientProvider>
}

async function waitForSessionRender(container: HTMLElement) {
	// Wait until `useSession` resolves the mocked fetch, the session state
	// updates, AND the downstream `useEffect` that sets the document title
	// has flushed (the title-setter triggers a second render that's visible
	// in the header). We gate on the loading spinner disappearing AND the
	// main content region appearing.
	await waitFor(
		() => {
			const mainContent = container.querySelector("#main-content")
			const spinner = container.querySelector(".animate-spin")
			if (!mainContent) {
				throw new Error("main-content not rendered yet")
			}
			if (spinner) {
				throw new Error("loading spinner still present")
			}
		},
		{ timeout: 2000 },
	)
	// Additional microtask drain so state-update-from-effect has a chance
	// to flush before we read innerHTML.
	await new Promise((r) => setTimeout(r, 0))
	await new Promise((r) => setTimeout(r, 0))
}

describe("DOM parity — rendered app matches committed snapshot per fixture", () => {
	beforeEach(() => {
		// Reset any test-to-test DOM leakage before each render
		document.body.innerHTML = ""
	})

	afterEach(() => {
		cleanup()
	})

	for (const fx of FIXTURES) {
		it(`${fx.name} session renders a stable DOM tree`, async () => {
			const session = loadFixture(fx.file)
			const client = makeMockClient(session)

			// Seed the router's memory history at the target path; the
			// fixture's page module will fetch via the mocked client.
			const { container } = render(
				<Wrap client={client}>
					<RouterHarness initialPath={fx.pathname} />
				</Wrap>,
			)

			// Let `useEffect(fetchSession)` resolve the fixture into state,
			// then wait for the downstream title-setter effect to flush.
			await waitForSessionRender(container)

			const rendered = normalizeDomSnapshot(container.innerHTML)

			// Body-content sanity: every fixture must render its actual payload,
			// not a shell-only error state. Replaces the previous `length > 16`
			// check, which any non-trivial DOM would pass — including a
			// silently-broken render that would be baked into the snapshot
			// baseline by `-u` regeneration.
			if (fx.name === "review") {
				const r = session as ReviewSessionPayload
				if (r.intent?.title) {
					expect(rendered).toContain(escapeHtml(r.intent.title as string))
				}
				for (const unit of r.units ?? []) {
					const slug = (unit as { slug?: string }).slug
					if (slug) {
						expect(rendered).toContain(escapeHtml(slug))
					}
				}
			} else if (fx.name === "question") {
				const q = session as QuestionSessionPayload
				if (q.title) {
					expect(rendered).toContain(escapeHtml(q.title))
				}
				const firstQuestion = q.questions?.[0]?.question
				if (firstQuestion) {
					expect(rendered).toContain(escapeHtml(firstQuestion))
				}
			} else if (fx.name === "direction") {
				const d = session as DirectionSessionPayload
				if (d.title) {
					expect(rendered).toContain(escapeHtml(d.title))
				}
				const firstArchetype = d.archetypes?.[0]?.name
				if (firstArchetype) {
					expect(rendered).toContain(escapeHtml(firstArchetype))
				}
			}
			// Negative guard: the rendered DOM must NOT be an error state.
			// A shell-only render that silently collapses to
			// `<div>Failed to load…</div>` would still pass the shell-marker
			// checks below; this guard catches that regardless of shell.
			expect(rendered).not.toMatch(/error|failed to load/i)

			// Fixture-specific structural assertions — these are the no-
			// regression guarantees. If a future refactor removes the header,
			// the tab container, the feedback panel, etc, these fail.
			assertStructuralMarkers(fx.name, rendered, session)

			// Snapshot the full normalized DOM. Vitest handles the write-on-
			// first-run / diff-on-subsequent-run lifecycle.
			expect(rendered).toMatchSnapshot(`dom-${fx.name}.html`)
		})
	}
})

function assertStructuralMarkers(
	fxName: string,
	rendered: string,
	session: SessionPayload,
) {
	// Every successfully-loaded session renders the sticky header.
	expect(rendered).toContain("<header")
	// ...and the content region.
	expect(rendered).toContain('id="main-content"')

	// Landmark primitives (added by unit-06 shell refactor — see
	// `aria-landmark-spec.md §1`):
	expect(rendered).toContain('role="banner"')
	expect(rendered).toContain('role="main"')
	// Skip link — first focusable element, targets <Main id="main-content">.
	expect(rendered).toContain('href="#main-content"')
	// Two live-region shell nodes (polite status + assertive alert).
	expect(rendered).toContain('id="feedback-live-polite"')
	expect(rendered).toContain('id="feedback-live-assertive"')

	// The review page is a full-bleed app (per canonical review UI mockup)
	// and intentionally does NOT render the "Powered by" ShellLayout footer
	// or a role="contentinfo" landmark. The non-review pages still do.
	if (fxName !== "review") {
		expect(rendered).toContain("Powered by")
		expect(rendered).toContain('role="contentinfo"')
	}

	if (fxName === "review") {
		const r = session as ReviewSessionPayload
		// Review pages always render the intent title in the sticky header.
		if (r.intent?.title) {
			expect(rendered).toContain(escapeHtml(r.intent.title))
		}
	}

	if (fxName === "question") {
		const q = session as QuestionSessionPayload
		// Question title appears in the sticky header.
		if (q.title) {
			expect(rendered).toContain(escapeHtml(q.title))
		}
	}

	if (fxName === "direction") {
		const d = session as DirectionSessionPayload
		// Direction title OR the default fallback.
		expect(rendered).toMatch(
			new RegExp(
				escapeHtml(d.title ?? "Design Direction").replace(
					/[.*+?^${}()|[\]\\]/g,
					"\\$&",
				),
			),
		)
	}
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
