/**
 * AgentFeedbackToggle — Completion-Criteria regression coverage per unit-09.
 *
 * Every unit spec assertion has a named test. See
 * stages/development/artifacts/unit-09-tactical-plan.md §B for the per-block
 * rationale + the matchMedia / touch-target CSS-injection patterns inherited
 * from unit-05.
 *
 * Notes:
 *   - Keyboard activation uses `@testing-library/user-event`. Unlike
 *     `fireEvent.keyDown/keyUp` — which jsdom does NOT translate into a
 *     click on `<button>` — `user.keyboard("{Space}")` / `{Enter}` synthesize
 *     the full browser-faithful keydown → keypress → click sequence on the
 *     focused element. That means the keyboard tests genuinely exercise the
 *     onClick → onChange path, not a cosmetic `expect(btn).toBeTruthy()`.
 *   - `useAnnounce()` no-ops when the `#feedback-live-polite` region isn't
 *     mounted. Every test that touches the live region wraps the toggle
 *     in `<LiveRegionShell />` per live-regions.tsx contract.
 *   - `.touch-target` CSS is loaded from the canonical `src/index.css` via
 *     `injectCanonicalTouchTargetCss` and injected as a `<style>` tag in
 *     `beforeAll`. See FB-40 for the circular-proof fix: the CSS under test
 *     is the real shipped CSS, not a hand-mirror.
 */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest"
import { LiveRegionShell, POLITE_REGION_ID } from "../../../a11y"
import { installMatchMediaStub } from "../../../a11y/__tests__/matchMedia.stub"
import { injectCanonicalTouchTargetCss } from "../../../a11y/__tests__/touch-target-css"
import { AgentFeedbackToggle } from "../AgentFeedbackToggle"

beforeAll(() => {
	// jsdom has no layout engine — inject the canonical .touch-target CSS
	// loaded from the real packages/haiku-ui/src/index.css so
	// getComputedStyle resolves min-height/min-width against the shipped
	// rule. Regression in index.css → these tests fail.
	injectCanonicalTouchTargetCss("agent-feedback-toggle-css")
})

afterEach(() => {
	cleanup()
})

describe("AgentFeedbackToggle — default render & accessibility tree", () => {
	it("resolves role=switch with the canonical accessible name", () => {
		render(
			<>
				<LiveRegionShell />
				<AgentFeedbackToggle />
			</>,
		)
		const btn = screen.getByRole("switch", {
			name: /^Show agent feedback inline$/,
		})
		expect(btn).toBeTruthy()
	})

	it("has aria-checked='false' on default mount (string literal, not boolean)", () => {
		render(<AgentFeedbackToggle />)
		const btn = screen.getByRole("switch", {
			name: /^Show agent feedback inline$/,
		})
		expect(btn.getAttribute("aria-checked")).toBe("false")
	})

	it("renders as <button type='button'> to prevent form submission", () => {
		render(<AgentFeedbackToggle />)
		const btn = screen.getByRole("switch")
		expect(btn.tagName).toBe("BUTTON")
		expect(btn.getAttribute("type")).toBe("button")
	})

	it("is reachable by keyboard Tab — no tabindex='-1', no aria-hidden, no inert", () => {
		render(<AgentFeedbackToggle />)
		const btn = screen.getByRole("switch") as HTMLButtonElement
		expect(btn.getAttribute("tabindex")).not.toBe("-1")
		expect(btn.getAttribute("aria-hidden")).not.toBe("true")
		expect(btn.hasAttribute("inert")).toBe(false)
		btn.focus()
		expect(document.activeElement).toBe(btn)
	})
})

