/**
 * Focus-ring tokens + useFocusTrap hook per
 * `stages/design/artifacts/focus-ring-spec.html §1–§2` and
 * `aria-landmark-spec.md §3` (dialog focus-trap contract).
 *
 * Note on focus-trap-react: aria-landmark-spec.md §3 names the library, but
 * unit-05 scope authors `useFocusTrap` directly. ~60 LOC for the hook beats
 * adding a ~40 KB dep. Downstream dialog units (revisit modal, feedback sheet,
 * annotation popover) call this hook. If a future spec genuinely needs the
 * library's edge-case handling (iframe-inside-dialog, shadow-DOM tabbable
 * discovery), swap it in then — not speculatively here.
 */

import { type RefObject, useEffect } from "react"

// ── Canonical focus-ring tokens ────────────────────────────────────────────

/**
 * Canonical focus ring per focus-ring-spec.html §1.
 * 2px solid teal-500, 2px outer offset, :focus-visible only.
 * Applied to every button, link, input, textarea, [tabindex="0"].
 */
export const focusRingClass =
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900"

/**
 * Compact variant per focus-ring-spec.html §1a — same 2px ring, 1px outer
 * offset. Used inside dense card stacks (feedback list, agent-mine list)
 * where 2px offset visually merges with adjacent card borders.
 *
 * DO NOT reduce the ring width — the spec is explicit that no 1px-ring
 * option exists.
 */
export const focusRingCompactClass =
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-stone-900"

/**
 * Variant-matched rings per focus-ring-spec.html §2. Allowed ONLY for
 * semantically-loaded primary-action buttons. Every other element uses
 * `focusRingClass`.
 */
export const focusRingVariantClasses = {
	/** Green-500 ring — Approve primary buttons. */
	approve:
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900",
	/** Amber-500 ring — Request Changes / Confirm Revisit. */
	requestChanges:
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900",
	/** Red-500 ring — destructive primary (Delete feedback, Discard draft). */
	destructive:
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900",
} as const

export type FocusRingVariant = keyof typeof focusRingVariantClasses

/**
 * Prefix every whitespace-separated token in `className` with `focus-visible:`.
 * Tokens already prefixed pass through unchanged. Empty input returns "".
 *
 * Example:
 *   focusVisibleOnly("outline-none ring-2")
 *     → "focus-visible:outline-none focus-visible:ring-2"
 */
export function focusVisibleOnly(className: string): string {
	if (!className.trim()) return ""
	return className
		.split(/\s+/)
		.filter(Boolean)
		.map((token) =>
			token.startsWith("focus-visible:") ? token : `focus-visible:${token}`,
		)
		.join(" ")
}

// ── useFocusTrap ───────────────────────────────────────────────────────────

/**
 * Canonical tabbable selector. Post-filter the result for [aria-hidden="true"]
 * and [inert] — these are valid on otherwise-tabbable elements but should not
 * receive focus.
 */
const TABBABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	'input:not([disabled]):not([type="hidden"])',
	"select:not([disabled])",
	"textarea:not([disabled])",
	'[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(",")

function getTabbable(container: HTMLElement): HTMLElement[] {
	const nodes = Array.from(
		container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR),
	)
	return nodes.filter((el) => {
		if (el.getAttribute("aria-hidden") === "true") return false
		// `inert` is a boolean attribute; presence alone disqualifies.
		if (el.hasAttribute("inert")) return false
		return true
	})
}

/**
 * Traps focus inside `ref.current` while `enabled` is true. On activation:
 *   - snapshots document.activeElement (the trigger)
 *   - moves focus to the first tabbable child (or the container itself)
 *   - installs Tab / Shift+Tab wrap on the container
 * On deactivation (enabled → false, or unmount):
 *   - removes the listener
 *   - restores focus to the snapshotted trigger if still in the document
 */
export function useFocusTrap(
	ref: RefObject<HTMLElement | null>,
	enabled: boolean,
): void {
	useEffect(() => {
		if (!enabled) return
		const container = ref.current
		if (!container) return

		const priorFocus = document.activeElement as HTMLElement | null

		// Move focus to the first tabbable child; fall back to the container.
		const tabbables = getTabbable(container)
		if (tabbables.length > 0) {
			tabbables[0]?.focus()
		} else {
			// Ensure the container itself is focusable so focus lands somewhere.
			if (!container.hasAttribute("tabindex")) {
				container.setAttribute("tabindex", "-1")
			}
			container.focus()
		}

		function handleKeydown(event: KeyboardEvent): void {
			if (event.key !== "Tab") return
			// Re-read tabbables on each keypress so dynamic content is respected.
			if (!container) return
			const current = getTabbable(container)
			if (current.length === 0) {
				event.preventDefault()
				return
			}
			const first = current[0]
			const last = current[current.length - 1]
			const active = document.activeElement as HTMLElement | null

			if (event.shiftKey) {
				if (active === first || !container.contains(active)) {
					event.preventDefault()
					last?.focus()
				}
			} else {
				if (active === last || !container.contains(active)) {
					event.preventDefault()
					first?.focus()
				}
			}
		}

		container.addEventListener("keydown", handleKeydown)

		return () => {
			// Guard against test-teardown races where React flushes the
			// passive-effect cleanup after vitest has cleared the jsdom
			// globals (container / document). Nothing to restore in that
			// case, and no listener to remove.
			try {
				if (!container || typeof document === "undefined" || !document) return
				container.removeEventListener("keydown", handleKeydown)
				if (priorFocus && document.contains(priorFocus)) {
					priorFocus.focus()
				}
			} catch {
				// Some elements (detached, non-focusable) can throw in older
				// environments; swallow defensively so an unmount never
				// escapes a React effect cleanup.
			}
		}
	}, [enabled, ref])
}
