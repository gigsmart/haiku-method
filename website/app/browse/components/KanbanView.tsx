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
	// Group intents by studio, then build per-studio stage columns (swim lanes)
	const studioMap = new Map<string, { stages: string[]; intents: HaikuIntent[] }>()

	for (const intent of intents) {
		const studio = intent.studio || "unknown"
		if (!studioMap.has(studio)) {
			studioMap.set(studio, { stages: [], intents: [] })
		}
		const entry = studioMap.get(studio)!
		entry.intents.push(intent)
		// Collect stage ordering from the first intent that has stages for this studio
		if (entry.stages.length === 0 && intent.studioStages.length > 0) {
			entry.stages = [...intent.studioStages]
		}
	}

	// Sort studios alphabetically, but push "unknown" to the end
	const studioNames = [...studioMap.keys()].sort((a, b) => {
		if (a === "unknown") return 1
		if (b === "unknown") return -1
		return a.localeCompare(b)
	})

	return (
		<div className="space-y-8">
			{studioNames.map((studioName) => {
				const { stages, intents: studioIntents } = studioMap.get(studioName)!

				// Build columns: Backlog → stages → Completed
				const columns = ["Backlog", ...stages, "Completed"]
				const groups = new Map<string, HaikuIntent[]>()
				for (const col of columns) groups.set(col, [])

				for (const intent of studioIntents) {
					if (intent.status === "completed") {
						groups.get("Completed")!.push(intent)
					} else {
						const stage = intent.activeStage || "Backlog"
						if (groups.has(stage)) {
							groups.get(stage)!.push(intent)
						} else {
							groups.get("Backlog")!.push(intent)
						}
					}
				}

				const total = studioIntents.length

				return (
					<div key={studioName}>
						<div className="mb-3 flex items-center gap-3">
							<h2 className="text-base font-bold text-stone-800 dark:text-stone-200">
								{titleCase(studioName)}
							</h2>
							<span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-medium text-stone-600 dark:bg-stone-700 dark:text-stone-400">
								{total} intent{total !== 1 ? "s" : ""}
							</span>
						</div>
						<div className="overflow-x-auto pb-4">
							<div className="flex gap-4" style={{ minWidth: `${columns.length * 280}px` }}>
								{columns.map((stageName) => {
									const items = groups.get(stageName) || []
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
														key={intent.branch ? `${intent.branch}/${intent.slug}` : intent.slug}
														onClick={() => onSelectIntent?.(intent.slug)}
														className={`w-full rounded-lg border p-3 text-left transition hover:shadow-sm ${statusColors[intent.status] || statusColors.pending}`}
													>
														<div className="text-sm font-semibold text-stone-900 dark:text-stone-100 line-clamp-2">
															{intent.title}
														</div>
														<div className="mt-1 flex items-center gap-2 flex-wrap">
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
					</div>
				)
			})}
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