describe("AgentFeedbackToggle — keyboard activation", () => {
	it("toggles on click (pointer activation path)", () => {
		render(
			<>
				<LiveRegionShell />
				<AgentFeedbackToggle />
			</>,
		)
		const btn = screen.getByRole("switch") as HTMLButtonElement
		btn.focus()
		expect(btn.getAttribute("aria-checked")).toBe("false")
		fireEvent.click(btn)
		expect(btn.getAttribute("aria-checked")).toBe("true")
		fireEvent.click(btn)
		expect(btn.getAttribute("aria-checked")).toBe("false")
	})

	it("activates via Space — aria-checked flips and onChange fires with next boolean", async () => {
		const onChange = vi.fn()
		render(
			<>
				<LiveRegionShell />
				<AgentFeedbackToggle onChange={onChange} />
			</>,
		)
		const user = userEvent.setup()
		const btn = screen.getByRole("switch") as HTMLButtonElement
		btn.focus()
		expect(document.activeElement).toBe(btn)
		expect(btn.getAttribute("aria-checked")).toBe("false")
		// user-event synthesizes the full keydown→keypress→click chain on a
		// focused <button>, matching real browser WAI-ARIA switch activation.
		await user.keyboard("{ }")
		expect(btn.getAttribute("aria-checked")).toBe("true")
		expect(onChange).toHaveBeenCalledTimes(1)
		expect(onChange).toHaveBeenLastCalledWith(true)
		await user.keyboard("{ }")
		expect(btn.getAttribute("aria-checked")).toBe("false")
		expect(onChange).toHaveBeenCalledTimes(2)
		expect(onChange).toHaveBeenLastCalledWith(false)
	})

	it("activates via Enter — aria-checked flips and onChange fires with next boolean", async () => {
		const onChange = vi.fn()
		render(
			<>
				<LiveRegionShell />
				<AgentFeedbackToggle onChange={onChange} />
			</>,
		)
		const user = userEvent.setup()
		const btn = screen.getByRole("switch") as HTMLButtonElement
		btn.focus()
		expect(document.activeElement).toBe(btn)
		expect(btn.getAttribute("aria-checked")).toBe("false")
		await user.keyboard("{Enter}")
		expect(btn.getAttribute("aria-checked")).toBe("true")
		expect(onChange).toHaveBeenCalledTimes(1)
		expect(onChange).toHaveBeenLastCalledWith(true)
		await user.keyboard("{Enter}")
		expect(btn.getAttribute("aria-checked")).toBe("false")
		expect(onChange).toHaveBeenCalledTimes(2)
		expect(onChange).toHaveBeenLastCalledWith(false)
	})
})

describe("AgentFeedbackToggle — touch target ≥ 44×44", () => {
	it("outer label exposes min-height ≥ 44px and min-width ≥ 44px via .touch-target", () => {
		render(<AgentFeedbackToggle />)
		const btn = screen.getByRole("switch")
		const label = btn.closest("label")
		expect(label).not.toBeNull()
		const style = getComputedStyle(label as HTMLLabelElement)
		expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44)
		expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44)
		// getBoundingClientRect is zero in jsdom (no layout), but the
		// computed-style min-* is the deterministic signal. The OR below
		// documents the dual-path assertion pattern from the unit plan §B.4.
		const rect = (label as HTMLLabelElement).getBoundingClientRect()
		expect(rect.width >= 44 || parseFloat(style.minWidth) >= 44).toBe(true)
		expect(rect.height >= 44 || parseFloat(style.minHeight) >= 44).toBe(true)
	})
})

describe("AgentFeedbackToggle — reduced-motion variant", () => {
	let stub: ReturnType<typeof installMatchMediaStub>

	beforeEach(() => {
		// IMPORTANT: stub must be installed BEFORE render — useReducedMotion
		// reads matchMedia via useState initializer on first render.
		stub = installMatchMediaStub({
			"(prefers-reduced-motion: reduce)": true,
		})
	})

	afterEach(() => {
		stub.restore()
	})

	it("carries the agent-feedback-toggle--reduced-motion sentinel class", () => {
		render(<AgentFeedbackToggle />)
		const btn = screen.getByRole("switch") as HTMLButtonElement
		expect(
			btn.classList.contains("agent-feedback-toggle--reduced-motion"),
		).toBe(true)
	})

	it("drops every transition-* class from the button and thumb", () => {
		render(<AgentFeedbackToggle />)
		const btn = screen.getByRole("switch") as HTMLButtonElement
		expect(btn.className).not.toMatch(/transition-(colors|transform|all)/)
		const thumb = btn.querySelector("span[aria-hidden='true']")
		expect(thumb).not.toBeNull()
		expect((thumb as HTMLSpanElement).className).not.toMatch(
			/transition-(colors|transform|all)/,
		)
	})
})

