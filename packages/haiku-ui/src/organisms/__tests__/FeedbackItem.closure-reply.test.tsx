/**
 * Tests for the closure-reply card on FeedbackItem.
 *
 * The terminal fix-hat advance stamps `closure_reply: { text, at }` and
 * `closure_reply_unread: true` on a closed FB. The card surfaces in the
 * feedback panel with a "Resolved" header, the agent's plain-language
 * reply, a "new" badge while unread, and a "Dismiss" button that flips
 * unread → false.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { FeedbackItemData } from "../../types"
import { FeedbackItem } from "../FeedbackItem"

afterEach(() => {
	cleanup()
})

const baseClosed: FeedbackItemData = {
	feedback_id: "FB-07",
	title: "Test FB with closure reply",
	body: "Original finding body.",
	status: "closed",
	origin: "user-chat",
	author: "user",
	author_type: "human",
	created_at: "2026-05-06T12:00:00Z",
	visit: 1,
	source_ref: null,
	closed_by: "fix-loop:FB-07:bolt-1",
}

describe("FeedbackItem — closure_reply card", () => {
	it("renders the Resolved card when closure_reply is present", () => {
		render(
			<FeedbackItem
				item={{
					...baseClosed,
					closure_reply: {
						text: "Made the button 44px tall to meet WCAG touch targets.",
						at: "2026-05-06T13:30:00Z",
					},
					closure_reply_unread: true,
				}}
				isExpanded={true}
				onToggle={() => {}}
			/>,
		)
		const card = screen.getByTestId("feedback-closure-reply-FB-07")
		expect(card).toBeTruthy()
		expect(card.textContent).toContain("Resolved")
		expect(card.textContent).toContain("44px tall")
	})

	it("does NOT render the card when closure_reply is absent", () => {
		render(
			<FeedbackItem
				item={baseClosed}
				isExpanded={true}
				onToggle={() => {}}
			/>,
		)
		expect(screen.queryByTestId("feedback-closure-reply-FB-07")).toBeNull()
	})

	it("shows the 'new' badge while closure_reply_unread is true", () => {
		render(
			<FeedbackItem
				item={{
					...baseClosed,
					closure_reply: { text: "fixed", at: "2026-05-06T13:30:00Z" },
					closure_reply_unread: true,
				}}
				isExpanded={true}
				onToggle={() => {}}
			/>,
		)
		const card = screen.getByTestId("feedback-closure-reply-FB-07")
		expect(card.textContent).toMatch(/new/i)
	})

	it("hides the 'new' badge when closure_reply_unread is false", () => {
		render(
			<FeedbackItem
				item={{
					...baseClosed,
					closure_reply: { text: "fixed", at: "2026-05-06T13:30:00Z" },
					closure_reply_unread: false,
				}}
				isExpanded={true}
				onToggle={() => {}}
			/>,
		)
		const card = screen.getByTestId("feedback-closure-reply-FB-07")
		// Badge shouldn't be present; "Resolved" header always is.
		expect(card.querySelectorAll(".bg-emerald-700").length).toBe(0)
	})

	it("calls onDismissClosureReply with the FB id when Dismiss is clicked", () => {
		const onDismissClosureReply = vi.fn().mockResolvedValue(undefined)
		render(
			<FeedbackItem
				item={{
					...baseClosed,
					closure_reply: { text: "fixed", at: "2026-05-06T13:30:00Z" },
					closure_reply_unread: true,
				}}
				isExpanded={true}
				onToggle={() => {}}
				onDismissClosureReply={onDismissClosureReply}
			/>,
		)
		const button = screen.getByText("Dismiss")
		fireEvent.click(button)
		expect(onDismissClosureReply).toHaveBeenCalledWith("FB-07")
	})

	it("hides the Dismiss button when already acknowledged (unread === false)", () => {
		const onDismissClosureReply = vi.fn()
		render(
			<FeedbackItem
				item={{
					...baseClosed,
					closure_reply: { text: "fixed", at: "2026-05-06T13:30:00Z" },
					closure_reply_unread: false,
				}}
				isExpanded={true}
				onToggle={() => {}}
				onDismissClosureReply={onDismissClosureReply}
			/>,
		)
		expect(screen.queryByText("Dismiss")).toBeNull()
	})
})
