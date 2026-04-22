import { focusRingCompactClass } from "../a11y/focus"

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

				return (
					<div key={stage.name} className="flex items-center">
						{/* Connector line — border-t-2 scales with accessibility zoom
						    rather than a raw 2px literal. */}
						{i > 0 && (
							<div
								className={`w-6 border-t-2 ${
									isCompleted || isCurrent
										? "border-teal-400 dark:border-teal-500"
										: "border-stone-300 dark:border-stone-600"
								}`}
							/>
						)}

						{/* Stage dot/diamond */}
						<button
							type="button"
							disabled={!(isClickable || isCurrent)}
							onClick={() => isClickable && onStageClick?.(stage.name)}
							title={`${stage.name} (${stage.status})`}
							className={`relative flex items-center justify-center shrink-0 transition-all ${focusRingCompactClass} ${
								isCurrent
									? "w-5 h-5 rotate-45 rounded-sm bg-teal-500 dark:bg-teal-400 shadow-sm cursor-default"
									: isCompleted
										? "w-3.5 h-3.5 rounded-full bg-teal-500 dark:bg-teal-400 cursor-pointer hover:scale-125"
										: isClickable
											? "w-3.5 h-3.5 rounded-full border-2 border-stone-400 dark:border-stone-500 bg-transparent cursor-pointer hover:border-teal-400 dark:hover:border-teal-400"
											: "w-3.5 h-3.5 rounded-full border border-stone-300 dark:border-stone-600 bg-transparent cursor-not-allowed"
							}`}
						>
							{isCurrent && (
								<span className="block w-1.5 h-1.5 bg-white rounded-full -rotate-45" />
							)}
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
