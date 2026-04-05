"use client"

import { useCallback, useEffect, useState } from "react"
import type { BrowseProvider, HaikuIntent, HaikuIntentDetail } from "@/lib/browse/types"
import { formatDuration } from "@/lib/browse/types"

function titleCase(s: string): string {
	return s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

const statusColors: Record<string, string> = {
	completed: "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950",
	active: "border-teal-300 bg-teal-50 dark:border-teal-800 dark:bg-teal-950",
	pending: "border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900",
	blocked: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950",
}

const phaseColors: Record<string, string> = {
	decompose: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
	execute: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
	review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
	persist: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
	gate: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
}

interface KanbanProps {
	provider: BrowseProvider
	intents: HaikuIntent[]
	onSelectIntent?: (slug: string) => void
}

// ── Portfolio Kanban: intents across stage columns ─────────────────────────

export function PortfolioKanban({ provider, intents, onSelectIntent }: KanbanProps) {
	// Collect all unique stages across all intents
	const [intentDetails, setIntentDetails] = useState<Map<string, HaikuIntentDetail>>(new Map())
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		async function loadDetails() {
			const details = new Map<string, HaikuIntentDetail>()
			for (const intent of intents) {
				const detail = await provider.getIntent(intent.slug)
				if (detail) details.set(intent.slug, detail)
			}
			setIntentDetails(details)
			setLoading(false)
		}
		loadDetails()
	}, [provider, intents])

	if (loading) {
		return <div className="py-12 text-center text-stone-500">Loading board...</div>
	}

	// Collect all known stages from intent details (preserves studio stage order)
	const allStagesOrdered: string[] = []
	const seenStages = new Set<string>()
	for (const detail of intentDetails.values()) {
		for (const stage of detail.stages) {
			if (!seenStages.has(stage.name)) {
				seenStages.add(stage.name)
				allStagesOrdered.push(stage.name)
			}
		}
	}

	// Group intents by their active stage
	const stageGroups = new Map<string, HaikuIntent[]>()

	// Initialize all columns: Backlog, all known stages, Completed
	stageGroups.set("Backlog", [])
	for (const stage of allStagesOrdered) {
		stageGroups.set(stage, [])
	}
	stageGroups.set("Completed", [])

	for (const intent of intents) {
		if (intent.status === "completed") {
			stageGroups.get("Completed")!.push(intent)
		} else {
			const stage = intent.activeStage || "Backlog"
			if (!stageGroups.has(stage)) stageGroups.set(stage, [])
			stageGroups.get(stage)!.push(intent)
		}
	}

	// Order: Backlog, stages in pipeline order, then Completed
	const orderedKeys = ["Backlog", ...allStagesOrdered, "Completed"]

	return (
		<div className="overflow-x-auto pb-4">
			<div className="flex gap-4" style={{ minWidth: `${orderedKeys.length * 280}px` }}>
				{orderedKeys.map((stageName) => {
					const items = stageGroups.get(stageName) || []
					return (
						<div
							key={stageName}
							className="w-[270px] flex-shrink-0 rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900/50"
						>
							<div className="border-b border-stone-200 px-4 py-3 dark:border-stone-700">
								<div className="flex items-center justify-between">
									<h3 className="text-sm font-bold text-stone-700 dark:text-stone-300">
										{titleCase(stageName)}
									</h3>
									<span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600 dark:bg-stone-700 dark:text-stone-400">
										{items.length}
									</span>
								</div>
							</div>
							<div className="space-y-2 p-3" style={{ minHeight: "100px" }}>
								{items.map((intent) => {
									const detail = intentDetails.get(intent.slug)
									const activeStageDetail = detail?.stages.find(s => s.name === intent.activeStage)
									const totalUnits = detail?.stages.reduce((acc, s) => acc + s.units.length, 0) || 0
									const completedUnits = detail?.stages.reduce((acc, s) => acc + s.units.filter(u => u.status === "completed").length, 0) || 0

									return (
										<button
											key={intent.slug}
											onClick={() => onSelectIntent?.(intent.slug)}
											className={`w-full rounded-lg border p-3 text-left transition hover:shadow-sm ${statusColors[intent.status] || statusColors.pending}`}
										>
											<div className="text-sm font-semibold text-stone-900 dark:text-stone-100 line-clamp-2">
												{intent.title}
											</div>
											<div className="mt-1 flex items-center gap-2">
												<span className="text-xs text-stone-500">{titleCase(intent.studio)}</span>
												{activeStageDetail?.phase && (
													<span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${phaseColors[activeStageDetail.phase] || ""}`}>
														{activeStageDetail.phase}
													</span>
												)}
											</div>
											{totalUnits > 0 && (
												<div className="mt-2">
													<div className="flex items-center justify-between text-xs text-stone-400">
														<span>{completedUnits}/{totalUnits} units</span>
														{intent.startedAt && (
															<span>{formatDuration(intent.startedAt, intent.completedAt)}</span>
														)}
													</div>
													<div className="mt-1 h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
														<div
															className="h-full rounded-full bg-teal-500"
															style={{ width: `${totalUnits > 0 ? (completedUnits / totalUnits) * 100 : 0}%` }}
														/>
													</div>
												</div>
											)}
										</button>
									)
								})}
								{items.length === 0 && (
									<div className="py-4 text-center text-xs text-stone-400">No intents</div>
								)}
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}

// ── Intent Kanban: units across stage/hat columns ──────────────────────────

interface IntentKanbanProps {
	intent: HaikuIntentDetail
	onSelectUnit?: (unit: { name: string; stage: string }) => void
}

export function IntentKanban({ intent, onSelectUnit }: IntentKanbanProps) {
	return (
		<div className="overflow-x-auto pb-4">
			<div className="flex gap-4" style={{ minWidth: `${intent.stages.length * 280}px` }}>
				{intent.stages.map((stage) => (
					<div
						key={stage.name}
						className="w-[270px] flex-shrink-0 rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900/50"
					>
						<div className="border-b border-stone-200 px-4 py-3 dark:border-stone-700">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-bold text-stone-700 dark:text-stone-300">
									{titleCase(stage.name)}
								</h3>
								<div className="flex items-center gap-2">
									{stage.phase && (
										<span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${phaseColors[stage.phase] || ""}`}>
											{stage.phase}
										</span>
									)}
									<span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600 dark:bg-stone-700 dark:text-stone-400">
										{stage.units.length}
									</span>
								</div>
							</div>
						</div>
						<div className="space-y-2 p-3" style={{ minHeight: "80px" }}>
							{stage.units.map((unit) => {
								const checked = unit.criteria.filter(c => c.checked).length
								const total = unit.criteria.length
								return (
									<button
										key={unit.name}
										onClick={() => onSelectUnit?.({ name: unit.name, stage: stage.name })}
										className={`w-full rounded-lg border p-3 text-left transition hover:shadow-sm ${statusColors[unit.status] || statusColors.pending}`}
									>
										<div className="text-sm font-semibold text-stone-900 dark:text-stone-100 line-clamp-2">
											{titleCase(unit.name)}
										</div>
										<div className="mt-1 flex items-center gap-2 text-xs text-stone-500">
											{unit.hat && <span>Hat: {titleCase(unit.hat)}</span>}
											{unit.bolt > 0 && <span>Bolt {unit.bolt}</span>}
											{unit.type && <span>{unit.type}</span>}
										</div>
										{total > 0 && (
											<div className="mt-2">
												<div className="flex items-center justify-between text-xs text-stone-400">
													<span>{checked}/{total}</span>
													{unit.startedAt && (
														<span>{formatDuration(unit.startedAt, unit.completedAt)}</span>
													)}
												</div>
												<div className="mt-1 h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
													<div
														className={`h-full rounded-full ${unit.status === "completed" ? "bg-green-500" : "bg-teal-500"}`}
														style={{ width: `${(checked / total) * 100}%` }}
													/>
												</div>
											</div>
										)}
									</button>
								)
							})}
							{stage.units.length === 0 && (
								<div className="py-4 text-center text-xs text-stone-400">No units</div>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
