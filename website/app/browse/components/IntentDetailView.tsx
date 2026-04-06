"use client"

import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { BrowseProvider, HaikuIntentDetail, HaikuStageState, HaikuUnit } from "@/lib/browse/types"
import { formatDate, formatDuration } from "@/lib/browse/types"
import { UnitDetailView } from "./UnitDetailView"
import { IntentKanban } from "./KanbanView"

function titleCase(s: string): string {
	return s
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ")
}

function parseHash(): Record<string, string> {
	if (typeof window === "undefined") return {}
	const hash = window.location.hash.replace(/^#/, "")
	if (!hash) return {}
	const params: Record<string, string> = {}
	for (const part of hash.split("&")) {
		const [key, ...rest] = part.split("=")
		if (key) params[decodeURIComponent(key)] = decodeURIComponent(rest.join("=") || "")
	}
	return params
}

function buildHashString(params: Record<string, string>): string {
	const parts = Object.entries(params)
		.filter(([, v]) => v)
		.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
	return parts.length > 0 ? `#${parts.join("&")}` : window.location.pathname + window.location.search
}

function setHash(params: Record<string, string>) {
	window.history.replaceState(null, "", buildHashString(params))
}

function pushHash(params: Record<string, string>) {
	window.history.pushState(null, "", buildHashString(params))
}

const stageStatusColors: Record<string, { bg: string; dot: string }> = {
	complete: { bg: "border-green-200 dark:border-green-900", dot: "bg-green-500" },
	active: { bg: "border-teal-300 dark:border-teal-700", dot: "bg-teal-500 animate-pulse" },
	pending: { bg: "border-stone-200 dark:border-stone-700", dot: "bg-stone-300 dark:bg-stone-600" },
}

const unitStatusColors: Record<string, string> = {
	completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
	active: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
	pending: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
	blocked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

interface Props {
	intent: HaikuIntentDetail
	provider: BrowseProvider
	onBack: () => void
}

export function IntentDetailView({ intent, provider, onBack }: Props) {
	const [selectedUnit, setSelectedUnit] = useState<{ unit: HaikuUnit; stage: string } | null>(null)
	const [expandedStage, setExpandedStage] = useState<string | null>(intent.activeStage || null)
	const [viewMode, setViewMode] = useState<"pipeline" | "board">("pipeline")
	const [gateAction, setGateAction] = useState<"idle" | "approving" | "rejecting" | "success" | "error">("idle")

	async function handleApproveStage(stageName: string) {
		if (!provider.writeFile) return
		setGateAction("approving")
		try {
			const statePath = `.haiku/intents/${intent.slug}/stages/${stageName}/state.json`
			const currentState = await provider.readFile(statePath)
			if (!currentState) { setGateAction("error"); return }
			const state = JSON.parse(currentState)
			state.gate_outcome = "advanced"
			state.completed_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
			state.status = "completed"
			const success = await provider.writeFile(
				statePath,
				JSON.stringify(state, null, 2) + "\n",
				`haiku: approve stage ${stageName} (external review)`
			)
			if (success) {
				setGateAction("success")
				setTimeout(() => window.location.reload(), 1500)
			} else {
				setGateAction("error")
			}
		} catch {
			setGateAction("error")
		}
	}

	async function handleRejectStage(stageName: string) {
		if (!provider.writeFile) return
		setGateAction("rejecting")
		try {
			const statePath = `.haiku/intents/${intent.slug}/stages/${stageName}/state.json`
			const currentState = await provider.readFile(statePath)
			if (!currentState) { setGateAction("error"); return }
			const state = JSON.parse(currentState)
			state.gate_outcome = "changes_requested"
			const success = await provider.writeFile(
				statePath,
				JSON.stringify(state, null, 2) + "\n",
				`haiku: request changes for stage ${stageName} (external review)`
			)
			if (success) {
				setGateAction("success")
				setTimeout(() => window.location.reload(), 1500)
			} else {
				setGateAction("error")
			}
		} catch {
			setGateAction("error")
		}
	}

	// Restore state from hash on mount
	useEffect(() => {
		const params = parseHash()
		if (params.view === "board") setViewMode("board")
		if (params.unit && params.stage) {
			const stageState = intent.stages.find(s => s.name === params.stage)
			const unit = stageState?.units.find(u => u.name === params.unit)
			if (unit) setSelectedUnit({ unit, stage: params.stage })
		}
	}, [intent])

	const updateHash = (overrides: Record<string, string>) => {
		setHash({ intent: intent.slug, ...overrides })
	}

	const handleSelectUnit = (unit: HaikuUnit, stage: string) => {
		setSelectedUnit({ unit, stage })
		pushHash({ intent: intent.slug, unit: unit.name, stage })
	}

	const handleBackFromUnit = () => {
		setSelectedUnit(null)
		window.history.back()
	}

	const handleViewModeChange = (mode: "pipeline" | "board") => {
		setViewMode(mode)
		updateHash({ view: mode !== "pipeline" ? mode : "" })
	}

	if (selectedUnit) {
		return (
			<UnitDetailView
				unit={selectedUnit.unit}
				stageName={selectedUnit.stage}
				intentSlug={intent.slug}
				provider={provider}
				onBack={handleBackFromUnit}
			/>
		)
	}

	const totalUnits = intent.stages.reduce((acc, s) => acc + s.units.length, 0)
	const completedUnits = intent.stages.reduce(
		(acc, s) => acc + s.units.filter((u) => u.status === "completed").length,
		0,
	)

	return (
		<div className={`mx-auto px-4 py-8 lg:py-12 ${viewMode === "board" ? "max-w-full" : "max-w-5xl"}`}>
			{/* Header */}
			<button
				onClick={onBack}
				className="mb-4 text-sm text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
			>
				&larr; Back to Portfolio
			</button>

			<header className="mb-8">
				<h1 className="mb-2 text-3xl font-bold tracking-tight">{intent.title}</h1>
				<div className="flex flex-wrap gap-4 text-sm text-stone-500 dark:text-stone-400">
					<span>
						Studio: <strong className="text-stone-700 dark:text-stone-300">{titleCase(intent.studio)}</strong>
					</span>
					<span>
						Mode: <strong className="text-stone-700 dark:text-stone-300">{intent.mode}</strong>
					</span>
					<span>
						Units: <strong className="text-stone-700 dark:text-stone-300">{completedUnits}/{totalUnits}</strong>
					</span>
					<span>
						Status: <strong className="text-stone-700 dark:text-stone-300">{intent.status}</strong>
					</span>
				</div>
			</header>

			{/* View toggle */}
			<div className="mb-4 flex gap-1 rounded-lg border border-stone-200 p-1 dark:border-stone-700 w-fit">
				<button
					onClick={() => handleViewModeChange("pipeline")}
					className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${viewMode === "pipeline" ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-500 hover:text-stone-700"}`}
				>
					Pipeline
				</button>
				<button
					onClick={() => handleViewModeChange("board")}
					className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${viewMode === "board" ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-500 hover:text-stone-700"}`}
				>
					Board
				</button>
			</div>

			{viewMode === "board" ? (
				<section className="mb-8">
					<IntentKanban
						intent={intent}
						onSelectUnit={(u) => {
							const unit = intent.stages.find(s => s.name === u.stage)?.units.find(un => un.name === u.name)
							if (unit) handleSelectUnit(unit, u.stage)
						}}
					/>
				</section>
			) : (
			<>
			{/* Stage Pipeline */}
			<section className="mb-8">
				<h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-400">
					Stage Pipeline
				</h2>
				<div className="flex flex-wrap items-center gap-1">
					{intent.stages.map((stage, i) => {
						const colors = stageStatusColors[stage.status] || stageStatusColors.pending
						return (
							<div key={stage.name} className="flex items-center">
								<button
									onClick={() => setExpandedStage(expandedStage === stage.name ? null : stage.name)}
									className={`rounded-lg border px-4 py-2 transition ${colors.bg} ${
										expandedStage === stage.name ? "ring-2 ring-teal-400" : ""
									}`}
								>
									<div className="flex items-center gap-2">
										<span className={`h-2 w-2 rounded-full ${colors.dot}`} />
										<span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
											{titleCase(stage.name)}
										</span>
									</div>
									<div className="mt-0.5 text-xs text-stone-400">
										{stage.units.length} unit{stage.units.length !== 1 ? "s" : ""}
									</div>
								</button>
								{i < intent.stages.length - 1 && (
									<svg className="mx-1 h-4 w-4 flex-shrink-0 text-stone-300 dark:text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
									</svg>
								)}
							</div>
						)
					})}
				</div>
			</section>

			{/* Expanded Stage — Units */}
			{expandedStage && (() => {
				const expandedStageData = intent.stages.find((s) => s.name === expandedStage)!
				return (
					<section className="mb-8">
						<StageDetail
							stage={expandedStageData}
							onSelectUnit={(unit) => handleSelectUnit(unit, expandedStage)}
						/>
						{expandedStageData.phase === "gate" && !expandedStageData.gateOutcome && provider.writeFile && (
							<div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-800/50">
								<h4 className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">
									External Review Gate
								</h4>
								{gateAction === "success" ? (
									<p className="text-sm text-green-600 dark:text-green-400">
										Decision recorded. Refreshing...
									</p>
								) : gateAction === "error" ? (
									<div>
										<p className="mb-2 text-sm text-red-600 dark:text-red-400">
											Failed to write gate decision. Ensure you have write access to this repository.
										</p>
										<button
											onClick={() => setGateAction("idle")}
											className="text-sm text-stone-500 underline hover:text-stone-700 dark:hover:text-stone-300"
										>
											Try again
										</button>
									</div>
								) : (
									<div className="flex gap-3">
										<button
											onClick={() => handleApproveStage(expandedStage)}
											disabled={gateAction !== "idle"}
											className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
										>
											{gateAction === "approving" ? "Approving..." : "Approve Stage"}
										</button>
										<button
											onClick={() => handleRejectStage(expandedStage)}
											disabled={gateAction !== "idle"}
											className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
										>
											{gateAction === "rejecting" ? "Requesting..." : "Request Changes"}
										</button>
									</div>
								)}
							</div>
						)}
					</section>
				)
			})()}

			{/* Intent Content */}
			{intent.content && (
				<section className="mb-8">
					<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
						Intent Description
					</h2>
					<div className="rounded-xl border border-stone-200 p-6 dark:border-stone-700">
						<div className="prose prose-sm prose-stone dark:prose-invert max-w-none">
							<ReactMarkdown remarkPlugins={[remarkGfm]}>{intent.content}</ReactMarkdown>
						</div>
					</div>
				</section>
			)}

			</>
			)}

			{/* Knowledge Artifacts */}
			{intent.knowledge.length > 0 && (
				<section className="mb-8">
					<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
						Knowledge Artifacts
					</h2>
					<div className="space-y-2">
						{intent.knowledge.map((file) => (
							<KnowledgeFile key={file} file={file} intentSlug={intent.slug} provider={provider} />
						))}
					</div>
				</section>
			)}

			{/* Operations */}
			{intent.operations.length > 0 && (
				<section className="mb-8">
					<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
						Operations
					</h2>
					<div className="space-y-2">
						{intent.operations.map((file) => (
							<KnowledgeFile key={file} file={file} intentSlug={intent.slug} provider={provider} basePath="operations" />
						))}
					</div>
				</section>
			)}

			{/* Reflection */}
			{intent.reflection && (
				<section className="mb-8">
					<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
						Reflection
					</h2>
					<div className="rounded-xl border border-stone-200 p-6 dark:border-stone-700">
						<div className="prose prose-sm prose-stone dark:prose-invert max-w-none">
							<ReactMarkdown remarkPlugins={[remarkGfm]}>{intent.reflection}</ReactMarkdown>
						</div>
					</div>
				</section>
			)}
		</div>
	)
}

function KnowledgeFile({ file, intentSlug, provider, basePath = "knowledge" }: { file: string; intentSlug: string; provider: BrowseProvider; basePath?: string }) {
	const [content, setContent] = useState<string | null>(null)
	const [expanded, setExpanded] = useState(false)

	const handleExpand = async () => {
		if (content === null) {
			const raw = await provider.readFile(`.haiku/intents/${intentSlug}/${basePath}/${file}`)
			setContent(raw || "(empty)")
		}
		setExpanded(!expanded)
	}

	return (
		<div className="rounded-lg border border-stone-200 dark:border-stone-700">
			<button
				onClick={handleExpand}
				className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-800"
			>
				<span className="font-mono text-stone-600 dark:text-stone-400">{file}</span>
				<svg className={`h-4 w-4 text-stone-400 transition ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
				</svg>
			</button>
			{expanded && content && (
				<div className="border-t border-stone-100 px-4 py-4 dark:border-stone-800">
					<div className="prose prose-sm prose-stone dark:prose-invert max-w-none">
						<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
					</div>
				</div>
			)}
		</div>
	)
}

function StageDetail({ stage, onSelectUnit }: { stage: HaikuStageState; onSelectUnit: (u: HaikuUnit) => void }) {
	if (stage.units.length === 0) {
		return (
			<div className="rounded-xl border border-stone-200 px-6 py-8 text-center dark:border-stone-700">
				<p className="text-stone-500">No units in this stage yet.</p>
			</div>
		)
	}

	return (
		<div className="space-y-2">
			<h3 className="text-sm font-semibold text-stone-600 dark:text-stone-300">
				{titleCase(stage.name)} — {stage.units.length} unit{stage.units.length !== 1 ? "s" : ""}
			</h3>
			{stage.units.map((unit) => {
				const checkedCount = unit.criteria.filter((c) => c.checked).length
				const totalCriteria = unit.criteria.length
				return (
					<button
						key={unit.name}
						onClick={() => onSelectUnit(unit)}
						className="w-full rounded-lg border border-stone-200 px-5 py-3 text-left transition hover:border-teal-300 dark:border-stone-700 dark:hover:border-teal-700"
					>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
									{titleCase(unit.name)}
								</span>
								<span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${unitStatusColors[unit.status] || unitStatusColors.pending}`}>
									{unit.status}
								</span>
								{unit.type && (
									<span className="text-xs text-stone-400">{unit.type}</span>
								)}
							</div>
							{totalCriteria > 0 && (
								<span className="text-xs text-stone-400">
									{checkedCount}/{totalCriteria} criteria
								</span>
							)}
						</div>
						{unit.dependsOn.length > 0 && (
							<div className="mt-1 text-xs text-stone-400">
								Depends on: {unit.dependsOn.join(", ")}
							</div>
						)}
					</button>
				)
			})}
		</div>
	)
}
