/**
 * ThemeToggle — icon-only binary light/dark switch.
 *
 * Scope narrowing (unit-06):
 *   - Pre-unit-06 toggle cycled three states (system / dark / light) and
 *     rendered a text label alongside the icon.
 *   - Unit-06 spec requires icon-only with `aria-label="Toggle theme"` (exact
 *     string) and a binary light↔dark cycle. System preference is honored
 *     on initial load via the inline script in `index.html` + the theme
 *     init in `App.tsx`; once the user activates this button, the toggle
 *     becomes an explicit user choice that overrides system preference.
 *   - `touchTargetClass` ensures the button clears the 44×44 minimum
 *     required by `DESIGN-TOKENS.md §1.7.1` on touch surfaces.
 *
 * Source of truth:
 *   - Unit-06 scope: "ThemeToggle.tsx — aria-labeled icon-only <button>,
 *     aria-label=\"Toggle theme\", touchTargetClass applied — regression
 *     guard for the icon-only missing-label class of issue."
 *   - `DESIGN-TOKENS.md §1.7.1` (touch targets).
 *   - `stages/design/artifacts/focus-ring-spec.html §1` (canonical focus ring).
 *
 * Anti-regression: the literal string `"Toggle theme"` and the
 * `touchTargetClass` are asserted by a unit test adjacent to this file.
 */

import { useCallback, useEffect, useState } from "react"
import { focusRingClass, touchTargetClass } from "../a11y"

const KEY = "haiku-review-theme"
const SUN = "☀" // ☀ (light mode active — icon shows what a click will toggle TO in some UIs, but here we show the CURRENT state glyph)
const MOON = "☾" // ☾

function systemPrefersDark(): boolean {
	if (typeof window === "undefined" || !window.matchMedia) return false
	return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function readInitialIsDark(): boolean {
	if (typeof window === "undefined") return false
	const stored = window.localStorage.getItem(KEY)
	if (stored === "dark") return true
	if (stored === "light") return false
	return systemPrefersDark()
}

export function ThemeToggle(): React.ReactElement {
	const [isDark, setIsDark] = useState<boolean>(readInitialIsDark)

	// Keep the document class in sync with the React state. This covers the
	// case where another code path (e.g. main.tsx on first boot) already set
	// the class — after this effect lands the two are coherent.
	useEffect(() => {
		document.documentElement.classList.toggle("dark", isDark)
	}, [isDark])

	const toggle = useCallback(() => {
		setIsDark((prev) => {
			const next = !prev
			try {
				window.localStorage.setItem(KEY, next ? "dark" : "light")
			} catch {
				// localStorage unavailable (private mode, SSR). Theme still applies
				// for the current session via the useEffect above.
			}
			return next
		})
	}, [])

	return (
		<button
			type="button"
			aria-label="Toggle theme"
			title="Toggle theme"
			onClick={toggle}
			className={`${touchTargetClass} inline-flex items-center justify-center rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${focusRingClass}`}
		>
			<span aria-hidden="true" className="text-base leading-none">
				{isDark ? MOON : SUN}
			</span>
		</button>
	)
}
