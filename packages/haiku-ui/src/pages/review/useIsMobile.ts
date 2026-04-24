/**
 * useIsMobile — deterministic responsive-branch hook for the review page.
 *
 * Returns `true` when the viewport is narrower than the `xl` breakpoint
 * (1280px), which matches DESIGN-TOKENS `--breakpoint-xl` (80rem). The
 * review page uses this to flip between the desktop two-column layout
 * (artifacts pane + sidebar) and the mobile one-column layout (stacked
 * column + FAB + sheet).
 *
 * Why a hook and not a media query: Tailwind's `xl:flex` emits an `@media`
 * rule that jsdom does not evaluate, so the responsive-parity test would
 * see identical DOM regardless of viewport. This hook reads
 * `window.matchMedia("(max-width: 1279px)")` which the test stubs per
 * render — giving us a deterministic branch. See unit-07 tactical plan §8.
 *
 * Breakpoint source: `--breakpoint-xl: 80rem` (1280px) in `src/index.css`
 * `@theme` block. We use the literal `1279px` max-width (= 1280 - 1) so
 * there is no `getComputedStyle` round-trip; the value is pinned to the
 * Tailwind v4 `xl` breakpoint definition.
 */

import { useEffect, useState } from "react"

export const MOBILE_MEDIA_QUERY = "(max-width: 1279px)"

function readInitialMatches(): boolean {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return false
	}
	return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

export function useIsMobile(): boolean {
	const [isMobile, setIsMobile] = useState<boolean>(readInitialMatches)

	useEffect(() => {
		if (
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function"
		) {
			return
		}
		const mql = window.matchMedia(MOBILE_MEDIA_QUERY)
		const handler = (e: MediaQueryListEvent | MediaQueryList): void => {
			setIsMobile(e.matches)
		}
		// Prime with current value — covers the case where matchMedia was
		// stubbed after initial render (common in tests that mount then
		// re-stub).
		handler(mql)
		if (typeof mql.addEventListener === "function") {
			mql.addEventListener(
				"change",
				handler as (e: MediaQueryListEvent) => void,
			)
			return () => {
				mql.removeEventListener(
					"change",
					handler as (e: MediaQueryListEvent) => void,
				)
			}
		}
		// Legacy Safari fallback.
		if (typeof mql.addListener === "function") {
			mql.addListener(handler as (e: MediaQueryListEvent) => void)
			return () => {
				mql.removeListener(handler as (e: MediaQueryListEvent) => void)
			}
		}
		return undefined
	}, [])

	return isMobile
}
