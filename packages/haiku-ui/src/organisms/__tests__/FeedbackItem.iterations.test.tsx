/**
 * Tests for the fix-hat history disclosure on FeedbackItem.
 *
 * `iterations[]` is the per-bolt audit trail of every hat the workflow
 * engine dispatched against a finding. The closure_reply tells the
 * reviewer the agent's summary; iterations[] tells them HOW it got
 * there — which hats fired, which advanced, which reopened, which
 * commit each landed. Without this, "I don't know what was done"
 * becomes the chronic feedback complaint.
 *
 * The disclosure is collapsed by default so it doesn't crowd the
 * resolution callout, opens to a single ordered list with hat name,
 * result chip, optional reason, optional commit SHA (truncated to 7).
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { FeedbackItemData } from "../../types"
import { FeedbackItem } from "../FeedbackItem"

afterEach(() => {
	cleanup()
})

const baseClosed: FeedbackItemData = {
	feedback_id: "FB-12",
	title: "Test FB with iterations",
	body: "Original finding body.",
	status: "closed",
	origin: "adversarial-review",
	author: "code-reviewer",
	author_type: "agent",
	created_at: "2026-05-06T12:00:00Z",
	visit: 1,
	source_ref: null,
	closed_by: "feedback-assessor",
}

describe("FeedbackItem — iterations disclosure", () => {
	it("renders the disclosure when iterations[] is non-empty", () => {
		render(
			<FeedbackItem
				item={{
					...baseClosed,
					iterations: [
						{ bolt: 1, hat: "planner", result: "advanced" },
						{
							bolt: 1,
							hat: "coder",
							result: "advanced",
							commit: "abcdef1234567890",
						},
						{
							bolt: 1,
							hat: "feedback-assessor",
							result: "closed",
							reason: "verified — coverage now passes",
						},
					],
				}}
				isExpanded={true}
				onToggle={() => {}}
			/>,
		)
		const disclosure = screen.getByTestId("feedback-iterations-FB-12")
		expect(disclosure).toBeTruthy()
		expect(disclosure.textContent).toContain("Fix history (3 steps)")
		expect(disclosure.textContent).toContain("planner")
		expect(disclosure.textContent).toContain("coder")
		expect(disclosure.textContent).toContain("feedback-assessor")
		expect(disclosure.textContent).toContain("verified — coverage now passes")
		// Commit truncated to first 7 chars.
		expect(disclosure.textContent).toContain("abcdef1")
		expect(disclosure.textContent).not.toContain("abcdef1234567890")
	})

	it("does NOT render when iterations[] is missing or empty", () => {
		render(
			<FeedbackItem
				item={baseClosed}
				isExpanded={true}
				onToggle={() => {}}
			/>,
		)
		expect(screen.queryByTestId("feedback-iterations-FB-12")).toBeNull()
	})

	it("uses singular 'step' when there's only one iteration", () => {
		render(
			<FeedbackItem
				item={{
					...baseClosed,
					iterations: [{ bolt: 1, hat: "feedback-assessor", result: "closed" }],
				}}
				isExpanded={true}
				onToggle={() => {}}
			/>,
		)
		const disclosure = screen.getByTestId("feedback-iterations-FB-12")
		expect(disclosure.textContent).toContain("Fix history (1 step)")
	})

	it("renders 'reopened' result without a reason field gracefully", () => {
		render(
			<FeedbackItem
				item={{
					...baseClosed,
					iterations: [
						{ bolt: 1, hat: "coder", result: "reopened" },
						{ bolt: 2, hat: "coder", result: "advanced" },
					],
				}}
				isExpanded={true}
				onToggle={() => {}}
			/>,
		)
		const disclosure = screen.getByTestId("feedback-iterations-FB-12")
		expect(disclosure.textContent).toContain("reopened")
		expect(disclosure.textContent).toContain("bolt 1")
		expect(disclosure.textContent).toContain("bolt 2")
	})
})
