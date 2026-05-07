/**
 * Tests for the closure-reply unread filter chip in FeedbackPanelBody.
 * Locks the click-path: toggling the chip narrows visible items to
 * `closure_reply_unread === true`, ignoring the active status filter
 * (which would otherwise hide closed FBs that carry replies).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FeedbackPanelBody } from "../FeedbackPanelBody"
import type { FeedbackItemData } from "../../../types"

afterEach(() => {
	cleanup()
})

const fbBase: FeedbackItemData = {
	feedback_id: "FB-00",
	title: "x",
	body: "x",
	status: "pending",
	origin: "user-chat",
	author: "user",
	author_type: "human",
	created_at: "2026-05-06T00:00:00Z",
	visit: 0,
	source_ref: null,
	closed_by: null,
}

const items: FeedbackItemData[] = [
	{ ...fbBase, feedback_id: "FB-01", status: "pending", title: "open one" },
	{
		...fbBase,
		feedback_id: "FB-02",
		status: "closed",
		title: "closed with unread reply",
		closure_reply: { text: "fixed", at: "2026-05-06T01:00:00Z" },
		closure_reply_unread: true,
	},
	{
		...fbBase,
		feedback_id: "FB-03",
		status: "closed",
		title: "closed with read reply",
		closure_reply: { text: "fixed", at: "2026-05-06T01:00:00Z" },
		closure_reply_unread: false,
	},
	{ ...fbBase, feedback_id: "FB-04", status: "pending", title: "open two" },
]

describe("FeedbackPanelBody — closure-reply unread filter chip", () => {
	it("renders the chip when at least one item has closure_reply_unread", () => {
		render(
			<FeedbackPanelBody
				items={items}
				loading={false}
				error={null}
				onStatusChange={vi.fn()}
				onDelete={vi.fn()}
				onRetry={vi.fn()}
			/>,
		)
		expect(screen.getByTestId("feedback-unread-reply-filter")).toBeTruthy()
	})

	it("does NOT render the chip when no items carry an unread reply", () => {
		const noUnread = items.map((i) => ({
			...i,
			closure_reply_unread: false,
		}))
		render(
			<FeedbackPanelBody
				items={noUnread}
				loading={false}
				error={null}
				onStatusChange={vi.fn()}
				onDelete={vi.fn()}
				onRetry={vi.fn()}
			/>,
		)
		expect(screen.queryByTestId("feedback-unread-reply-filter")).toBeNull()
	})

	it("default view (status: pending) hides closed FBs even with unread replies", () => {
		// The default status filter is "pending", which would normally
		// hide FB-02 + FB-03. Confirm baseline.
		render(
			<FeedbackPanelBody
				items={items}
				loading={false}
				error={null}
				onStatusChange={vi.fn()}
				onDelete={vi.fn()}
				onRetry={vi.fn()}
			/>,
		)
		// Pending items render; closed items don't
		expect(screen.getByText("open one")).toBeTruthy()
		expect(screen.getByText("open two")).toBeTruthy()
		expect(screen.queryByText("closed with unread reply")).toBeNull()
	})

	it("toggling the chip overrides the status filter and shows ONLY unread-reply items", () => {
		render(
			<FeedbackPanelBody
				items={items}
				loading={false}
				error={null}
				onStatusChange={vi.fn()}
				onDelete={vi.fn()}
				onRetry={vi.fn()}
			/>,
		)
		const chip = screen.getByTestId("feedback-unread-reply-filter")
		fireEvent.click(chip)
		// Only FB-02 (closed_with_unread_reply, closure_reply_unread: true)
		expect(screen.getByText("closed with unread reply")).toBeTruthy()
		// Pending items hidden — chip overrides the status filter
		expect(screen.queryByText("open one")).toBeNull()
		expect(screen.queryByText("open two")).toBeNull()
		// Closed-with-read-reply NOT shown
		expect(screen.queryByText("closed with read reply")).toBeNull()
	})

	it("toggling the chip back restores the status filter view", () => {
		render(
			<FeedbackPanelBody
				items={items}
				loading={false}
				error={null}
				onStatusChange={vi.fn()}
				onDelete={vi.fn()}
				onRetry={vi.fn()}
			/>,
		)
		const chip = screen.getByTestId("feedback-unread-reply-filter")
		fireEvent.click(chip) // on
		fireEvent.click(chip) // off
		// Back to pending-only view
		expect(screen.getByText("open one")).toBeTruthy()
		expect(screen.getByText("open two")).toBeTruthy()
		expect(screen.queryByText("closed with unread reply")).toBeNull()
	})

	it("chip count reflects the number of items with closure_reply_unread", () => {
		// Add another unread-reply FB to push the count to 2.
		const more: FeedbackItemData[] = [
			...items,
			{
				...fbBase,
				feedback_id: "FB-05",
				status: "closed" as const,
				title: "another unread",
				closure_reply: { text: "did it", at: "2026-05-06T02:00:00Z" },
				closure_reply_unread: true,
			},
		]
		render(
			<FeedbackPanelBody
				items={more}
				loading={false}
				error={null}
				onStatusChange={vi.fn()}
				onDelete={vi.fn()}
				onRetry={vi.fn()}
			/>,
		)
		const chip = screen.getByTestId("feedback-unread-reply-filter")
		// Count appears at the end of the chip text.
		expect(chip.textContent).toMatch(/2$/)
	})
})
