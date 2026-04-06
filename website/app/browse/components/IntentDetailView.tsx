"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { BrowseProvider, HaikuAsset, HaikuIntentDetail, HaikuStageState, HaikuUnit } from "@/lib/browse/types"
import { formatDate, formatDuration } from "@/lib/browse/types"
import { buildBrowseUrl } from "@/lib/browse/url"
import type { BrowseLocation } from "@/lib/browse/url"
import { resolveLinks } from "@/lib/browse/resolve-links"
import type { ProviderLink } from "@/lib/browse/resolve-links"
import { UnitDetailView } from "./UnitDetailView"
import { IntentKanban } from "./KanbanView"
import { AuthenticatedMedia } from "./AuthenticatedMedia"
import { AssetLightbox } from "./AssetLightbox"

function titleCase(s: string): string {
	return s
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ")
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
	location?: BrowseLocation
	onBack: () => void
}

export function IntentDetailView({ intent, provider, location, onBack }: Props) {
	const router = useRouter()
	const [selectedUnit, setSelectedUnit] = useState<{ unit: HaikuUnit; stage: string } | null>(null)
	const [expandedStage, setExpandedStage] = useState<string | null>(intent.activeStage || null)
	const [viewMode, setViewMode] = useState<"pipeline" | "board">("pipeline")
	const [gateAction, setGateAction] = useState<"idle" | "approving" | "rejecting" | "success" | "error">("idle")
	const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
	const [lightboxAsset, setLightboxAsset] = useState<HaikuAsset | null>(null)

	const host = location?.host || ""

	// Load settings once for provider link resolution
	useEffect(() => {
		provider.getSettings().then(setSettings)
	}, [provider])

	// Whether we have path-based navigation (remote browse) or local-only state
	const hasPathNav = !!location

	// Build a URL helper that inherits host/project/branch from the current location
	const browseUrl = useCallback((overrides: Partial<BrowseLocation> = {}) => {
		if (!location) return "#"
		return buildBrowseUrl({
			host: location.host,
			project: location.project,
			branch: location.branch,
			intent: intent.slug,
			...overrides,
		})
	}, [location, intent.slug])

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

	// Restore state from URL on mount
	useEffect(() => {
		if (location?.stage && location?.unit) {
			const stageState = intent.stages.find(s => s.name === location.stage)
			const unit = stageState?.units.find(u => u.name === location.unit)
			if (unit) setSelectedUnit({ unit, stage: location.stage })
		}
		if (location?.stage && !location?.unit) {
			setExpandedStage(location.stage)
		}
	}, [intent, location?.stage, location?.unit])

	// Listen for browser back/forward (path-based navigation only)
	useEffect(() => {
		if (!hasPathNav) return
		const onPopState = () => {
			const segments = window.location.pathname.replace(/^\/browse\//, "").replace(/\/$/, "").split("/")
			const intentIdx = segments.indexOf("intent")
			if (intentIdx === -1) return

			const remaining = segments.slice(intentIdx + 1)
			// remaining: [slug] or [slug, stage] or [slug, stage, unit]
			if (remaining.length >= 3) {
				// Unit view
				const stageState = intent.stages.find(s => s.name === remaining[1])
				const unit = stageState?.units.find(u => u.name === remaining[2])
				if (unit) {
					setSelectedUnit({ unit, stage: remaining[1] })
				}
			} else {
				// Intent view (no unit selected)
				setSelectedUnit(null)
			}
		}
		window.addEventListener("popstate", onPopState)
		return () => window.removeEventListener("popstate", onPopState)
	}, [intent, hasPathNav])

	const handleSelectUnit = (unit: HaikuUnit, stage: string) => {
		setSelectedUnit({ unit, stage })
		if (hasPathNav) {
			router.push(browseUrl({ stage, unit: unit.name }))
		}
	}

	const handleBackFromUnit = () => {
		setSelectedUnit(null)
		if (hasPathNav) {
			window.history.back()
		}
	}

	const handleViewModeChange = (mode: "pipeline" | "board") => {
		setViewMode(mode)
	}

	if (selectedUnit) {
		return (
			<UnitDetailView
				unit={selectedUnit.unit}
				stageName={selectedUnit.stage}
				intentSlug={intent.slug}
				provider={provider}
				assets={intent.assets}
				host={host || undefined}
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

			{/* Provider Links */}
			<ProviderLinksSection frontmatter={intent.raw} settings={settings} />

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

			{/* Assets */}
			{intent.assets.length > 0 && host && (
				<AssetsSection assets={intent.assets} host={host} onSelect={setLightboxAsset} />
			)}

			{/* Asset Lightbox */}
			{lightboxAsset && host && (
				<AssetLightbox
					asset={lightboxAsset}
					host={host}
					onClose={() => setLightboxAsset(null)}
				/>
			)}
		</div>
	)
}

const FIELD_LABELS: Record<string, string> = {
	ticket: "Ticket",
	epic: "Epic",
	design_ref: "Design",
	spec_url: "Spec",
	branch: "Branch",
}

function ProviderLinksSection({ frontmatter, settings }: { frontmatter: Record<string, unknown>; settings: Record<string, unknown> | null }) {
	const links = resolveLinks(frontmatter, settings)
	if (links.length === 0) return null

	return (
		<section className="mb-8">
			<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
				References
			</h2>
			<div className="flex flex-wrap gap-3">
				{links.map((link) => (
					<ProviderLinkBadge key={link.field} link={link} />
				))}
			</div>
		</section>
	)
}

function ProviderLinkBadge({ link }: { link: ProviderLink }) {
	const label = FIELD_LABELS[link.field] || titleCase(link.field)

	if (link.url) {
		return (
			<a
				href={link.url}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-teal-600 transition hover:border-teal-300 hover:bg-teal-50 dark:border-stone-700 dark:text-teal-400 dark:hover:border-teal-700 dark:hover:bg-teal-950"
			>
				<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
				</svg>
				<span className="text-stone-500 dark:text-stone-400">{label}:</span>
				{link.value}
			</a>
		)
	}

	return (
		<span className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 dark:border-stone-700 dark:text-stone-400">
			<span className="font-medium text-stone-500 dark:text-stone-400">{label}:</span>
			{link.value}
		</span>
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

/** Group assets by their directory path and render as a grid with thumbnails */
function AssetsSection({ assets, host, onSelect }: { assets: HaikuAsset[]; host: string; onSelect: (a: HaikuAsset) => void }) {
	// Group assets by directory
	const grouped = new Map<string, HaikuAsset[]>()
	for (const asset of assets) {
		const dir = asset.path.includes("/")
			? asset.path.substring(0, asset.path.lastIndexOf("/") + 1)
			: ""
		const existing = grouped.get(dir) || []
		existing.push(asset)
		grouped.set(dir, existing)
	}

	return (
		<section className="mb-8">
			<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
				Assets
			</h2>
			<div className="space-y-6">
				{Array.from(grouped.entries()).map(([dir, dirAssets]) => (
					<div key={dir || "__root__"}>
						{dir && (
							<h3 className="mb-2 text-xs font-mono text-stone-500 dark:text-stone-400">
								{dir}
							</h3>
						)}
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
							{dirAssets.map((asset) => (
								<button
									key={asset.path}
									onClick={() => onSelect(asset)}
									className="group overflow-hidden rounded-lg border border-stone-200 transition hover:border-teal-300 hover:shadow-sm dark:border-stone-700 dark:hover:border-teal-700"
								>
									<div className="overflow-hidden">
										<AuthenticatedMedia
											rawUrl={asset.rawUrl}
											name={asset.name}
											host={host}
											onClick={() => onSelect(asset)}
											className="rounded-t-lg"
										/>
									</div>
									<div className="border-t border-stone-100 px-3 py-2 dark:border-stone-800">
										<p className="truncate text-xs font-medium text-stone-700 group-hover:text-teal-600 dark:text-stone-300 dark:group-hover:text-teal-400">
											{asset.name}
										</p>
									</div>
								</button>
							))}
						</div>
					</div>
				))}
			</div>
		</section>
	)
}
