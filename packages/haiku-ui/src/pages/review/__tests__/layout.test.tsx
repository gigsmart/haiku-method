/**
 * Structural layout test per unit-07 completion criteria.
 *
 * Replaces the previously-specced Playwright visual-regression harness:
 * Playwright and Lighthouse both launch/take-over the developer's Chrome
 * on this machine, which wedges or clobbers an in-use browser. Structural
 * assertions are authored in Vitest + RTL and exercise the same responsive
 * branches mechanically — no browser launcher required.
 *
 * The branch flip is script-driven via `useIsMobile()` (see
 * `../useIsMobile.ts`), so stubbing `window.matchMedia` in each render is
 * sufficient to deterministically produce the desktop and mobile DOM
 * trees. We assert:
 *
 *  - Desktop (matchMedia(isMobile=false)):
 *      outer split container uses `xl:flex-row`; the
 *      `feedback-sidebar-desktop` element is present; its className
 *      contains the canonical width tokens `w-[var(--sidebar-width)]` and
 *      `xl:w-[var(--sidebar-width-xl)]`; the mobile FAB is NOT rendered.
 *
 *  - Mobile (matchMedia(isMobile=true)):
 *      outer split container uses `flex-col`; the FAB is present;
 *      the desktop sidebar is NOT rendered; the FeedbackSheet dialog
 *      element is present (hidden by default per placeholder semantics).
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LiveRegionShell } from "../../../a11y"
import type { ApiClient } from "../../../api/client"
import { ApiClientProvider } from "../../../api/context"
import sessionFixture from "../../../../test-fixtures/review-session-full.json"
import feedbackFixture from "../../../../test-fixtures/review-feedback-full.json"
import type { ReviewPageSessionData } from "../shared/session-data"
import type { FeedbackItemData } from "../../../types"
import { ReviewPage } from "../ReviewPage"

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
			<>
				<ReviewPage session={session} sessionId="test-review-full" />
				<LiveRegionShell />
			</>
		</ApiClientProvider>,
	)
	// Ensure the page ready marker is attached before structural assertions.
	await waitFor(() => {
		expect(screen.getByTestId("review-page-ready")).toBeTruthy()
	})
}

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

describe("ReviewPage — structural layout", () => {
	it("desktop: xl:flex-row split, canonical sidebar width tokens, no FAB", async () => {
		await mount(false)

		const split = screen.getByTestId("review-split")
		const splitClass = split.getAttribute("class") ?? ""
		expect(splitClass).toContain("flex")
		expect(splitClass).toContain("xl:flex-row")

		const sidebar = screen.getByTestId("feedback-sidebar-desktop")
		const sidebarClass = sidebar.getAttribute("class") ?? ""
		expect(sidebarClass).toContain("w-[var(--sidebar-width)]")
		expect(sidebarClass).toContain("xl:w-[var(--sidebar-width-xl)]")
		expect(sidebarClass).toContain("hidden")
		expect(sidebarClass).toContain("xl:flex")

		// Mobile affordances must NOT render in the desktop branch.
		expect(screen.queryByTestId("feedback-fab")).toBeNull()
		expect(screen.queryByTestId("feedback-sheet")).toBeNull()
	})

	it("mobile: flex-col stack, FAB instead of sidebar", async () => {
		await mount(true)

		const split = screen.getByTestId("review-split")
		const splitClass = split.getAttribute("class") ?? ""
		expect(splitClass).toContain("flex-col")

		// Desktop sidebar must NOT render on the mobile branch.
		expect(screen.queryByTestId("feedback-sidebar-desktop")).toBeNull()

		// FAB replaces the sidebar; the sheet placeholder is in the DOM
		// (hidden by default — unit-10 layers dialog semantics on top).
		const fab = screen.getByTestId("feedback-fab")
		expect(fab.tagName).toBe("BUTTON")
		const sheet = screen.getByTestId("feedback-sheet")
		expect(sheet.getAttribute("role")).toBe("dialog")
	})
})