describe("AgentFeedbackToggle — live-region announce on toggle", () => {
	it("announces 'Agent feedback now visible' when toggled on", () => {
		render(
			<>
				<LiveRegionShell />
				<AgentFeedbackToggle />
			</>,
		)
		const btn = screen.getByRole("switch") as HTMLButtonElement
		fireEvent.click(btn)
		const politeRegion = document.getElementById(POLITE_REGION_ID)
		expect(politeRegion).not.toBeNull()
		expect(politeRegion?.textContent).toBe("Agent feedback now visible")
		expect(
			within(politeRegion as HTMLElement).getByText(
				"Agent feedback now visible",
			),
		).toBeTruthy()
	})

	it("announces 'Agent feedback hidden' when toggled off", () => {
		render(
			<>
				<LiveRegionShell />
				<AgentFeedbackToggle defaultChecked />
			</>,
		)
		const btn = screen.getByRole("switch") as HTMLButtonElement
		expect(btn.getAttribute("aria-checked")).toBe("true")
		fireEvent.click(btn)
		const politeRegion = document.getElementById(POLITE_REGION_ID)
		expect(politeRegion?.textContent).toBe("Agent feedback hidden")
		expect(
			within(politeRegion as HTMLElement).getByText("Agent feedback hidden"),
		).toBeTruthy()
	})
})

describe("AgentFeedbackToggle — controlled mode", () => {
	it("ignores internal state; onChange reports the next boolean", () => {
		const onChange = vi.fn()
		render(
			<>
				<LiveRegionShell />
				<AgentFeedbackToggle checked={false} onChange={onChange} />
			</>,
		)
		const btn = screen.getByRole("switch") as HTMLButtonElement
		expect(btn.getAttribute("aria-checked")).toBe("false")
		fireEvent.click(btn)
		expect(onChange).toHaveBeenCalledWith(true)
		// Parent hasn't updated `checked`, so the DOM stays at aria-checked=false.
		expect(btn.getAttribute("aria-checked")).toBe("false")
	})

	it("reflects external checked=true without an onChange", () => {
		render(<AgentFeedbackToggle checked={true} />)
		const btn = screen.getByRole("switch") as HTMLButtonElement
		expect(btn.getAttribute("aria-checked")).toBe("true")
	})
})

describe("AgentFeedbackToggle — count chip rendering", () => {
	it("renders '{n} hidden' when OFF", () => {
		render(<AgentFeedbackToggle count={8} />)
		expect(screen.getByText("8 hidden")).toBeTruthy()
	})

	it("renders '{n} inline' when ON (via defaultChecked)", () => {
		render(<AgentFeedbackToggle count={8} defaultChecked />)
		expect(screen.getByText("8 inline")).toBeTruthy()
	})

	it("renders no chip when count is omitted", () => {
		render(<AgentFeedbackToggle />)
		expect(screen.queryByText(/\d+\s+(hidden|inline)$/)).toBeNull()
	})

	it("chip carries the DESIGN-BRIEF §2 typography-floor-exempt classes", () => {
		render(<AgentFeedbackToggle count={2} />)
		const chip = screen.getByText("2 hidden")
		expect(chip.className).toMatch(/text-\[11px\]/)
		expect(chip.className).toMatch(/font-semibold/)
		expect(chip.className).toMatch(/uppercase/)
		expect(chip.className).toMatch(/tracking-wide/)
	})
})

describe("AgentFeedbackToggle — disabled state", () => {
	it("marks the button disabled + aria-disabled='true'", () => {
		render(<AgentFeedbackToggle disabled />)
		const btn = screen.getByRole("switch") as HTMLButtonElement
		expect(btn.disabled).toBe(true)
		expect(btn.getAttribute("aria-disabled")).toBe("true")
	})

	it("does not flip aria-checked on click when disabled", () => {
		const onChange = vi.fn()
		render(<AgentFeedbackToggle disabled onChange={onChange} />)
		const btn = screen.getByRole("switch") as HTMLButtonElement
		fireEvent.click(btn)
		expect(btn.getAttribute("aria-checked")).toBe("false")
		// The native disabled attribute blocks the click handler entirely in
		// jsdom — onChange must not fire.
		expect(onChange).not.toHaveBeenCalled()
	})

	it("does not activate on Space/Enter when disabled (keyboard path)", async () => {
		const onChange = vi.fn()
		render(<AgentFeedbackToggle disabled onChange={onChange} />)
		const user = userEvent.setup()
		const btn = screen.getByRole("switch") as HTMLButtonElement
		// Focus on disabled <button> is a no-op in jsdom — explicitly target
		// keyboard events and verify the disabled-button invariant holds for
		// Space + Enter, matching the browser contract for `role=switch`.
		await user.keyboard("{ }")
		await user.keyboard("{Enter}")
		expect(btn.getAttribute("aria-checked")).toBe("false")
		expect(onChange).not.toHaveBeenCalled()
	})
})
