"use client"

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
	elaborate: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
	decompose: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", // backward compat
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
	// Build columns from lightweight intent data — no getIntent() calls needed
	const allStagesOrdered: string[] = []
	const seenStages = new Set<string>()

	for (const intent of intents) {
		const stages = intent.studioStages.length > 0
			? intent.studioStages
			: intent.composite
				? intent.composite.flatMap(c => c.stages.map(s => `${c.studio}:${s}`))
				: []
		for (const s of stages) {
			if (!seenStages.has(s)) {
				seenStages.add(s)
				allStagesOrdered.push(s)
			}
		}
	}

	const stageGroups = new Map<string, HaikuIntent[]>()
	stageGroups.set("Backlog", [])
	for (const stage of allStagesOrdered) stageGroups.set(stage, [])
	stageGroups.set("Completed", [])

	for (const intent of intents) {
		if (intent.status === "completed") {
			stageGroups.get("Completed")!.push(intent)
		} else if (intent.composite) {
			const compositeState = (intent.raw.composite_state || {}) as Record<string, string>
			for (const entry of intent.composite) {
				const current = compositeState[entry.studio] || entry.stages[0]
				if (current && current !== "complete") {
					const key = `${entry.studio}:${current}`
					if (!stageGroups.has(key)) stageGroups.set(key, [])
					stageGroups.get(key)!.push(intent)
					break
				}
			}
		} else {
			const stage = intent.activeStage || "Backlog"
			if (!stageGroups.has(stage)) stageGroups.set(stage, [])
			stageGroups.get(stage)!.push(intent)
		}
	}

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
								{items.map((intent) => (
									<button
										key={intent.slug}
										onClick={() => onSelectIntent?.(intent.slug)}
										className={`w-full rounded-lg border p-3 text-left transition hover:shadow-sm ${statusColors[intent.status] || statusColors.pending}`}
									>
										<div className="text-sm font-semibold text-stone-900 dark:text-stone-100 line-clamp-2">
											{intent.title}
										</div>
										<div className="mt-1 flex items-center gap-2 flex-wrap">
											<span className="text-xs text-stone-500">{titleCase(intent.studio)}</span>
											{intent.composite && (
												<span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
													composite
												</span>
											)}
										</div>
										{intent.stagesTotal > 0 && intent.stagesComplete > 0 && (
											<div className="mt-2">
												<div className="flex items-center justify-between text-xs text-stone-400">
													<span>{intent.stagesComplete}/{intent.stagesTotal} stages</span>
													{intent.startedAt && (
														<span>{formatDuration(intent.startedAt, intent.completedAt)}</span>
													)}
												</div>
												<div className="mt-1 h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
													<div
														className="h-full rounded-full bg-teal-500"
														style={{ width: `${Math.max(0, (intent.stagesComplete / intent.stagesTotal) * 100)}%` }}
													/>
												</div>
											</div>
										)}
									</button>
								))}
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
	// Group units by status, not stage — units don't move between stages
	const allUnits = intent.stages.flatMap(s => s.units.map(u => ({ ...u, stageName: s.name })))
	const columns: Array<{ status: string; label: string; units: typeof allUnits }> = [
		{ status: "pending", label: "Pending", units: allUnits.filter(u => u.status === "pending") },
		{ status: "active", label: "Active", units: allUnits.filter(u => u.status === "active") },
		{ status: "completed", label: "Completed", units: allUnits.filter(u => u.status === "completed") },
	]

	return (
		<div className="overflow-x-auto pb-4">
			<div className="flex gap-4" style={{ minWidth: "840px" }}>
				{columns.map((col) => (
					<div
						key={col.status}
						className="w-[270px] flex-shrink-0 rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900/50"
					>
						<div className="border-b border-stone-200 px-4 py-3 dark:border-stone-700">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-bold text-stone-700 dark:text-stone-300">
									{col.label}
								</h3>
								<span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600 dark:bg-stone-700 dark:text-stone-400">
									{col.units.length}
								</span>
							</div>
						</div>
						<div className="space-y-2 p-3" style={{ minHeight: "80px" }}>
							{col.units.map((unit) => {
								const checked = unit.criteria.filter(c => c.checked).length
								const total = unit.criteria.length
								return (
									<button
										key={`${unit.stageName}-${unit.name}`}
										onClick={() => onSelectUnit?.({ name: unit.name, stage: unit.stageName })}
										className={`w-full rounded-lg border p-3 text-left transition hover:shadow-sm ${statusColors[unit.status] || statusColors.pending}`}
									>
										<div className="text-sm font-semibold text-stone-900 dark:text-stone-100 line-clamp-2">
											{titleCase(unit.name)}
										</div>
										<div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-stone-500">
											<span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-400">
												{titleCase(unit.stageName)}
											</span>
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
							{col.units.length === 0 && (
								<div className="py-4 text-center text-xs text-stone-400">No units</div>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
