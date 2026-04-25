/**
 * ThemeToggle tests (unit-06).
 *
 * Regression guards:
 *   - The literal `aria-label="Toggle theme"` is present (icon-only missing-
 *     label class of issue).
 *   - `touchTargetClass` ("touch-target") is applied to the button.
 *   - Clicking toggles the `.dark` class on <html> and persists the choice
 *     via `localStorage[haiku-review-theme]`.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ThemeToggle } from "../ThemeToggle"

describe("ThemeToggle", () => {
	beforeEach(() => {
		window.localStorage.clear()
		document.documentElement.classList.remove("dark")
	})

	afterEach(() => {
		cleanup()
		window.localStorage.clear()
		document.documentElement.classList.remove("dark")
	})

	it('renders with aria-label="Toggle theme" (exact string)', () => {
		render(<ThemeToggle />)
		const btn = screen.getByRole("button")
		expect(btn.getAttribute("aria-label")).toBe("Toggle theme")
	})

	it('applies the touchTargetClass ("touch-target")', () => {
		render(<ThemeToggle />)
		const btn = screen.getByRole("button")
		expect(btn.classList.contains("touch-target")).toBe(true)
	})

	it("toggles the dark class on <html> and persists the choice", () => {
		render(<ThemeToggle />)
		const btn = screen.getByRole("button")

		expect(document.documentElement.classList.contains("dark")).toBe(false)

		fireEvent.click(btn)
		expect(document.documentElement.classList.contains("dark")).toBe(true)
		expect(window.localStorage.getItem("haiku-review-theme")).toBe("dark")

		fireEvent.click(btn)
		expect(document.documentElement.classList.contains("dark")).toBe(false)
		expect(window.localStorage.getItem("haiku-review-theme")).toBe("light")
	})

	it("icon-only: the only non-hidden textContent is the glyph (no 'Dark'/'Light' labels)", () => {
		render(<ThemeToggle />)
		const btn = screen.getByRole("button")
		// The text "Dark"/"Light"/"System" must not appear as a visible label.
		expect(btn.textContent).not.toMatch(/Dark|Light|System/)
	})
})
