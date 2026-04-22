/**
 * FeedbackSheet — mobile bottom-sheet modal backed by native <dialog> (unit-10).
 *
 * Canonical references:
 *   - stages/development/units/unit-10-feedback-sheet-mobile.md — scope +
 *     completion criteria.
 *   - stages/development/artifacts/unit-10-tactical-plan.md §A — component
 *     tree, effect wiring, focus-trap / reduced-motion decisions.
 *   - stages/design/artifacts/feedback-inline-mobile.html lines 244–407 —
 *     canonical visible markup.
 *   - packages/haiku-ui/BROWSER-SUPPORT.md — native <dialog> policy, jsdom
 *     caveats, DESIGN-BRIEF §6 line 838 divergence rationale.
 *
 * CSS selector alignment (FB-34): the rendered root is a native
 * `<dialog className="feedback-sheet">`, which is exactly what the
 * `dialog.feedback-sheet` block in `packages/haiku-ui/src/index.css`
 * (lines ~240-305) selects. Backdrop, `::backdrop` blur, `sheet-up`
 * slide-in animation, `backdrop-fade-in`, and the reduced-motion guards
 * in that block all paint on this element. The previous
 * `<div role="dialog">` placeholder (which the CSS selectors did NOT
 * match) has been replaced by this native-dialog implementation — do
 * NOT regress the root element back to a div without also rewriting
 * every `dialog.feedback-sheet` selector in index.css.
 *
 * Architecture:
 *   - The <dialog> element renders unconditionally in the DOM; `open` drives
 *     an imperative `showModal()` / `close()` call in an effect.
 *   - Platform-native `<dialog>` provides top-layer, background `inert`, and
 *     focus-trap — in REAL browsers. In jsdom the top-layer is not emulated,
 *     so we reuse `useFocusTrap(dialogRef, open)` from the a11y foundation
 *     as both the jsdom emulation and a belt-and-suspenders guard for edge
 *     cases (iframe-inside-dialog, shadow DOM tabbable discovery).
 *   - `useFocusTrap` snapshots `document.activeElement` on enable and
 *     restores it on disable, giving us FAB-restore "for free". We do not
 *     duplicate the focus call manually — duplicate focus thrashes screen
 *     readers.
 *   - Backdrop click: native <dialog> does not auto-close on backdrop click.
 *     A `click` listener on the dialog element closes when
 *     `event.target === dialogRef.current` (the click fell through to the
 *     `<dialog>` element itself — i.e. the backdrop). MDN documents this
 *     pattern.
 *   - Escape: native <dialog> fires a `cancel` event and then closes on
 *     Escape. We do NOT `preventDefault` on `cancel`; the default
 *     `close` event is the canonical cleanup trigger.
 *   - Reduced motion: `useReducedMotion()` swaps the `sheet-enter` slide-up
 *     animation class for a `sheet-enter--reduced` sentinel. The sentinel
 *     has no CSS body — it is a greppable marker for the test harness. The
 *     global `@media (prefers-reduced-motion: reduce)` guard in
 *     `src/index.css` also clamps animation-duration to 0.01ms, so even if
 *     the class stayed present the sheet would appear instantly.
 *
 * Controlled-only API: the parent owns `open` and supplies `onClose`. There
 * is no uncontrolled-open variant — the FAB pair (`FeedbackFloatingButton`)
 * is always the trigger and always lives one level up.
 */

import type { ReactNode, RefObject } from "react"
import { useEffect, useRef } from "react"
import {
	focusRingClass,
	touchTargetClass,
	useFocusTrap,
	useReducedMotion,
} from "../../a11y"

export interface FeedbackSheetProps {
	/** Current open state. Drives `dialog.showModal()` / `dialog.close()`. */
	open: boolean
	/**
	 * Fires when the sheet closes through any path (Escape, backdrop click,
	 * explicit close button). Parent is responsible for flipping `open` to
	 * `false` in response.
	 */
	onClose: () => void
	/**
	 * Ref to the FAB that opened the sheet. The `useFocusTrap` hook snapshots
	 * the prior `document.activeElement` on enable and restores it on disable,
	 * so passing this ref is a belt-and-suspenders contract for downstream
	 * consumers that may want to re-focus the trigger imperatively. Not
	 * currently used internally — documented here to stay stable if the
	 * component's close-side behavior evolves.
	 */
	triggerRef?: RefObject<HTMLButtonElement | null>
	/** Accessible-name id override. Defaults to `"feedback-sheet-title"`. */
	titleId?: string
	/** Heading content; defaults to the string `"Feedback"`. */
	title?: ReactNode
	/** Sheet body contents (AgentFeedbackToggle, FeedbackList, footer). */
	children?: ReactNode
	/** `id` on the <dialog>; wires with FAB's `aria-controls`. */
	id?: string
	/** Extra class names appended to the dialog root. */
	className?: string
}

