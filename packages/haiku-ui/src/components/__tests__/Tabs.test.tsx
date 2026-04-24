/**
 * Tabs — WCAG 2.5.5 (AAA) touch-target coverage (FB-65).
 *
 * Pre-fix Tabs buttons rendered `px-4 py-2.5 text-sm` which — with a 14px
 * base font — computes to ~40px tall. Marginal on height and not
 * deterministic across user font scaling. The fix landed `touchTargetClass`
 * (canonical `.touch-target` rule in `src/index.css`) on the tab button
 * template. This test pins the 44×44 floor mechanically via
 * `getComputedStyle` min-height/min-width and `classList.contains`, the
 * same dual-assert pattern used by AgentFeedbackToggle and FeedbackItem.
 *
 * Focus + keyboard behavior is implicit in the Tabs component but the
 * 44×44 contract is the one with an adversarial-review finding. Keep
 * scope narrow — FB-65 is about the touch target, not the ARIA wiring.
 */

import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { injectCanonicalTouchTargetCss } from "../../a11y/__tests__/touch-target-css"
import { Tabs } from "../Tabs"

beforeAll(() => {
	injectCanonicalTouchTargetCss("tabs-touch-target-css")
})

afterEach(() => {
	cleanup()
})

describe("Tabs — tab buttons meet 44×44 (FB-65)", () => {
	it("every rendered tab button exposes min-height ≥ 44px and min-width ≥ 44px", () => {
		const { container } = render(
			<Tabs
				groupId="fb65"
				tabs={[
					{ id: "one", label: "One", content: <div>one</div> },
					{ id: "two", label: "Two", content: <div>two</div> },
					{ id: "three", label: "Three", content: <div>three</div> },
				]}
			/>,
		)
		const buttons =
			container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
		expect(buttons.length).toBe(3)
		for (const btn of buttons) {
			const style = getComputedStyle(btn)
			expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44)
			expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44)
			expect(btn.classList.contains("touch-target")).toBe(true)
		}
	})

	it("disabled tab buttons still carry the touch-target class (hit-area is a11y contract, not a style toggle)", () => {
		const { container } = render(
			<Tabs
				groupId="fb65-disabled"
				tabs={[
					{ id: "one", label: "One", content: <div>one</div> },
					{
						id: "two",
						label: "Two",
						content: <div>two</div>,
						disabled: true,
					},
				]}
			/>,
		)
		const disabled = container.querySelector<HTMLButtonElement>(
			'[role="tab"][aria-disabled="true"]',
		)
		expect(disabled).not.toBeNull()
		const style = getComputedStyle(disabled as HTMLButtonElement)
		expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44)
		expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44)
		expect(disabled?.classList.contains("touch-target")).toBe(true)
	})
})
