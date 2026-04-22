/**
 * Skip-to-main-content link — first focusable element on every page.
 *
 * Source of truth:
 *   - `stages/design/artifacts/skip-link-spec.html §1` (canonical pattern)
 *   - `stages/design/artifacts/aria-landmark-spec.md §1, §7` (DOM order + target id)
 *   - Unit-06 completion criteria: "Skip-link renders first in tab order in
 *     every page ... Regression guard for missing-skip-link class of issue."
 *
 * The anchor is `sr-only` until it receives keyboard focus, at which point
 * `focus-visible:not-sr-only` makes it visible in the top-left corner at
 * `z-[100]`, above the sticky header. Activation jumps focus to the `<main>`
 * element (its `tabIndex={-1}` from the Main landmark primitive allows
 * programmatic focus).
 *
 * Activation details: we attach an explicit `onClick` handler that
 *   1. updates `window.location.hash` to `#main-content` (so deep-linking /
 *      history / "Return to top" style affordances still work), and
 *   2. programmatically focuses the `<main>` target.
 *
 * This is intentional belt-and-suspenders: native anchor-click focus hand-off
 * to a hash target is inconsistent across browsers (older Safari bugs, some
 * Firefox versions, and jsdom in tests) — the explicit handler guarantees
 * focus lands on `<main>` regardless of runtime. Per WAI-ARIA APG skip-link
 * pattern recommendation.
 */

import type { MouseEvent } from "react"

const MAIN_CONTENT_ID = "main-content"

function activate(event: MouseEvent<HTMLAnchorElement>): void {
	// Respect modifier-click behavior (open in new tab, etc.) — don't hijack.
	if (
		event.defaultPrevented ||
		event.metaKey ||
		event.ctrlKey ||
		event.shiftKey ||
		event.altKey ||
		event.button !== 0
	) {
		return
	}
	const target = document.getElementById(MAIN_CONTENT_ID)
	if (!target) return
	event.preventDefault()
	// Update the hash so the URL reflects activation (back/forward, deep link).
	if (window.location.hash !== `#${MAIN_CONTENT_ID}`) {
		window.location.hash = MAIN_CONTENT_ID
	}
	target.focus()
}

export function SkipLink(): React.ReactElement {
	return (
		<a
			href={`#${MAIN_CONTENT_ID}`}
			onClick={activate}
			className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[100] focus-visible:px-3 focus-visible:py-2 focus-visible:bg-teal-700 focus-visible:text-white focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900 focus-visible:outline-none focus-visible:shadow-lg focus-visible:font-medium"
		>
			Skip to main content
		</a>
	)
}
