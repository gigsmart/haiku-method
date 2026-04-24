import { focusRingCompactClass } from "../a11y/focus"
import { touchTargetHitAreaClass } from "../a11y/touch-target"

interface StageInfo {
	name: string
	status: string
	visits?: number
	pendingCount?: number
	sublabel?: string
}

interface Props {
	stages: StageInfo[]
	/** The FSM-active stage — always rendered as the current/diamond
	 *  marker, regardless of which stage the reviewer is browsing. */
	currentStage: string
	/** Optional: the stage the reviewer is currently VIEWING in the
	 *  main pane (may differ from `currentStage` after a stepper click).
	 *  Gets an underline / teal ring so the reviewer knows where they
	 *  are without losing sight of where the FSM actually sits. */
	viewingStage?: string
	onStageClick?: (stageName: string) => void
}

/**
 * Stage progress strip — canonical design per
 * `stages/design/artifacts/review-ui-mockup.html` (centered stepper with
 * large status markers, connector lines, pending-feedback badges, and a
 * per-stage sublabel slot for gate state).
 *
 * Visual language (DESIGN-TOKENS §1.8):
 *   - Completed: green-500 filled circle with white checkmark SVG, green
 *     ring, green label, solid green connector to the next stage.
 *   - Current:   teal-500 rotated diamond (45°) with inner white dot,
 *     thicker teal ring, teal label + gate sublabel.
 *   - Future with visits: outlined circle clickable, diamond-shaped glyph.
 *   - Future (never visited): outlined circle with muted number, disabled.
 *   - Pending feedback (on any stage): amber-500 badge with count,
 *     overlaid top-right of the marker with a white/stone ring.
 *   - Viewing (FB-01): when the reviewer has stepped back to a prior
 *     stage via the stepper, the marker gains a thick teal ring, the
 *     label is underlined in teal, and the sublabel slot shows
 *     "viewing" so the reviewer can see where they are without losing
 *     the FSM-current diamond.
 */
export function StageProgressStrip({
	stages,
	currentStage,
	viewingStage,
	onStageClick,
}: Props) {
	if (stages.length === 0) return null

	return (
		<nav className="px-4 sm:px-6 py-3" aria-label="Stage progress">
			<ol className="flex justify-center items-start gap-0">
				{stages.map((stage, i) => {
					// "current" means the FSM is actively working this stage.
					// Once a stage's status flips to `completed`, its checkmark
					// wins over the diamond even if the active-stage resolver
					// still names it (e.g. post-final-stage in intent-review
					// phase, the last stage is both `current` by fallback and
					// `completed` on disk — operator should see a checkmark).
					const rawIsCurrent = stage.name === currentStage
					const isCompleted = stage.status === "completed"
					const isCurrent = rawIsCurrent && !isCompleted
					const isViewing = stage.name === (viewingStage ?? currentStage)
					const isFuture = !(isCurrent || isCompleted)
					const hasVisits = (stage.visits ?? 0) > 0
					// Every stage the reviewer can reach is clickable — current,
					// viewing, and any completed / visited-future step. This
					// preserves "return home" navigation from any viewing state.
					const isClickable =
						isCompleted || isCurrent || isViewing || (isFuture && hasVisits)
					const pending = stage.pendingCount ?? 0
					const stageNumber = i + 1

					const nextStage = stages[i + 1]
					const nextIsCompleted = nextStage?.status === "completed"
					const nextIsCurrent = nextStage?.name === currentStage

					const leftConnectorClass =
						i === 0
							? "bg-transparent"
							: isCompleted || isCurrent
								? "bg-green-400 dark:bg-green-700"
								: "bg-stone-300 dark:bg-stone-700"

					const rightConnectorClass =
						i === stages.length - 1
							? "bg-transparent"
							: nextIsCompleted
								? "bg-green-400 dark:bg-green-700"
								: nextIsCurrent
									? "bg-gradient-to-r from-green-400 to-teal-400 dark:from-green-700 dark:to-teal-600"
									: "bg-stone-300 dark:bg-stone-700"

					// A11y status channel
					const statusSuffix = isCurrent
						? "current"
						: isCompleted
							? "completed"
							: hasVisits
								? "visited"
								: "future"
					const pendingSuffix =
						pending > 0 ? `, ${pending} pending feedback` : ""
					const ariaLabel = `Stage ${stage.name}, ${statusSuffix}${pendingSuffix}`

					// "Viewing" is a distinct affordance from "current": when the
					// reviewer has stepped back to a prior stage, the FSM-current
					// diamond stays put, and the stage the reviewer is BROWSING
					// gets a teal ring + underline + `aria-current="location"` so
					// they can see where they are without losing the FSM pointer.
					const isViewingDifferent = isViewing && !isCurrent
					return (
						<li key={stage.name} className="w-24">
							<button
								type="button"
								data-stage={stage.name}
								data-viewing={isViewing ? "true" : undefined}
								disabled={!(isClickable || isCurrent)}
								onClick={() => isClickable && onStageClick?.(stage.name)}
								title={`${stage.name} (${stage.status})${isViewingDifferent ? " — viewing" : ""}`}
								aria-label={
									isViewingDifferent
										? `${ariaLabel}, currently viewing`
										: ariaLabel
								}
								aria-current={
									isCurrent
										? "step"
										: isViewingDifferent
											? "location"
											: undefined
								}
								className={`group w-full flex flex-col items-center transition-colors ${focusRingCompactClass} ${
									isFuture && !hasVisits
										? "cursor-not-allowed text-stone-500 dark:text-stone-600"
										: isClickable
											? "cursor-pointer hover:scale-[1.02] hover:border-teal-400"
											: "cursor-default"
								}`}
							>
								<div className="flex items-center w-full h-10">
									<div
										className={`flex-1 h-0.5 ${leftConnectorClass}`}
										aria-hidden="true"
									/>
									<div
										className={`relative w-10 h-10 flex items-center justify-center shrink-0 ${touchTargetHitAreaClass}`}
									>
										<StageMarker
											isCurrent={isCurrent}
											isCompleted={isCompleted}
											hasVisits={hasVisits}
											stageNumber={stageNumber}
											hasPending={pending > 0}
											isViewing={isViewingDifferent}
										/>
										{pending > 0 && (
											<span
												className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center ring-2 ring-white dark:ring-stone-900"
												aria-hidden="true"
											>
												{pending}
											</span>
										)}
									</div>
									<div
										className={`flex-1 h-0.5 ${rightConnectorClass}`}
										aria-hidden="true"
									/>
								</div>
								<span
									className={`mt-2 text-xs font-semibold uppercase tracking-wider leading-none whitespace-nowrap ${
										isViewingDifferent
											? "text-amber-600 dark:text-amber-400"
											: isCurrent
												? "text-teal-600 dark:text-teal-400"
												: isCompleted
													? "text-green-600 dark:text-green-400"
													: "text-stone-500 dark:text-stone-400"
									}`}
								>
									{stage.name}
								</span>
								<span
									className={`mt-1 text-xs font-medium uppercase tracking-wider leading-none ${
										pending > 0
											? "text-amber-600 dark:text-amber-500 font-bold"
											: isCurrent && stage.sublabel
												? "text-teal-500 dark:text-teal-500"
												: "text-transparent select-none"
									}`}
									aria-hidden={
										pending === 0 && !(isCurrent && stage.sublabel)
									}
								>
									{pending > 0
										? `${pending} pending`
										: isCurrent && stage.sublabel
											? stage.sublabel
											: " "}
								</span>
							</button>
						</li>
					)
				})}
			</ol>
		</nav>
	)
}

