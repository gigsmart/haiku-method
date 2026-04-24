/**
 * FeedbackFloatingButton — mobile FAB trigger for the FeedbackSheet (unit-10).
 *
 * Canonical references:
 *   - DESIGN-BRIEF.md §6 line 832 — FAB carries `aria-haspopup="dialog"`,
 *     `aria-expanded`, `aria-controls="feedback-sheet"`, and the dynamic
 *     accessible name `"Open feedback panel, {count} pending"` when pending
 *     count > 0, else `"Open feedback panel"`.
 *   - stages/design/artifacts/feedback-inline-mobile.html lines 194–208 —
 *     canonical visible markup (fixed bottom-right, circular, teal-600, 14×14
 *     tailwind = 56×56 CSS px, decorative `feedback-fab-pulse` animation).
 *   - stages/development/artifacts/unit-10-tactical-plan.md §B — API shape,
 *     ref-forwarding contract, pulse animation gating.
 *
 * Opt-in compositional pair with `FeedbackSheet`:
 *
 *   const fabRef = useRef<HTMLButtonElement>(null)
 *   const [open, setOpen] = useState(false)
 *   <FeedbackFloatingButton
 *     ref={fabRef}
 *     open={open}
 *     onToggle={() => setOpen((o) => !o)}
 *     count={pendingCount}
 *   />
 *   <FeedbackSheet open={open} onClose={() => setOpen(false)} triggerRef={fabRef}>
 *     {...sheet contents}
 *   </FeedbackSheet>
 *
 * The FAB itself does not own the sheet state — the parent review page does,
 * so the same `open` boolean can drive the FAB's `aria-expanded` and the
 * dialog's `showModal()`/`close()` imperative lifecycle.
 */

import { forwardRef } from "react"
import { focusRingClass, touchTargetClass } from "../../a11y"

export interface FeedbackFloatingButtonProps {
	/** Current open state of the paired FeedbackSheet. Drives `aria-expanded`. */
	open: boolean
	/**
	 * Fires when the user clicks the FAB. The parent is responsible for
	 * flipping its `open` state.
	 */
	onToggle: () => void
	/**
	 * Pending-count badge. When > 0, a visible amber chip renders with the
	 * count AND the accessible name becomes
	 * `"Open feedback panel, {count} pending"`. Undefined or 0 renders no
	 * badge and the shorter `"Open feedback panel"` label.
	 */
	count?: number
	/** `id` of the paired dialog — wires `aria-controls`. Defaults to
	 *  `"feedback-sheet"` which is also the default `FeedbackSheet` id. */
	ariaControlsId?: string
	/** Optional className passthrough; appended to the canonical classes. */
	className?: string
}

const BASE_BUTTON_CLASSES = [
	"fixed bottom-4 right-4 z-50",
	"w-14 h-14 rounded-full",
	"bg-teal-700 hover:bg-teal-800 dark:bg-teal-700 dark:hover:bg-teal-800",
	"text-white text-lg",
	"shadow-lg",
	"inline-flex items-center justify-center",
	"md:hidden",
	"feedback-fab-pulse",
].join(" ")

// FB-70: light-mode text lifted from `text-amber-700` (3.68:1 on amber-100 — AA FAIL
// for 12px bold) to `text-amber-800` (6.37:1 — AA pass). Dark-mode pair
// `amber-300 on amber-900/40` already comfortably clears AA.
const BADGE_CLASSES = [
	"absolute -top-1 -right-1",
	"inline-flex items-center justify-center",
	"min-w-[20px] h-[20px] rounded-full",
	"text-xs font-bold",
	"bg-amber-100 text-amber-800",
	"dark:bg-amber-900/40 dark:text-amber-300",
	"border-2 border-white dark:border-stone-900",
].join(" ")

export const FeedbackFloatingButton = forwardRef<
	HTMLButtonElement,
	FeedbackFloatingButtonProps
>(function FeedbackFloatingButton(
	{ open, onToggle, count, ariaControlsId, className },
	ref,
) {
	const hasBadge = typeof count === "number" && count > 0
	const label = hasBadge
		? `Open feedback panel, ${count} pending`
		: "Open feedback panel"

	const composedClass = [
		BASE_BUTTON_CLASSES,
		touchTargetClass,
		focusRingClass,
		className ?? "",
	]
		.filter(Boolean)
		.join(" ")

	return (
		<button
			ref={ref}
			type="button"
			onClick={onToggle}
			aria-haspopup="dialog"
			aria-expanded={open ? "true" : "false"}
			aria-controls={ariaControlsId ?? "feedback-sheet"}
			aria-label={label}
			className={composedClass}
			data-testid="feedback-fab"
		>
			<span aria-hidden="true">&#x1F4AC;</span>
			{hasBadge ? (
				<span className={BADGE_CLASSES} aria-hidden="true">
					{count}
				</span>
			) : null}
		</button>
	)
})
