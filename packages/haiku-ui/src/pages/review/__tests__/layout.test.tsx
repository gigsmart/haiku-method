/**
 * Structural layout test for ReviewPage — canonical design mockup
 * (`stages/design/artifacts/review-ui-mockup.html`).
 *
 * Asserts:
 *   - Desktop: full-bleed h-screen flex-col shell, sidebar on the LEFT
 *     (border-r), composer + decision buttons pinned inside the sidebar,
 *     no FAB.
 *   - Mobile: sidebar collapses into FAB + Sheet; main fills width.
 *
 * The branch flip is script-driven via `useIsMobile()` (see
 * `../useIsMobile.ts`), so stubbing `window.matchMedia` is sufficient.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import feedbackFixture from "../../../../test-fixtures/review-feedback-full.json"
import sessionFixture from "../../../../test-fixtures/review-session-full.json"
import { LiveRegionShell } from "../../../a11y"
import type { ApiClient } from "../../../api/client"
import { ApiClientProvider } from "../../../api/context"
import type { FeedbackItemData } from "../../../types"
import { ReviewPage } from "../ReviewPage"
import type { ReviewPageSessionData } from "../shared/session-data"

type FeedbackFixture = { items: FeedbackItemData[] }

function stubMatchMedia(isMobile: boolean): void {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: (query: string): MediaQueryList => {
			const matches = query.includes("max-width: 1279px") ? isMobile : false
			return {
				matches,
				media: query,
				onchange: null,
				addListener: () => {},
				removeListener: () => {},
				addEventListener: () => {},
				removeEventListener: () => {},
				dispatchEvent: () => true,
			} as MediaQueryList
		},
	})
}

function buildMockClient(items: FeedbackItemData[]): ApiClient {
	return {
		async fetchSession() {
			throw new Error("fetchSession not used")
		},
		async fetchReviewCurrent() {
			throw new Error("fetchReviewCurrent not used")
		},
		async submitDecision() {
			return { ok: true } as never
		},
		async submitAnswer() {
			return {} as never
		},
		async submitDirection() {
			return {} as never
		},
		async submitRevisit() {
			return {} as never
		},
		feedback: {
			list: (async () => ({
				intent: "test-intent",
				stage: "development",
				count: items.length,
				items,
			})) as unknown as ApiClient["feedback"]["list"],
			create: (async () => ({})) as unknown as ApiClient["feedback"]["create"],
			update: (async () => ({
				item: items[0],
			})) as unknown as ApiClient["feedback"]["update"],
			delete: (async () => ({
				ok: true,
			})) as unknown as ApiClient["feedback"]["delete"],
		},
		setSessionId() {},
		getSessionId() {
			return null
		},
		openWebSocket() {
			return null
		},
	}
}

function stubFetch(items: FeedbackItemData[]): void {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		json: async () => ({ items }),
	}) as unknown as typeof global.fetch
}

async function mount(isMobile: boolean): Promise<void> {
	stubMatchMedia(isMobile)
	const session = sessionFixture as unknown as ReviewPageSessionData
	const items = (feedbackFixture as FeedbackFixture).items
	stubFetch(items)
	const client = buildMockClient(items)
	render(
		<ApiClientProvider client={client}>
			<ReviewPage session={session} sessionId="test-review-full" />
			<LiveRegionShell />
		</ApiClientProvider>,
	)
	await waitFor(() => {
		expect(screen.getByTestId("review-page-ready")).toBeTruthy()
	})
}

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

describe("ReviewPage — structural layout (canonical mockup)", () => {
	it("desktop: full-bleed h-screen shell, sidebar on the LEFT with border-r, composer inside", async () => {
		await mount(false)

		const root = screen.getByTestId("review-page-ready")
		const rootClass = root.getAttribute("class") ?? ""
		expect(rootClass).toContain("h-screen")
		expect(rootClass).toContain("flex-col")

		const split = screen.getByTestId("review-split")
		const splitClass = split.getAttribute("class") ?? ""
		expect(splitClass).toContain("flex")
		expect(splitClass).toContain("xl:flex-row")
		expect(splitClass).toContain("overflow-hidden")

		const sidebar = screen.getByTestId("feedback-sidebar-desktop")
		const sidebarClass = sidebar.getAttribute("class") ?? ""
		expect(sidebarClass).toContain("border-r")
		expect(sidebarClass).toContain("hidden")
		expect(sidebarClass).toContain("xl:flex")

		// Decision buttons live INSIDE the sidebar (composer + actions pinned
		// bottom) per the canonical mockup — they are not a page-footer row.
		const footer = screen.getByTestId("review-footer-bar")
		expect(sidebar.contains(footer)).toBe(true)

		// Mobile affordances must NOT render in the desktop branch.
		expect(screen.queryByTestId("feedback-fab")).toBeNull()
		expect(screen.queryByTestId("feedback-sheet")).toBeNull()
	})

	it("mobile: flex-col stack, FAB instead of sidebar", async () => {
		await mount(true)

		const split = screen.getByTestId("review-split")
		const splitClass = split.getAttribute("class") ?? ""
		expect(splitClass).toContain("flex-col")

		expect(screen.queryByTestId("feedback-sidebar-desktop")).toBeNull()

		const fab = screen.getByTestId("feedback-fab")
		expect(fab.tagName).toBe("BUTTON")
		const sheet = screen.getByTestId("feedback-sheet")
		expect(sheet.getAttribute("role")).toBe("dialog")
	})
})