function StageMarker({
	isCurrent,
	isCompleted,
	hasVisits,
	stageNumber,
	hasPending,
	isViewing,
}: {
	isCurrent: boolean
	isCompleted: boolean
	hasVisits: boolean
	stageNumber: number
	hasPending: boolean
	/** FB-01: when the reviewer has stepped back to a prior stage via the
	 *  stepper, the marker gains a thick teal ring so they can see where
	 *  they are without losing sight of the FSM-current diamond. */
	isViewing?: boolean
}) {
	if (isCurrent) {
		// Rotated teal diamond with inner number, heavy ring
		return (
			<div
				className="w-7 h-7 rounded-md rotate-45 bg-teal-500 dark:bg-teal-400 flex items-center justify-center shadow-md ring-4 ring-teal-200 dark:ring-teal-900/50"
				aria-hidden="true"
			>
				<span className="text-xs font-bold text-white -rotate-45">
					{stageNumber}
				</span>
			</div>
		)
	}
	if (isCompleted) {
		// Green-filled circle with white check SVG, ring colored by pending
		// or viewing. Viewing wins over pending visually because the
		// reviewer needs to see WHERE THEY ARE first — pending state is
		// still conveyed by the amber count badge overlay on the marker.
		const ringClass = isViewing
			? "ring-4 ring-amber-400 dark:ring-amber-300"
			: hasPending
				? "ring-2 ring-amber-300 dark:ring-amber-700/60"
				: "ring-2 ring-green-200 dark:ring-green-900/40"
		return (
			<div
				className={`w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-sm ${ringClass}`}
				aria-hidden="true"
			>
				<svg
					className="w-3.5 h-3.5 text-white"
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					viewBox="0 0 24 24"
				>
					<title>completed</title>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M5 13l4 4L19 7"
					/>
				</svg>
			</div>
		)
	}
	if (hasVisits) {
		// Outlined circle with number, clickable (visited future). When
		// the reviewer is currently viewing this stage, swap in a thick
		// teal ring so it reads as "you are here" at a glance.
		const viewingRing = isViewing
			? "ring-4 ring-amber-400 dark:ring-amber-300 border-amber-500 dark:border-amber-400"
			: "border-stone-400 dark:border-stone-500 hover:border-teal-400 dark:hover:border-teal-400"
		return (
			<div
				className={`w-6 h-6 rounded-full bg-white dark:bg-stone-900 border-2 flex items-center justify-center transition-colors ${viewingRing}`}
				aria-hidden="true"
			>
				<span className="text-xs font-semibold text-stone-600 dark:text-stone-400">
					{stageNumber}
				</span>
			</div>
		)
	}
	// Unvisited future
	return (
		<div
			className="w-6 h-6 rounded-full bg-white dark:bg-stone-900 border-2 border-stone-300 dark:border-stone-600 flex items-center justify-center"
			aria-hidden="true"
		>
			<span className="text-xs font-semibold text-stone-500 dark:text-stone-500">
				{stageNumber}
			</span>
		</div>
	)
}
