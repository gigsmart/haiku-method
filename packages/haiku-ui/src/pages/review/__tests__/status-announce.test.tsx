/**
 * Status-announce test per unit-07 completion criteria.
 *
 * The unit spec requires: "useAnnounce fires on status-badge transitions —
 * RTL test triggers a status change and asserts live-region text updates".
 * We click the `Dismiss` action on a pending item and assert (a) the mock
 * `feedback.update` receives `{ status: "rejected" }`, (b) the polite live
 * region textContent lands on the canonical "Feedback FB-XX marked as
 * rejected" phrasing per DESIGN-BRIEF §2 screen-reader table.
 */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import feedbackFixture from "../../../../test-fixtures/review-feedback-full.json"
import sessionFixture from "../../../../test-fixtures/review-session-full.json"
import { LiveRegionShell, POLITE_REGION_ID } from "../../../a11y"
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

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

describe("ReviewPage — status-change announcement", () => {
	it("fires polite announcement and calls feedback.update on Dismiss", async () => {
		stubMatchMedia(false)
		const session = sessionFixture as unknown as ReviewPageSessionData
		const items = (feedbackFixture as FeedbackFixture).items

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ items }),
		}) as unknown as typeof global.fetch

		const update = vi.fn().mockResolvedValue({ item: items[0] })
		const client: ApiClient = {
			async fetchSession() {
				throw new Error("not used")
			},
			async fetchReviewCurrent() {
				throw new Error("not used")
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
				create:
					(async () => ({})) as unknown as ApiClient["feedback"]["create"],
				update: update as unknown as ApiClient["feedback"]["update"],
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

		render(
			<ApiClientProvider client={client}>
				<ReviewPage session={session} sessionId="test-review-full" />
				<LiveRegionShell />
			</ApiClientProvider>,
		)

		// Expand the first pending item — its body + action buttons are inside
		// the disclosure. FB-01 is the first pending item in the fixture.
		const firstPendingItem = items.find((i) => i.status === "pending")
		if (!firstPendingItem) throw new Error("fixture missing pending item")

		// Wait for the list to populate.
		await waitFor(() => {
			expect(
				screen.getAllByText(firstPendingItem.title).length,
			).toBeGreaterThan(0)
		})

		// Click the item to expand; FeedbackItem is keyed by data-feedback-id.
		const itemEls = document.querySelectorAll(
			`[data-feedback-id="${firstPendingItem.feedback_id}"]`,
		)
		expect(itemEls.length).toBeGreaterThan(0)
		fireEvent.click(itemEls[0])

		// Action buttons reveal on expand — select by data-action.
		await waitFor(() => {
			expect(
				document.querySelectorAll('button[data-action="dismiss"]').length,
			).toBeGreaterThan(0)
		})
		const dismissButtons = document.querySelectorAll(
			'button[data-action="dismiss"]',
		)
		fireEvent.click(dismissButtons[0])

		await waitFor(() => {
			expect(update).toHaveBeenCalledWith(
				"test-intent",
				"development",
				firstPendingItem.feedback_id,
				{ status: "rejected" },
			)
		})

		const politeRegion = document.getElementById(POLITE_REGION_ID)
		expect(politeRegion?.textContent ?? "").toMatch(
			new RegExp(
				`Feedback ${firstPendingItem.feedback_id} marked as rejected$`,
			),
		)
	})
})
