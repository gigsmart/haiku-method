/**
 * AgentFeedbackToggle — dedicated regression guard per unit-09.
 *
 * Canonical references:
 *   - DESIGN-BRIEF.md §2 `AgentFeedbackToggle` (lines 342–403)
 *     aria-label="Show agent feedback inline" — the trailing word preserves
 *     the inline-interleaved semantic, verified by the stage-wide audit.
 *   - stages/design/artifacts/agent-feedback-toggle-spec.html §1 — canonical
 *     visible markup (label-wraps-button + thumb span + visible label text +
 *     optional count chip).
 *   - stages/development/artifacts/unit-09-tactical-plan.md — scope, risks,
 *     test harness decisions (useAnnounce call-site resolution, matchMedia
 *     stub placement, touch-target CSS injection pattern, aria-checked
 *     string-literal serialization, etc.).
 *
 * Prior implementations shipped a `<div>` masquerading as a toggle. This
 * component closes that class of defect with a native
 * `<button role="switch">`, a 44×44 `touchTargetClass` hit area on the outer
 * label, the exact canonical `aria-label`, `aria-checked` written as
 * `"true"`/`"false"` string literals, a `useAnnounce()` polite announcement
 * on every state change, and a `useReducedMotion()`-gated animation swap.
 *
 * Controlled/uncontrolled API (React convention — supply `checked` OR
 * `defaultChecked`, never both):
 *   - Uncontrolled: omit `checked`; supply optional `defaultChecked`
 *     (default `false`). Internal `useState` tracks toggle state.
 *   - Controlled: supply `checked`; internal state is ignored; parent owns
 *     the update via `onChange`.
 *
 * `count` is optional. When supplied, a visible chip reads
 *   - OFF: `"{count} hidden"` (muted count of agent items hidden from the
 *     inline list)
 *   - ON: `"{count} inline"` (count of agent items interleaved in the list)
 * The chip is per-DESIGN-BRIEF §2 line 368:
 *   text-[11px] font-semibold uppercase tracking-wide
 *   text-stone-700 dark:text-stone-200
 * and satisfies the §1.1a typography-floor exception for ≥ 11 px semibold.
 *
 * Reduced-motion behavior:
 *   When `useReducedMotion()` returns true, the component drops every
 *   `transition-*` class and adds an
 *   `agent-feedback-toggle--reduced-motion` sentinel class on the button.
 *   The test greps for that sentinel and asserts no `transition-` classes
 *   leak through. No opacity crossfade — the state flip is instant.
 */

import type { ButtonHTMLAttributes } from "react"
import { useCallback, useState } from "react"
import {
	focusRingClass,
	touchTargetClass,
	useAnnounce,
	useReducedMotion,
} from "../../a11y"

export interface AgentFeedbackToggleProps
	extends Omit<
		ButtonHTMLAttributes<HTMLButtonElement>,
		| "type"
		| "role"
		| "aria-checked"
		| "aria-label"
		| "aria-disabled"
		| "onChange"
	> {
	/** Controlled `on/off` state. When present, the component is controlled. */
	checked?: boolean
	/** Uncontrolled initial state. Default `false`. */
	defaultChecked?: boolean
	/** Fires when the user toggles. Receives the next boolean state. */
	onChange?: (next: boolean) => void
	/**
	 * Optional count of agent-origin items. When supplied, a visible chip
	 * renders next to the label: `"{count} hidden"` (OFF) or
	 * `"{count} inline"` (ON). Omitted → no chip.
	 */
	count?: number
	/** Disabled state — button cannot be activated. */
	disabled?: boolean
	/** Optional className passthrough for the outer label wrapper. */
	className?: string
}

const TRACK_BASE = "relative inline-block w-8 h-4 rounded-full"
const TRACK_OFF =
	"bg-stone-300 dark:bg-stone-600 hover:bg-stone-400 dark:hover:bg-stone-500"
const TRACK_ON =
	"bg-teal-700 dark:bg-teal-700 hover:bg-teal-800 dark:hover:bg-teal-800"
const TRACK_DISABLED = "bg-stone-200 dark:bg-stone-700 cursor-not-allowed"
const THUMB_BASE = "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow"

/**
 * Render an AgentFeedbackToggle. Consumers own the list-render behavior;
 * this component only reports state via `onChange` and renders the visible
 * toggle + chip + label structure per DESIGN-BRIEF §2.
 */
export function AgentFeedbackToggle(
	props: AgentFeedbackToggleProps,
): React.ReactElement {
	const {
		checked,
		defaultChecked,
		onChange,
		count,
		disabled = false,
		className,
		...rest
	} = props

	const isControlled = checked !== undefined
	const [internal, setInternal] = useState<boolean>(defaultChecked ?? false)
	const current = isControlled ? !!checked : internal
	const announce = useAnnounce()
	const prefersReducedMotion = useReducedMotion()

	const handleToggle = useCallback(() => {
		if (disabled) return
		const next = !current
		if (!isControlled) setInternal(next)
		onChange?.(next)
		announce(
			"polite",
			next ? "Agent feedback now visible" : "Agent feedback hidden",
		)
	}, [announce, current, disabled, isControlled, onChange])

	const trackState = disabled ? TRACK_DISABLED : current ? TRACK_ON : TRACK_OFF
	const motionClasses = prefersReducedMotion
		? "agent-feedback-toggle--reduced-motion"
		: "transition-colors duration-200"
	const buttonClass = [TRACK_BASE, trackState, motionClasses, focusRingClass]
		.filter(Boolean)
		.join(" ")

	// Track width 32px, thumb width 12px, resting gap 2px (left-0.5 / top-0.5),
	// active x-offset slides the thumb right by 16px → left-[18px] keeps the
	// 2px gap on the right in the ON state. See tactical plan §A notes.
	const thumbPos = current ? "left-[18px]" : "left-0.5"
	const thumbMotion = prefersReducedMotion ? "" : "transition-all duration-200"
	const thumbClass = [THUMB_BASE, thumbPos, thumbMotion]
		.filter(Boolean)
		.join(" ")

	const labelClass = [
		touchTargetClass,
		"inline-flex items-center gap-2 cursor-pointer group",
		disabled ? "cursor-not-allowed" : "",
		className ?? "",
	]
		.filter(Boolean)
		.join(" ")

	return (
		<label className={labelClass}>
			<button
				{...rest}
				type="button"
				role="switch"
				aria-checked={current ? "true" : "false"}
				aria-label="Show agent feedback inline"
				aria-disabled={disabled ? "true" : undefined}
				disabled={disabled || undefined}
				onClick={handleToggle}
				className={buttonClass}
				data-state={current ? "on" : "off"}
			>
				<span aria-hidden="true" className={thumbClass} />
			</button>
			<span className="text-xs font-medium text-stone-700 dark:text-stone-300 group-hover:text-stone-900 dark:group-hover:text-stone-100">
				Show agent feedback
			</span>
			{typeof count === "number" ? (
				<span className="text-[11px] font-semibold uppercase tracking-wide text-stone-700 dark:text-stone-200 px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800">
					{count} {current ? "inline" : "hidden"}
				</span>
			) : null}
		</label>
	)
}
