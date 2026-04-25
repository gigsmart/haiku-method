/**
 * Reduced-motion hook + helper per
 * `stages/design/artifacts/motion-and-reduced-motion-spec.md` (RFC 2119 rule:
 * every animation MUST have a `prefers-reduced-motion: reduce` fallback).
 *
 * `useReducedMotion()` subscribes to the `(prefers-reduced-motion: reduce)`
 * media query and returns the current boolean state.
 *
 * `motionSafeClass(classes, prefersReducedMotion)` is a pure helper. Pass the
 * boolean from `useReducedMotion()` into it at the top of your component and
 * thread the result through. Not a hook — keeps the render path explicit.
 *
 * SSR behavior: when `typeof window === "undefined"`, useReducedMotion returns
 * `false` (don't drop motion on initial render — hydration then takes over).
 */

import { useEffect, useState } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

function readInitialMatches(): boolean {
	if (typeof window === "undefined") return false
	if (typeof window.matchMedia !== "function") return false
	try {
		return window.matchMedia(QUERY).matches
	} catch {
		return false
	}
}

export function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState<boolean>(() => readInitialMatches())

	useEffect(() => {
		if (typeof window === "undefined") return
		if (typeof window.matchMedia !== "function") return
		const mql = window.matchMedia(QUERY)
		// Sync once on mount in case the initial read missed a late stub install.
		setReduced(mql.matches)

		function onChange(event: MediaQueryListEvent): void {
			setReduced(event.matches)
		}

		if (typeof mql.addEventListener === "function") {
			mql.addEventListener("change", onChange)
			return () => {
				mql.removeEventListener("change", onChange)
			}
		}
		// Legacy Safari (< 14) path — should not hit in our jsdom setup but
		// present for completeness.
		if (typeof mql.addListener === "function") {
			mql.addListener(onChange)
			return () => {
				mql.removeListener(onChange)
			}
		}
	}, [])

	return reduced
}

/**
 * Pure helper. Returns `""` when `prefersReducedMotion` is true, else returns
 * `classes`. Use for conditional transition/animation classes:
 *
 *   const reduced = useReducedMotion()
 *   <div className={motionSafeClass("transition-transform duration-300", reduced)} />
 */
export function motionSafeClass(
	classes: string,
	prefersReducedMotion: boolean,
): string {
	return prefersReducedMotion ? "" : classes
}
