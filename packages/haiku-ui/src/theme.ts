/**
 * Theme bootstrap helpers.
 *
 * Single source of truth for the localStorage key + the pure "apply current
 * preference to <html>" function. Three consumers:
 *   - `index.html` inline script (synchronous, pre-React, prevents FOUC).
 *     Note: that script is duplicated inline because we can't load an ES
 *     module synchronously before React hydrates.
 *   - `App.tsx` mount effect + matchMedia listener (reactive to OS changes
 *     while no explicit choice is stored).
 *   - `ThemeToggle.tsx` (reads the same key when writing the user's choice).
 */

export const THEME_KEY = "haiku-review-theme"

export function applyThemePreference(): void {
	if (typeof document === "undefined") return
	const stored = window.localStorage.getItem(THEME_KEY)
	const isDark =
		stored === "dark" ||
		(!stored &&
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches)
	document.documentElement.classList.toggle("dark", isDark)
}
