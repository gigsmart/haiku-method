import { focusRingCompactClass } from "../a11y/focus"
import { touchTargetHitAreaClass } from "../a11y/touch-target"

interface StageInfo {
	name: string
	status: string
	visits?: number
}

interface Props {
	stages: StageInfo[]
	currentStage: string
	onStageClick?: (stageName: string) => void
}

/**
 * Stage progress strip — resolves feedback FB-63:
 *
 *   1. WCAG 1.4.1 (Use of Color) — status is conveyed through three channels:
 *      (a) a non-color SVG glyph inside the dot (check for completed, dot for
 *      current, diamond for future-with-visits, blank for unvisited),
 *      (b) color, and (c) a machine-readable `aria-label` like
 *      "Stage product, current". Screen readers announce the label; sighted
 *      keyboard / low-vision users see the glyph; `title` remains for mouse-
 *      hover tooltips only (not an a11y affordance).
 *
 *   2. WCAG 2.5.5 / 2.5.8 (Target Size) — the visible dot stays small for
 *      visual density, but `touchTargetHitAreaClass` paints an invisible
 *      44×44 ::before pseudo that absorbs pointer events. The visible
 *      geometry is unchanged; tap/click hit-box is spec-compliant (44×44
 *      mobile floor, ≥24×24 desktop floor).
 *
 *   3. WCAG 2.4.7 (Focus Visible) — every dot carries `focusRingCompactClass`
 *      and `aria-current="step"` on the current stage. Keyboard tabbing
 *      produces a visible teal ring on every stage.
 *
 *   4. Color-only connector — the connector gains a non-color channel
 *      (`border-dashed` vs `border-solid`) so the progress boundary is
 *      distinguishable without relying on hue alone.
 *
 * SVG glyphs (not character text) avoid the `banned-text-small` rule that
 * forbids `text-[9px]` / `text-[10px]` on user-facing type — and scale
 * cleanly with user zoom.
 */
export function StageProgressStrip({
	stages,
	currentStage,
	onStageClick,
}: Props) {
	if (stages.length === 0) return null

	return (
		<div className="flex items-center gap-0 overflow-x-auto py-2 px-1">
			{stages.map((stage, i) => {
				const isCurrent = stage.name === currentStage
				const isCompleted = stage.status === "completed"
				const isFuture = !(isCurrent || isCompleted)
				const hasVisits = (stage.visits ?? 0) > 0
				const isClickable = isCompleted || (isFuture && hasVisits)

				// Canonical a11y status channel. `title` (mouse-hover tooltip) is
				// kept for parity with existing external behavior, but is not
				// relied on for a11y.
				const ariaLabel = `Stage ${stage.name}, ${stage.status}`

				return (
					<div key={stage.name} className="flex items-center">
						{/* Connector line — border-t-2 scales with accessibility zoom.
						    Dashed vs solid is a non-color channel distinguishing
						    completed from not-yet-reached (WCAG 1.4.1). */}
						{i > 0 && (
							<div
								className={`w-6 border-t-2 ${
									isCompleted || isCurrent
										? "border-solid border-teal-400 dark:border-teal-500"
										: "border-dashed border-stone-300 dark:border-stone-600"
								}`}
								aria-hidden="true"
							/>
						)}

						{/* Stage dot/diamond.
						 *
						 * `touchTargetHitAreaClass` paints a 44×44 invisible ::before
						 * behind the visible marker so pointer events meet WCAG 2.5.5.
						 *
						 * `aria-label` carries the status text. `aria-current="step"`
						 * marks the active stage for screen readers.
						 *
						 * `title` is retained for mouse-hover tooltips only.
						 */}
						<button
							type="button"
							disabled={!(isClickable || isCurrent)}
							onClick={() => isClickable && onStageClick?.(stage.name)}
							title={`${stage.name} (${stage.status})`}
							aria-label={ariaLabel}
							aria-current={isCurrent ? "step" : undefined}
							className={`relative flex items-center justify-center shrink-0 transition-all ${focusRingCompactClass} ${touchTargetHitAreaClass} ${
								isCurrent
									? "w-5 h-5 rotate-45 rounded-sm bg-teal-500 dark:bg-teal-400 shadow-sm cursor-default"
									: isCompleted
										? "w-3.5 h-3.5 rounded-full bg-teal-500 dark:bg-teal-400 cursor-pointer hover:scale-125"
										: isClickable
											? "w-3.5 h-3.5 rounded-full border-2 border-stone-400 dark:border-stone-500 bg-transparent cursor-pointer hover:border-teal-400 dark:hover:border-teal-400"
											: "w-3.5 h-3.5 rounded-full border border-stone-300 dark:border-stone-600 bg-transparent cursor-not-allowed"
							}`}
						>
							{/* Non-color status glyph — SVG so it scales cleanly and is
							 * exempt from the `banned-text-small` rule that forbids
							 * sub-12px text tokens. `aria-hidden` keeps the screen-reader
							 * announcement clean since `aria-label` already conveys
							 * status.
							 */}
							<StatusGlyph
								isCurrent={isCurrent}
								isCompleted={isCompleted}
								isClickable={isClickable}
							/>
						</button>

						{/* Stage label (below on larger screens).
						    text-xs (12px) + font-semibold is the named token tier
						    per DESIGN-TOKENS §1.4 — no bracket magic. */}
						<span
							className={`hidden sm:block ml-1 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${
								isCurrent
									? "text-teal-600 dark:text-teal-400 font-bold"
									: isCompleted
										? "text-stone-600 dark:text-stone-300"
										: "text-stone-600 dark:text-stone-300"
							}`}
						>
							{stage.name}
						</span>
					</div>
				)
			})}
		</div>
	)
}

/**
 * Non-color status glyph rendered inside the stage dot.
 *
 * Shape → status mapping (must differ from color alone, per WCAG 1.4.1):
 *   - completed  → check mark (white stroke on teal fill)
 *   - current    → inner dot (white, counter-rotated inside the diamond)
 *   - clickable future (visited) → diamond
 *   - unvisited  → no glyph (outline ring is the affordance)
 */
function StatusGlyph({
	isCurrent,
	isCompleted,
	isClickable,
}: {
	isCurrent: boolean
	isCompleted: boolean
	isClickable: boolean
}) {
	if (isCurrent) {
		// Inner white dot, counter-rotated so it appears upright inside the
		// 45°-rotated diamond. Visual marker for "you are here".
		return (
			<span
				className="block w-1.5 h-1.5 bg-white rounded-full -rotate-45"
				aria-hidden="true"
			/>
		)
	}
	if (isCompleted) {
		// Check-mark SVG — the non-color status channel for completed stages.
		return (
			<svg
				viewBox="0 0 12 12"
				className="block w-2 h-2 text-white"
				fill="none"
				stroke="currentColor"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<title>completed</title>
				<polyline points="2 6 5 9 10 3" />
			</svg>
		)
	}
	if (isClickable) {
		// Small diamond SVG — the non-color status channel for visited-but-
		// not-current stages (a user can revisit them).
		return (
			<svg
				viewBox="0 0 12 12"
				className="block w-2 h-2 text-stone-500 dark:text-stone-400"
				fill="currentColor"
				aria-hidden="true"
			>
				<title>visited</title>
				<polygon points="6 2 10 6 6 10 2 6" />
			</svg>
		)
	}
	// Unvisited — outline ring alone is the visual affordance; no glyph.
	return null
}