const DIALOG_BASE_CLASS = [
	"feedback-sheet",
	"fixed inset-0 z-50",
	"flex flex-col",
	"text-stone-900 dark:text-stone-100",
].join(" ")

const HEADER_CLASS = [
	"feedback-sheet__header",
	"shrink-0 px-4 py-3",
	"border-b border-stone-200 dark:border-stone-700",
	"flex items-center justify-between",
].join(" ")

const CLOSE_BUTTON_CLASS = [
	"feedback-sheet__close",
	"text-stone-600 dark:text-stone-300",
	"hover:text-stone-800 dark:hover:text-stone-100",
	"inline-flex items-center justify-center",
	"text-lg",
].join(" ")

const BODY_CLASS = ["feedback-sheet__body", "flex-1 overflow-y-auto"].join(" ")

export function FeedbackSheet({
	open,
	onClose,
	triggerRef,
	titleId,
	title,
	children,
	id,
	className,
}: FeedbackSheetProps): React.ReactElement {
	const dialogRef = useRef<HTMLDialogElement>(null)
	const prefersReducedMotion = useReducedMotion()

	const resolvedTitleId = titleId ?? "feedback-sheet-title"
	const resolvedId = id ?? "feedback-sheet"
	const resolvedTitle: ReactNode = title ?? "Feedback"

	// Imperative open/close + scroll-lock + listener wiring.
	//
	// Hook-order note: this effect is intentionally registered BEFORE
	// useFocusTrap below. Effect cleanups run in reverse of registration
	// order, so when `open` flips false: useFocusTrap's cleanup runs first
	// (restoring focus to its snapshotted priorFocus, typically `document.body`
	// in contexts where the FAB wasn't focused prior to the sheet opening),
	// and THIS effect's cleanup runs second — giving us the last word on
	// restoring focus to the FAB per unit spec CC3 "Focus returns to FAB".
	useEffect(() => {
		const dialog = dialogRef.current
		if (!dialog) return

		function handleClose(): void {
			onClose()
		}

		function handleClick(event: MouseEvent): void {
			// Backdrop click — native <dialog> does not auto-close on backdrop.
			// event.target === dialog means the click fell through to the
			// <dialog> itself (i.e. the pseudo-element backdrop area).
			if (!dialog) return
			if (event.target === dialog) {
				dialog.close()
			}
		}

		// Escape keydown → close (FB-60).
		//
		// Native <dialog> fires `cancel` → `close` on Escape automatically in
		// real browsers, but jsdom does NOT auto-fire `cancel` on keydown. This
		// handler is a belt-and-suspenders emulation that:
		//   - In jsdom, IS the close path the test exercises — dispatching a
		//     real keydown on the dialog root drives the same `dialog.close()`
		//     → `close` event → onClose() → FAB focus restore chain the
		//     platform runs in production.
		//   - In real browsers, it is redundant with the native cancel/close
		//     pipeline. Calling `dialog.close()` on an already-closing dialog
		//     is a no-op once `open` is false (the polyfill and the spec both
		//     early-return when the attribute is missing), so the double-call
		//     is safe.
		// Wired alongside `click` + `close` so it lives and dies with `open`.
		function handleKeyDown(event: KeyboardEvent): void {
			if (!dialog) return
			if (event.key === "Escape") {
				// Do NOT preventDefault — the native `cancel` default (close)
				// is the canonical cleanup trigger. In jsdom the native path
				// no-ops, so we proactively drive close() here.
				dialog.close()
			}
		}

		if (open) {
			// Guard against InvalidStateError when already open.
			if (!dialog.open) {
				// showModal is not fully implemented in older jsdom. The test
				// harness polyfills it; production browsers use the real impl.
				if (typeof dialog.showModal === "function") {
					try {
						dialog.showModal()
					} catch {
						// Last-resort fallback — force the attribute so tests
						// + any degraded environment still observe the dialog
						// as open. Real browsers never hit this path.
						dialog.setAttribute("open", "")
					}
				} else {
					dialog.setAttribute("open", "")
				}
			}
			// Belt-and-suspenders scroll lock — native showModal() already
			// sets overflow:hidden on <html> in most browsers; setting it
			// here makes the behavior deterministic in jsdom tests and any
			// environment where the platform doesn't handle it.
			document.documentElement.style.overflow = "hidden"

			dialog.addEventListener("close", handleClose)
			dialog.addEventListener("click", handleClick)
			dialog.addEventListener("keydown", handleKeyDown)

			return () => {
				dialog.removeEventListener("close", handleClose)
				dialog.removeEventListener("click", handleClick)
				dialog.removeEventListener("keydown", handleKeyDown)
				document.documentElement.style.overflow = ""
				// Restore focus to the FAB. Runs AFTER useFocusTrap's cleanup
				// (which may have restored focus to a stale priorFocus) because
				// cleanups run in reverse order of effect registration — and
				// this effect is registered before useFocusTrap. The unit spec
				// is explicit: "Focus returns to FAB".
				const fab = triggerRef?.current
				if (fab && document.contains(fab)) {
					try {
						fab.focus()
					} catch {
						// Defensive: some environments throw when focusing a
						// detached or non-focusable node. Swallow — a11y-layer
						// priorFocus restore has already happened.
					}
				}
			}
		}

		if (!open && dialog.open) {
			if (typeof dialog.close === "function") {
				try {
					dialog.close()
				} catch {
					dialog.removeAttribute("open")
				}
			} else {
				dialog.removeAttribute("open")
			}
			document.documentElement.style.overflow = ""
		}

		return undefined
	}, [open, onClose, triggerRef])

	// Focus-trap: handles initial-focus + Tab/Shift-Tab wrap + restore-on-close.
	// Reused from the a11y foundation so jsdom tests (which do not emulate the
	// native top-layer) still pass the Tab-doesn't-escape assertion. In real
	// browsers the native top-layer enforces the same contract; the hook is a
	// belt-and-suspenders guard. Registered AFTER the imperative effect above
	// so its cleanup runs FIRST on close — the paired effect then has the
	// final word on where focus lands (the FAB, per CC3).
	useFocusTrap(dialogRef, open)

	// Animation class — only applied while open. Under reduced-motion we swap
	// the `sheet-enter` slide-up class for the `sheet-enter--reduced` sentinel
	// so the test can assert className presence without depending on CSS.
	const animationClass = open
		? prefersReducedMotion
			? "sheet-enter--reduced"
			: "sheet-enter"
		: ""

	const dialogClassName = [DIALOG_BASE_CLASS, animationClass, className ?? ""]
		.filter(Boolean)
		.join(" ")

	return (
		<dialog
			ref={dialogRef}
			id={resolvedId}
			aria-labelledby={resolvedTitleId}
			aria-modal="true"
			// biome-ignore lint/a11y/noRedundantRoles: Unit-10 completion criterion requires explicit role="dialog" + aria-modal on the sheet root — belt-and-suspenders for axe audits and RTL `getByRole` ergonomics in environments (jsdom, some legacy screen readers) where the implicit <dialog> role is not always surfaced.
			role="dialog"
			data-testid="feedback-sheet"
			className={dialogClassName}
		>
			<header className={HEADER_CLASS}>
				<h2
					id={resolvedTitleId}
					className="text-sm font-semibold text-stone-700 dark:text-stone-300"
				>
					{resolvedTitle}
				</h2>
				<button
					type="button"
					onClick={() => {
						const dialog = dialogRef.current
						if (dialog && typeof dialog.close === "function") {
							try {
								dialog.close()
								return
							} catch {
								// Fall through to onClose() below.
							}
						}
						onClose()
					}}
					aria-label="Close feedback panel"
					className={[
						CLOSE_BUTTON_CLASS,
						touchTargetClass,
						focusRingClass,
					].join(" ")}
					data-testid="feedback-sheet-close"
				>
					<span aria-hidden="true">&times;</span>
				</button>
			</header>
			<div className={BODY_CLASS}>{children}</div>
		</dialog>
	)
}
