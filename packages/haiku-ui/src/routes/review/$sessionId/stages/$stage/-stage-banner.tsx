/**
 * StageBanner + PhaseStepper — sticky top-of-main banner showing the
 * selected stage's status, name, and mini stepper across the stage's
 * own lifecycle phases (elaborate → execute → review → gate).
 *
 * Extracted from `pages/review/ReviewPage.tsx` so the stage layout
 * route owns it directly. Gate badges come from the layout context;
 * phase + stageStatus are derived from the session's stage_state.
 */

import {
	PHASE_TOOLTIPS,
	phaseBadgeCopy,
	STAGE_PHASES,
} from "../../-review-helpers"

export function PhaseStepper({
	phase,
	stageStatus,
}: {
	phase: string | null
	stageStatus: string
}): React.ReactElement {
	const activeIndex = phase
		? STAGE_PHASES.indexOf(phase as (typeof STAGE_PHASES)[number])
		: -1
	const isStageComplete =
		stageStatus === "completed" || stageStatus === "complete"
	return (
		<div
			className="inline-flex items-center gap-2"
			aria-label={`Phase ${activeIndex + 1} of ${STAGE_PHASES.length}`}
		>
			<span className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400 leading-none">
				Phase
			</span>
			<div className="inline-flex items-center gap-1">
				{STAGE_PHASES.map((p, i) => {
					const isActive = i === activeIndex && !isStageComplete
					const isDone = isStageComplete || activeIndex > i
					const state = isActive ? "active" : isDone ? "done" : "pending"
					const phaseLabel = `${p[0].toUpperCase()}${p.slice(1)}`
					const tooltip = `${phaseLabel} (${state}) — ${PHASE_TOOLTIPS[p]}`
					return (
						<div key={p} className="flex items-center gap-1">
							{/*
							 * Tooltip overlay — a floating pill shown on pointer
							 * hover + keyboard focus (for a11y). The hit-target is
							 * the `p-1` wrapper (so cursor doesn't need pixel-
							 * perfect aim on the 2x2 dot). `aria-label` duplicates
							 * the tooltip text for SRs; we intentionally skip the
							 * native `title` attribute so the browser's delayed
							 * OS tooltip doesn't double with the overlay.
							 */}
							<span
								className="relative inline-flex items-center justify-center p-1 -m-1 group focus:outline-none"
								aria-label={tooltip}
							>
								<span
									className={`inline-block w-2 h-2 rounded-full ${
										isActive
											? "bg-amber-500 ring-2 ring-amber-300 dark:ring-amber-700"
											: isDone
												? "bg-green-500"
												: "bg-stone-300 dark:bg-stone-700"
									}`}
									aria-hidden="true"
								/>
								<span
									role="tooltip"
									className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-md bg-stone-900 dark:bg-stone-100 px-2 py-1 text-xs font-medium text-white dark:text-stone-900 shadow-lg opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-50"
								>
									{tooltip}
								</span>
							</span>
							{i < STAGE_PHASES.length - 1 && (
								<span
									className={`w-3 h-0.5 ${
										isDone
											? "bg-green-400 dark:bg-green-700"
											: "bg-stone-300 dark:bg-stone-700"
									}`}
									aria-hidden="true"
								/>
							)}
						</div>
					)
				})}
			</div>
			<span className="text-xs font-mono text-stone-500 dark:text-stone-400">
				{isStageComplete
					? "done"
					: activeIndex >= 0
						? `${activeIndex + 1}/${STAGE_PHASES.length}`
						: "—"}
			</span>
		</div>
	)
}

export function StageBanner({
	stageName,
	stageStatus,
	stagePhase,
	gateBadges,
}: {
	stageName: string
	stageStatus: string
	stagePhase: string | null
	gateBadges: Array<{ label: string; classes: string }>
}): React.ReactElement {
	const statusPill =
		stageStatus === "current" || stageStatus === "active"
			? {
					bannerClasses:
						"border-teal-200 dark:border-teal-900/60 bg-teal-50 dark:bg-teal-900/20",
					pillClasses: "bg-teal-700 text-white",
					label: "current",
				}
			: stageStatus === "completed" || stageStatus === "complete"
				? {
						bannerClasses:
							"border-green-200 dark:border-green-900/60 bg-green-50 dark:bg-green-900/20",
						pillClasses: "bg-green-700 text-white",
						label: "complete",
					}
				: {
						bannerClasses:
							"border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40",
						pillClasses: "bg-stone-600 text-white",
						label: "upcoming",
					}
	const phasePill = phaseBadgeCopy(stagePhase ?? undefined, stageStatus)
	return (
		<div
			data-testid="review-stage-banner"
			className="bg-stone-50 dark:bg-stone-950 px-6 lg:px-10 pt-6 pb-3"
		>
			<div
				className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${statusPill.bannerClasses}`}
			>
				<span
					className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusPill.pillClasses}`}
				>
					{statusPill.label}
				</span>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-3 flex-wrap">
						<p className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400 leading-none">
							Stage
						</p>
						<PhaseStepper phase={stagePhase} stageStatus={stageStatus} />
					</div>
					<div className="flex items-center gap-2 mt-1 flex-wrap">
						<h1 className="text-base font-bold text-stone-900 dark:text-stone-100 leading-tight capitalize">
							{stageName}
						</h1>
						{phasePill && (
							<span
								className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${phasePill.classes}`}
							>
								{phasePill.label}
							</span>
						)}
						{gateBadges.map((b) => (
							<span
								key={b.label}
								className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${b.classes}`}
							>
								{b.label}
							</span>
						))}
					</div>
				</div>
			</div>
		</div>
	)
}
