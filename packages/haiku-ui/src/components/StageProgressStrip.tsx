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
	currentStage: string
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
 */
export function StageProgressStrip({
	stages,
	currentStage,
	onStageClick,
}: Props) {
	if (stages.length === 0) return null

	return (
		<nav
			className="px-4 sm:px-6 py-3"
			aria-label="Stage progress"
		>
			<ol className="flex justify-center items-start gap-0">
				{stages.map((stage, i) => {
					const isCurrent = stage.name === currentStage
					const isCompleted = stage.status === "completed"
					const isFuture = !(isCurrent || isCompleted)
					const hasVisits = (stage.visits ?? 0) > 0
					// Current stage is always clickable so a reviewer who navigates
					// away to an earlier stage can always return home.
					const isClickable =
						isCompleted || isCurrent || (isFuture && hasVisits)
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

					return (
						<li key={stage.name} className="w-24">
							<button
								type="button"
								data-stage={stage.name}
								disabled={!(isClickable || isCurrent)}
								onClick={() => isClickable && onStageClick?.(stage.name)}
								title={`${stage.name} (${stage.status})`}
								aria-label={ariaLabel}
								aria-current={isCurrent ? "step" : undefined}
								className={`group w-full flex flex-col items-center transition-colors ${focusRingCompactClass} ${
									isFuture && !hasVisits
										? "cursor-not-allowed text-stone-500 dark:text-stone-600"
										: isClickable
											? "cursor-pointer hover:scale-[1.02] hover:border-teal-400"
											: "cursor-default"
								}`}
							>
								<div className="flex items-center w-full h-10">
									<div className={`flex-1 h-0.5 ${leftConnectorClass}`} aria-hidden="true" />
									<div className={`relative w-10 h-10 flex items-center justify-center shrink-0 ${touchTargetHitAreaClass}`}>
										<StageMarker
											isCurrent={isCurrent}
											isCompleted={isCompleted}
											hasVisits={hasVisits}
											stageNumber={stageNumber}
											hasPending={pending > 0}
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
									<div className={`flex-1 h-0.5 ${rightConnectorClass}`} aria-hidden="true" />
								</div>
								<span
									className={`mt-2 text-xs font-semibold uppercase tracking-wider leading-none whitespace-nowrap ${
										isCurrent
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
									aria-hidden={pending === 0 && !(isCurrent && stage.sublabel)}
								>
									{pending > 0
										? `${pending} pending`
										: isCurrent && stage.sublabel
											? stage.sublabel
											: " "}
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
}: {
	isCurrent: boolean
	isCompleted: boolean
	hasVisits: boolean
	stageNumber: number
	hasPending: boolean
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
		const ringClass = hasPending
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
					<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
				</svg>
			</div>
		)
	}
	if (hasVisits) {
		// Outlined circle with number, clickable (visited future)
		return (
			<div
				className="w-6 h-6 rounded-full bg-white dark:bg-stone-900 border-2 border-stone-400 dark:border-stone-500 flex items-center justify-center hover:border-teal-400 dark:hover:border-teal-400 transition-colors"
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
