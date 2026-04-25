/**
 * Rendering gate: `FeedbackList` mounts every row (virtualization is
 * off — see FeedbackList.tsx for the rationale). These tests keep the
 * "every item is in the DOM" contract honest so the keyboard-nav hook,
 * jump-to-target dispatching, and axe-core audits continue to work
 * against the full item set.
 */

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { FeedbackList, VIRTUALIZE_THRESHOLD } from "../FeedbackList"
import { mockItems } from "./mockItems"

afterEach(() => {
	cleanup()
})

describe("FeedbackList — rendering gate", () => {
	it(`at the threshold (${VIRTUALIZE_THRESHOLD}), every row is mounted`, () => {
		const { container } = render(
			<FeedbackList items={mockItems(VIRTUALIZE_THRESHOLD)} />,
		)
		const list = container.querySelector("[data-testid='feedback-list']")
		expect(list?.getAttribute("data-virtualized")).toBe("false")
		const items = container.querySelectorAll("[data-testid='feedback-item']")
		expect(items.length).toBe(VIRTUALIZE_THRESHOLD)
	})

	it(`above the threshold (${VIRTUALIZE_THRESHOLD + 1}), every row stays mounted (virtualization intentionally off)`, () => {
		const count = VIRTUALIZE_THRESHOLD + 1
		const { container } = render(<FeedbackList items={mockItems(count)} />)
		const list = container.querySelector("[data-testid='feedback-list']")
		expect(list?.getAttribute("data-virtualized")).toBe("false")
		const items = container.querySelectorAll("[data-testid='feedback-item']")
		expect(items.length).toBe(count)
	})
})
