import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { touchTargetClass, touchTargetHitAreaClass } from "../touch-target"
import {
	injectCanonicalTouchTargetCss,
	loadCanonicalTouchTargetRules,
	readCanonicalIndexCss,
} from "./touch-target-css"

afterEach(() => {
	cleanup()
})

/**
 * jsdom doesn't implement layout (getBoundingClientRect returns zeros), and
 * it only applies CSS from `<style>` tags in the document — not from
 * external imports. To close the FB-40 circularity (tests that prove
 * jsdom's CSS resolver rather than prove `index.css` is correct), we load
 * the canonical `.touch-target` rules from `packages/haiku-ui/src/index.css`
 * at test time and inject them verbatim. If the shipped CSS rule is
 * deleted, renamed, or shrunk below 44×44, these tests fail — which is
 * exactly the WCAG 2.5.5 contract we want to enforce.
 */
beforeAll(() => {
	injectCanonicalTouchTargetCss("touch-target-css")
})

describe("touchTargetClass token", () => {
	it("emits the canonical 'touch-target' class string", () => {
		expect(touchTargetClass).toBe("touch-target")
	})

	it("renders a 20x20 icon button with ≥44×44 computed min dimensions", () => {
		const { container } = render(
			<button
				type="button"
				className={`w-5 h-5 ${touchTargetClass}`}
				data-testid="btn"
			>
				x
			</button>,
		)
		const el = container.querySelector(
			"[data-testid='btn']",
		) as HTMLButtonElement
		const style = getComputedStyle(el)
		expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44)
		expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44)
		// Visible geometry (className still carries w-5 h-5) is unchanged
		// — the class reports the expansion via min-* sizing.
		expect(el.classList.contains("touch-target")).toBe(true)
		expect(el.classList.contains("w-5")).toBe(true)
		expect(el.classList.contains("h-5")).toBe(true)
	})
})

describe("touchTargetHitAreaClass token", () => {
	it("emits the canonical 'touch-target touch-target--hit-area' combo", () => {
		expect(touchTargetHitAreaClass).toBe("touch-target touch-target--hit-area")
	})

	it("renders with the hit-area modifier class applied", () => {
		const { container } = render(
			<button
				type="button"
				className={`w-7 h-7 ${touchTargetHitAreaClass}`}
				data-testid="pin"
			>
				•
			</button>,
		)
		const el = container.querySelector(
			"[data-testid='pin']",
		) as HTMLButtonElement
		expect(el.classList.contains("touch-target")).toBe(true)
		expect(el.classList.contains("touch-target--hit-area")).toBe(true)
	})
})

/**
 * FB-40 regression tests — pure token-value assertions against the real
 * `src/index.css`. These don't rely on jsdom's CSS resolver at all; they
 * read the shipped stylesheet and assert the canonical values directly,
 * so a regression in `index.css` is caught regardless of whether jsdom
 * got the CSS "wired up" correctly in the test harness.
 */
describe("canonical .touch-target CSS in src/index.css (FB-40)", () => {
	it("ships a .touch-target rule with min-height: 44px and min-width: 44px", () => {
		const { touchTarget } = loadCanonicalTouchTargetRules()
		// WCAG 2.5.5 minimum — verified against the actual file on disk.
		expect(touchTarget["min-height"]).toBe("44px")
		expect(touchTarget["min-width"]).toBe("44px")
		// position: relative is required so the ::before pseudo for the
		// hit-area variant anchors correctly.
		expect(touchTarget.position).toBe("relative")
	})

	it("ships a .touch-target.touch-target--hit-area override that unsets min sizing", () => {
		const { touchTargetHitArea } = loadCanonicalTouchTargetRules()
		// The invisible hit-area variant must NOT inflate visible geometry —
		// the sizing comes from the ::before pseudo, not the element itself.
		expect(touchTargetHitArea["min-height"]).toBe("unset")
		expect(touchTargetHitArea["min-width"]).toBe("unset")
	})

	it("ships a ::before pseudo-element sized to 44×44 for the hit-area variant", () => {
		// The ::before rule lives as its own top-level block in index.css;
		// read the raw CSS and confirm the 44×44 pseudo rule is present.
		const css = readCanonicalIndexCss()
		const pseudoMatch = css.match(
			/\.touch-target\.touch-target--hit-area::before\s*\{([^}]*)\}/,
		)
		expect(pseudoMatch).not.toBeNull()
		const body = pseudoMatch?.[1] ?? ""
		expect(body).toMatch(/width:\s*44px/)
		expect(body).toMatch(/height:\s*44px/)
		expect(body).toMatch(/position:\s*absolute/)
	})
})
