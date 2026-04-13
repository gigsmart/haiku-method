"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { BrowseProvider, HaikuArtifact, HaikuAsset, HaikuIntent, HaikuIntentDetail, HaikuKnowledgeFile, HaikuStageState, HaikuUnit } from "@/lib/browse/types"
import { buildBrowseUrl } from "@/lib/browse/url"
import type { BrowseLocation } from "@/lib/browse/url"
import { resolveLinks } from "@/lib/browse/resolve-links"
import type { ProviderLink } from "@/lib/browse/resolve-links"
import { UnitDetailView } from "./UnitDetailView"
import { IntentKanban } from "./KanbanView"
import { AuthenticatedMedia } from "./AuthenticatedMedia"
import { BrowseMarkdown } from "./BrowseMarkdown"
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
	initialStage?: string
	onBack: () => void
}

export function IntentDetailView({ intent, provider, location, initialStage, onBack }: Props) {
	const router = useRouter()
	const [selectedUnit, setSelectedUnit] = useState<{ unit: HaikuUnit; stage: string } | null>(null)
	const [expandedStage, setExpandedStage] = useState<string | null>(initialStage || intent.activeStage || null)
	const stageRefs = useRef<Record<string, HTMLElement | null>>({})
	const [viewMode, setViewMode] = useState<"pipeline" | "board">("pipeline")
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

	// Scroll to initially expanded stage on mount
	useEffect(() => {
		const target = initialStage || location?.stage
		if (target && !location?.unit) {
			// Small delay so DOM has rendered the expanded stage section
			const timeout = setTimeout(() => {
				stageRefs.current[target]?.scrollIntoView({ behavior: "smooth", block: "start" })
			}, 150)
			return () => clearTimeout(timeout)
		}
	}, [initialStage, location?.stage, location?.unit])

	// Listen for browser back/forward (path-based navigation only)
	useEffect(() => {
		if (!hasPathNav) return
		const onPopState = () => {
			const segments = window.location.pathname.replace(/^\/browse\//, "").replace(/\/$/, "").split("/")
			const intentIdx = segments.indexOf("intent")
			if (intentIdx === -1) return

			const remaining = segments.slice(intentIdx + 1)
			// Parse stage and unit from remaining segments
			// New format: [slug, "stage", stageName, unit?] or legacy [slug, stageName, unit?]
			let parsedStage: string | undefined
			let parsedUnit: string | undefined
			if (remaining.length >= 3 && remaining[1] === "stage") {
				parsedStage = remaining[2]
				if (remaining.length >= 4) parsedUnit = remaining[3]
			} else if (remaining.length >= 2 && remaining[1] !== "stage") {
				parsedStage = remaining[1]
				if (remaining.length >= 3) parsedUnit = remaining[2]
			}

			if (parsedUnit && parsedStage) {
				const stageState = intent.stages.find(s => s.name === parsedStage)
				const unit = stageState?.units.find(u => u.name === parsedUnit)
				if (unit) {
					setSelectedUnit({ unit, stage: parsedStage })
				}
			} else {
				setSelectedUnit(null)
				if (parsedStage) {
					setExpandedStage(parsedStage)
				}
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
			<ProviderLinksSection frontmatter={intent.raw} settings={settings} intent={intent} providerName={provider.name} host={host} project={location?.project || ""} />

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
									onClick={() => {
										const newStage = expandedStage === stage.name ? null : stage.name
										setExpandedStage(newStage)
										if (hasPathNav) {
											const url = newStage
												? browseUrl({ stage: newStage })
												: browseUrl()
											window.history.pushState({}, "", url)
										}
									}}
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
					<section className="mb-8" ref={(el) => { stageRefs.current[expandedStage] = el }}>
						<StageDetail
							stage={expandedStageData}
							providerName={provider.name}
							host={host || undefined}
							project={location?.project || ""}
							onSelectUnit={(unit) => handleSelectUnit(unit, expandedStage)}
							assets={intent.assets}
						/>
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
							<BrowseMarkdown assets={intent.assets} host={host || undefined} basePath={`.haiku/intents/${intent.slug}`}>{intent.content}</BrowseMarkdown>
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
						{intent.knowledge.map((kf) => (
							<KnowledgeFileCard key={kf.name} file={kf} assets={intent.assets} host={host || undefined} basePath={`.haiku/intents/${intent.slug}/knowledge`} />
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
						{intent.operations.map((kf) => (
							<KnowledgeFileCard key={kf.name} file={kf} assets={intent.assets} host={host || undefined} basePath={`.haiku/intents/${intent.slug}/operations`} />
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
							<BrowseMarkdown assets={intent.assets} host={host || undefined} basePath={`.haiku/intents/${intent.slug}`}>{intent.reflection}</BrowseMarkdown>
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

const prStatusColors: Record<string, string> = {
	open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
	opened: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
	merged: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
	closed: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
}

function ProviderLinksSection({ frontmatter, settings, intent, providerName, host, project }: { frontmatter: Record<string, unknown>; settings: Record<string, unknown> | null; intent: HaikuIntent; providerName: string; host: string; project: string }) {
	const links = resolveLinks(frontmatter, settings)
	const hasPr = intent.prUrl && intent.prStatus
	const isGitLab = providerName === "GitLab"
	const prLabel = isGitLab ? "MR" : "PR"

	// Build branch URL for the provider
	let branchUrl: string | null = null
	if (intent.branch) {
		if (isGitLab) {
			branchUrl = `https://${host}/${project}/-/tree/${encodeURIComponent(intent.branch)}`
		} else {
			branchUrl = `https://${host}/${project}/tree/${encodeURIComponent(intent.branch)}`
		}
	}

	if (links.length === 0 && !hasPr && !intent.branch) return null

	return (
		<section className="mb-8">
			<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
				References
			</h2>
			<div className="flex flex-wrap gap-3">
				{hasPr && (
					<a
						href={intent.prUrl!}
						target="_blank"
						rel="noopener noreferrer"
						className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium hover:opacity-80 transition-opacity ${prStatusColors[intent.prStatus!] || prStatusColors.open}`}
					>
						<svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
							<path d="M5 5.5v5m6-5v5M5 3a2 2 0 100-4 2 2 0 000 4zm6 0a2 2 0 100-4 2 2 0 000 4zM5 14.5a2 2 0 100-4 2 2 0 000 4z" />
						</svg>
						{prLabel} {intent.prNumber ? `${isGitLab ? "!" : "#"}${intent.prNumber}` : ""} {intent.prStatus}
					</a>
				)}
				{intent.branch && (
					<a
						href={branchUrl || "#"}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 px-3 py-1.5 text-sm font-mono text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
					>
						<svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
							<path d="M6 3v10M6 3L3 6m3-3l3 3m4 7V3" />
						</svg>
						{intent.branch}
					</a>
				)}
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

/** Renders a knowledge or operations file with content available inline (collapsible). */
function KnowledgeFileCard({ file, assets, host, basePath }: { file: HaikuKnowledgeFile; assets?: HaikuAsset[]; host?: string; basePath?: string }) {
	const [expanded, setExpanded] = useState(false)

	return (
		<div className="rounded-lg border border-stone-200 dark:border-stone-700">
			<button
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-800"
			>
				<span className="font-mono text-stone-600 dark:text-stone-400">{file.name}</span>
				<svg className={`h-4 w-4 text-stone-400 transition ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
				</svg>
			</button>
			{expanded && (
				<div className="border-t border-stone-100 px-4 py-4 dark:border-stone-800">
					<div className="prose prose-sm prose-stone dark:prose-invert max-w-none">
						<BrowseMarkdown assets={assets} host={host} basePath={basePath}>{file.content || "(empty)"}</BrowseMarkdown>
					</div>
				</div>
			)}
		</div>
	)
}

/** Fullscreen modal for artifacts — handles Escape key and prevents background scroll. */
function ArtifactFullscreenModal({ artifact, assets, host, onClose }: { artifact: HaikuArtifact; assets?: HaikuAsset[]; host?: string; onClose: () => void }) {
	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		if (e.key === "Escape") onClose()
	}, [onClose])

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown)
		document.body.style.overflow = "hidden"
		return () => {
			document.removeEventListener("keydown", handleKeyDown)
			document.body.style.overflow = ""
		}
	}, [handleKeyDown])

	if (artifact.type === "html" && artifact.content) {
		return (
			<div className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-stone-950">
				<div className="flex items-center justify-between border-b border-stone-200 px-4 py-2 dark:border-stone-800">
					<span className="font-mono text-sm text-stone-600 dark:text-stone-400">{artifact.name}</span>
					<button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800">
						Close
					</button>
				</div>
				<iframe
					srcDoc={artifact.content}
					title={artifact.name}
					className="flex-1 border-0"
					sandbox="allow-same-origin"
				/>
			</div>
		)
	}

	if (artifact.type === "image") {
		return (
			<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
				<div className="relative flex max-h-[95vh] max-w-[95vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-stone-900" onClick={(e) => e.stopPropagation()}>
					<div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-700">
						<span className="truncate font-mono text-sm text-stone-600 dark:text-stone-400">{artifact.name}</span>
						<button onClick={onClose} className="ml-4 rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300" aria-label="Close">
							<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
					<div className="flex-1 overflow-auto p-4">
						{artifact.rawUrl && host ? (
							<AuthenticatedMedia rawUrl={artifact.rawUrl} name={artifact.name} host={host} className="max-h-[85vh] rounded-lg" fullSize />
						) : artifact.rawUrl ? (
							<img src={artifact.rawUrl} alt={artifact.name} className="max-h-[85vh] rounded-lg" />
						) : null}
					</div>
				</div>
			</div>
		)
	}

	if (artifact.type === "markdown" && artifact.content) {
		return (
			<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
				<div className="relative flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-stone-900" onClick={(e) => e.stopPropagation()}>
					<div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-700">
						<span className="truncate font-mono text-sm text-stone-600 dark:text-stone-400">{artifact.name}</span>
						<button onClick={onClose} className="ml-4 rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300" aria-label="Close">
							<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
					<div className="flex-1 overflow-auto px-6 py-4">
						<div className="prose prose-sm prose-stone dark:prose-invert max-w-none">
							<BrowseMarkdown assets={assets} host={host}>{artifact.content}</BrowseMarkdown>
						</div>
					</div>
				</div>
			</div>
		)
	}

	return null
}

/** Thumbnail card for an artifact in the grid. HTML/Image show a preview; Markdown shows an icon. */
function ArtifactThumbnail({ artifact, host, onClick }: { artifact: HaikuArtifact; host?: string; onClick: () => void }) {
	if (artifact.type === "html" && artifact.content) {
		return (
			<button
				onClick={onClick}
				className="group flex flex-col overflow-hidden rounded-lg border border-stone-200 text-left transition hover:border-teal-300 hover:shadow-sm dark:border-stone-700 dark:hover:border-teal-700"
			>
				<div className="relative aspect-[4/3] w-full overflow-hidden bg-white dark:bg-stone-900">
					<iframe
						srcDoc={artifact.content}
						title={artifact.name}
						className="absolute inset-0 h-[300%] w-[300%] origin-top-left border-0"
						style={{ transform: "scale(0.3333)", pointerEvents: "none" }}
						tabIndex={-1}
						sandbox="allow-same-origin"
					/>
				</div>
				<div className="border-t border-stone-100 px-3 py-2 dark:border-stone-800">
					<p className="truncate text-xs font-medium text-stone-700 group-hover:text-teal-600 dark:text-stone-300 dark:group-hover:text-teal-400">
						{artifact.name}
					</p>
				</div>
			</button>
		)
	}

	if (artifact.type === "image") {
		return (
			<button
				onClick={onClick}
				className="group flex flex-col overflow-hidden rounded-lg border border-stone-200 text-left transition hover:border-teal-300 hover:shadow-sm dark:border-stone-700 dark:hover:border-teal-700"
			>
				<div className="h-[150px] w-full overflow-hidden bg-stone-50 dark:bg-stone-800/50">
					{artifact.rawUrl && host ? (
						<AuthenticatedMedia rawUrl={artifact.rawUrl} name={artifact.name} host={host} className="h-full w-full object-cover" />
					) : artifact.rawUrl ? (
						<img src={artifact.rawUrl} alt={artifact.name} className="h-full w-full object-cover" />
					) : (
						<div className="flex h-full items-center justify-center text-stone-300 dark:text-stone-600">
							<svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
						</div>
					)}
				</div>
				<div className="border-t border-stone-100 px-3 py-2 dark:border-stone-800">
					<p className="truncate text-xs font-medium text-stone-700 group-hover:text-teal-600 dark:text-stone-300 dark:group-hover:text-teal-400">
						{artifact.name}
					</p>
				</div>
			</button>
		)
	}

	// Markdown and other types — not thumbnailable, return null (handled separately)
	return null
}

/** Renders a markdown artifact as collapsible with a fullscreen option. */
function MarkdownArtifactCard({ artifact, assets, host }: { artifact: HaikuArtifact; assets?: HaikuAsset[]; host?: string }) {
	const [expanded, setExpanded] = useState(false)
	const [fullscreen, setFullscreen] = useState(false)

	return (
		<>
			<div className="rounded-lg border border-stone-200 dark:border-stone-700">
				<div className="flex w-full items-center justify-between px-4 py-3 text-left text-sm">
					<button
						onClick={() => setExpanded(!expanded)}
						className="flex flex-1 items-center gap-2 hover:text-stone-900 dark:hover:text-stone-100"
					>
						<svg className={`h-4 w-4 text-stone-400 transition ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
						</svg>
						<span className="font-mono text-stone-600 dark:text-stone-400">{artifact.name}</span>
					</button>
					<button
						onClick={() => setFullscreen(true)}
						className="ml-2 rounded px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-300"
					>
						Full Screen
					</button>
				</div>
				{expanded && (
					<div className="border-t border-stone-100 px-4 py-4 dark:border-stone-800">
						<div className="prose prose-sm prose-stone dark:prose-invert max-w-none">
							<BrowseMarkdown assets={assets} host={host}>{artifact.content || "(empty)"}</BrowseMarkdown>
						</div>
					</div>
				)}
			</div>
			{fullscreen && (
				<ArtifactFullscreenModal artifact={artifact} assets={assets} host={host} onClose={() => setFullscreen(false)} />
			)}
		</>
	)
}

/** Renders an "other" artifact type as a simple row. */
function OtherArtifactCard({ artifact }: { artifact: HaikuArtifact }) {
	return (
		<div className="rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-700">
			<span className="font-mono text-sm text-stone-600 dark:text-stone-400">{artifact.name}</span>
			{artifact.rawUrl && (
				<a href={artifact.rawUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-teal-600 hover:underline dark:text-teal-400">
					Download
				</a>
			)}
		</div>
	)
}

function StageDetail({ stage, providerName, host, project, onSelectUnit, assets }: { stage: HaikuStageState; providerName: string; host?: string; project?: string; onSelectUnit: (u: HaikuUnit) => void; assets?: HaikuAsset[] }) {
	const hasUnits = stage.units.length > 0
	const hasArtifacts = (stage.artifacts?.length ?? 0) > 0
	const [fullscreenArtifact, setFullscreenArtifact] = useState<HaikuArtifact | null>(null)
	const isGitLab = providerName === "GitLab"
	const prLabel = isGitLab ? "MR" : "PR"
	const prPrefix = isGitLab ? "!" : "#"

	// Split artifacts into thumbnailable (html/image) and non-thumbnailable (markdown/other)
	const thumbnailArtifacts = stage.artifacts?.filter(a => a.type === "html" || a.type === "image") ?? []
	const markdownArtifacts = stage.artifacts?.filter(a => a.type === "markdown") ?? []
	const otherArtifacts = stage.artifacts?.filter(a => a.type !== "html" && a.type !== "image" && a.type !== "markdown") ?? []

	if (!hasUnits && !hasArtifacts) {
		return (
			<div className="rounded-xl border border-stone-200 px-6 py-8 text-center dark:border-stone-700">
				<p className="text-stone-500">No units in this stage yet.</p>
			</div>
		)
	}

	// Build branch URL for the provider
	let branchUrl: string | null = null
	if (stage.branch && host && project) {
		if (isGitLab) {
			branchUrl = `https://${host}/${project}/-/tree/${encodeURIComponent(stage.branch)}`
		} else {
			branchUrl = `https://${host}/${project}/tree/${encodeURIComponent(stage.branch)}`
		}
	}

	return (
		<div className="space-y-4">
			{/* Stage header with branch/PR info */}
			<div className="flex flex-wrap items-center gap-3">
				<h3 className="text-sm font-semibold text-stone-600 dark:text-stone-300">
					{titleCase(stage.name)} — {stage.units.length} unit{stage.units.length !== 1 ? "s" : ""}
				</h3>
				{stage.prUrl && stage.prStatus && (
					<a
						href={stage.prUrl}
						target="_blank"
						rel="noopener noreferrer"
						className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium hover:opacity-80 transition-opacity ${prStatusColors[stage.prStatus] || prStatusColors.open}`}
					>
						<svg className="h-3 w-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
							<path d="M5 5.5v5m6-5v5M5 3a2 2 0 100-4 2 2 0 000 4zm6 0a2 2 0 100-4 2 2 0 000 4zM5 14.5a2 2 0 100-4 2 2 0 000 4z" />
						</svg>
						{prLabel} {stage.prNumber ? `${prPrefix}${stage.prNumber}` : ""} {stage.prStatus}
					</a>
				)}
				{stage.branch && (
					<a
						href={branchUrl || "#"}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 rounded bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs font-mono text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
					>
						<svg className="h-3 w-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
							<path d="M6 3v10M6 3L3 6m3-3l3 3m4 7V3" />
						</svg>
						{stage.branch.replace(/^haiku\//, "")}
					</a>
				)}
				{stage.phase === "gate" && (
					<span className={`rounded px-2 py-0.5 text-xs font-medium ${
						stage.gateOutcome === "advanced"
							? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
							: stage.gateOutcome === "changes_requested"
								? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
								: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
					}`}>
						{stage.gateOutcome === "advanced"
							? "Gate: Approved"
							: stage.gateOutcome === "changes_requested"
								? "Gate: Changes Requested"
								: "Gate: Awaiting Review"}
					</span>
				)}
			</div>
			{hasUnits && (
				<div className="space-y-2">
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
			)}
			{hasArtifacts && (
				<div className="space-y-3">
					<h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
						Stage Artifacts
					</h4>
					{/* Thumbnail grid for HTML and Image artifacts */}
					{thumbnailArtifacts.length > 0 && (
						<div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
							{thumbnailArtifacts.map((artifact) => (
								<ArtifactThumbnail key={artifact.name} artifact={artifact} host={host} onClick={() => setFullscreenArtifact(artifact)} />
							))}
						</div>
					)}
					{/* Collapsible markdown artifacts */}
					{markdownArtifacts.map((artifact) => (
						<MarkdownArtifactCard key={artifact.name} artifact={artifact} assets={assets} host={host} />
					))}
					{/* Other artifacts — simple row */}
					{otherArtifacts.map((artifact) => (
						<OtherArtifactCard key={artifact.name} artifact={artifact} />
					))}
				</div>
			)}
			{/* Fullscreen modal for thumbnail artifacts */}
			{fullscreenArtifact && (
				<ArtifactFullscreenModal artifact={fullscreenArtifact} assets={assets} host={host} onClose={() => setFullscreenArtifact(null)} />
			)}
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
