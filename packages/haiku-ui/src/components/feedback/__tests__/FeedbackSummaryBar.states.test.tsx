/**
 * State-matrix + filter-button behavior for FeedbackSummaryBar
 * (state-coverage-grid.md §7.6).
 *
 * Cardinality: 4 status buttons × (default + active) + 1 empty cell = 9.
 * Well under 36.
 */

import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { injectCanonicalTouchTargetCss } from "../../../a11y/__tests__/touch-target-css"
import { FeedbackSummaryBar } from "../FeedbackSummaryBar"
import { type FeedbackStatus, TOKEN_HASH } from "../tokens"
import { mockItems } from "./mockItems"

// FB-65: inject the canonical `.touch-target` CSS so `getComputedStyle` can
// resolve min-height/min-width against the shipped rule (jsdom has no layout
// engine). The 44×44 assertion below rides on this — regression in
// `index.css` (rule removed, value below 44) → that test fails.
beforeAll(() => {
	injectCanonicalTouchTargetCss("feedback-summary-bar-touch-target-css")
})

afterEach(() => {
	cleanup()
})

function Matrix(): React.ReactElement {
	const items = mockItems(20)
	const statuses: (FeedbackStatus | null)[] = [
		null,
		"pending",
		"addressed",
		"closed",
		"rejected",
	]
	return (
		<div data-token-hash={TOKEN_HASH}>
			{statuses.map((status) => (
				<div key={status ?? "none"} data-cell={`active-${status ?? "none"}`}>
					<FeedbackSummaryBar
						items={items}
						activeStatus={status}
						onFilter={() => undefined}
					/>
				</div>
			))}
			<div data-cell="empty">
				<FeedbackSummaryBar
					items={[]}
					activeStatus={null}
					onFilter={() => undefined}
				/>
			</div>
		</div>
	)
}

describe("FeedbackSummaryBar — state matrix", () => {
	it("renders (active filter × status) + empty cells (snapshot)", () => {
		const { container } = render(<Matrix />)
		expect(container.firstChild).toMatchSnapshot()
	})

	it("hides entirely when items is empty", () => {
		const { queryByTestId } = render(
			<FeedbackSummaryBar
				items={[]}
				activeStatus={null}
				onFilter={() => undefined}
			/>,
		)
		expect(queryByTestId("feedback-summary-bar")).toBeNull()
	})

	it("each filter button has aria-pressed tied to activeStatus", () => {
		const items = mockItems(10)
		const { container } = render(
			<FeedbackSummaryBar
				items={items}
				activeStatus="pending"
				onFilter={() => undefined}
			/>,
		)
		const pending = container.querySelector<HTMLButtonElement>(
			"[data-status='pending']",
		)
		const addressed = container.querySelector<HTMLButtonElement>(
			"[data-status='addressed']",
		)
		expect(pending?.getAttribute("aria-pressed")).toBe("true")
		expect(addressed?.getAttribute("aria-pressed")).toBe("false")
	})

	it("clicking a button fires onFilter with the status", () => {
		const onFilter = vi.fn()
		const items = mockItems(10)
		const { container } = render(
			<FeedbackSummaryBar
				items={items}
				activeStatus={null}
				onFilter={onFilter}
			/>,
		)
		const closed = container.querySelector<HTMLButtonElement>(
			"[data-status='closed']",
		)
		if (!closed) throw new Error("closed button missing")
		fireEvent.click(closed)
		expect(onFilter).toHaveBeenCalledWith("closed")
	})

	it("clicking the active button toggles off (fires null)", () => {
		const onFilter = vi.fn()
		const items = mockItems(10)
		const { container } = render(
			<FeedbackSummaryBar
				items={items}
				activeStatus="pending"
				onFilter={onFilter}
			/>,
		)
		const pending = container.querySelector<HTMLButtonElement>(
			"[data-status='pending']",
		)
		if (!pending) throw new Error("pending button missing")
		fireEvent.click(pending)
		expect(onFilter).toHaveBeenCalledWith(null)
	})
})

// ── FB-65: filter pills meet WCAG 2.5.5 (AAA) 44×44 touch target ───────────
//
// Previously the pills rendered ~80×24 — below the 44 floor on every
// status. The fix landed `touchTargetClass` (canonical `.touch-target` rule
// in `src/index.css`) on each button. This test locks the contract
// mechanically via `getComputedStyle(...).minHeight|minWidth >= 44` rather
// than only the class-string snapshot. Pattern mirrors
// `AgentFeedbackToggle.test.tsx:165-180` (same `injectCanonicalTouchTargetCss`
// path, same dual-assert for min-* plus classList).

describe("FeedbackSummaryBar — filter pills meet 44×44", () => {
	it("every rendered filter pill exposes min-height ≥ 44px and min-width ≥ 44px", () => {
		// Items spanning every visible status so all four pills paint.
		const items = mockItems(20)
		const { container } = render(
			<FeedbackSummaryBar
				items={items}
				activeStatus={null}
				onFilter={() => undefined}
			/>,
		)
		const pills = container.querySelectorAll<HTMLButtonElement>(
			"button[data-status]",
		)
		// Five visible statuses — pending, addressed, answered, closed, rejected.
		expect(pills.length).toBe(5)
		for (const pill of pills) {
			const style = getComputedStyle(pill)
			expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44)
			expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44)
			expect(pill.classList.contains("touch-target")).toBe(true)
		}
	})
})
