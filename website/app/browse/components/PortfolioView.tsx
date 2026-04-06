"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { BrowseProvider, HaikuIntent, HaikuIntentDetail } from "@/lib/browse/types"
import { formatDate, formatDuration } from "@/lib/browse/types"
import { buildBrowseUrl } from "@/lib/browse/url"
import type { BrowseLocation } from "@/lib/browse/url"
import { IntentDetailView } from "./IntentDetailView"
import { PortfolioKanban } from "./KanbanView"

interface Props {
	provider: BrowseProvider
	location?: BrowseLocation
	onBack: () => void
	repoLabel?: string
}

function titleCase(s: string): string {
	return s
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ")
}

const statusColors: Record<string, string> = {
	active: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
	completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
	archived: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
	blocked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

export function PortfolioView({ provider, location, onBack, repoLabel }: Props) {
	const router = useRouter()
	const [intents, setIntents] = useState<HaikuIntent[]>([])
	const [selectedIntent, setSelectedIntent] = useState<HaikuIntentDetail | null>(null)
	const [loading, setLoading] = useState(true)
	const [loadingMore, setLoadingMore] = useState(false)
	const [loadingDetail, setLoadingDetail] = useState(false)
	const [viewMode, setViewMode] = useState<"list" | "board">(location?.view === "board" ? "board" : "list")
	const initialNavHandled = useRef(false)

	// Whether we have path-based navigation (remote browse) or local-only state
	const hasPathNav = !!location

	// Build a URL helper that inherits host/project/branch from the current location
	const browseUrl = useCallback((overrides: Partial<BrowseLocation> = {}) => {
		if (!location) return "#"
		return buildBrowseUrl({
			host: location.host,
			project: location.project,
			branch: location.branch,
			...overrides,
		})
	}, [location])

	// Restore deeplink state IMMEDIATELY before loading the full list
	useEffect(() => {
		if (initialNavHandled.current) return
		initialNavHandled.current = true
		if (location?.intent) {
			// Load the deeplinked intent right away — don't wait for the full list
			setLoadingDetail(true)
			provider.getIntent(location.intent).then(detail => {
				setSelectedIntent(detail)
				setLoadingDetail(false)
			})
		}
	}, [provider, location?.intent])

	// Progressive loading — show each intent as it loads
	useEffect(() => {
		async function load() {
			setIntents([])
			setLoadingMore(true)

			await provider.listIntents((intent) => {
				setIntents((prev) => [...prev, intent])
				setLoading(false)
			})

			setLoadingMore(false)
			setLoading(false)
		}
		load()
	}, [provider])

	// Listen for browser back/forward (path-based navigation only)
	useEffect(() => {
		if (!hasPathNav) return
		const onPopState = () => {
			// Re-parse the current URL to determine state
			const segments = window.location.pathname.replace(/^\/browse\//, "").replace(/\/$/, "").split("/")
			const hasIntent = segments.includes("intent")
			const hasBoard = segments.includes("board")

			if (hasIntent) {
				const intentIdx = segments.indexOf("intent")
				const slug = segments[intentIdx + 1]
				if (slug) {
					provider.getIntent(slug).then(detail => setSelectedIntent(detail))
				}
			} else {
				setSelectedIntent(null)
			}
			if (hasBoard) {
				setViewMode("board")
			} else if (!hasIntent) {
				setViewMode("list")
			}
		}
		window.addEventListener("popstate", onPopState)
		return () => window.removeEventListener("popstate", onPopState)
	}, [provider, hasPathNav])

	const handleSelectIntent = useCallback(
		async (slug: string) => {
			setLoadingDetail(true)
			const detail = await provider.getIntent(slug)
			setSelectedIntent(detail)
			setLoadingDetail(false)
			if (hasPathNav) {
				router.push(browseUrl({ intent: slug }))
			}
		},
		[provider, router, browseUrl, hasPathNav],
	)

	const handleBackFromIntent = useCallback(() => {
		setSelectedIntent(null)
		if (hasPathNav) {
			window.history.back()
		}
	}, [hasPathNav])

	const handleViewModeChange = useCallback((mode: "list" | "board") => {
		setViewMode(mode)
		if (hasPathNav) {
			const url = mode === "board"
				? browseUrl({ view: "board" })
				: browseUrl()
			window.history.replaceState(null, "", url)
		}
	}, [browseUrl, hasPathNav])

	if (selectedIntent) {
		return (
			<IntentDetailView
				intent={selectedIntent}
				provider={provider}
				location={location}
				onBack={handleBackFromIntent}
			/>
		)
	}

	return (
		<div className={`mx-auto px-4 py-8 lg:py-12 ${viewMode === "board" ? "max-w-full" : "max-w-5xl"}`}>
			{/* Header */}
			<div className="mb-8 flex items-center justify-between">
				<div>
					<button
						onClick={onBack}
						className="mb-2 text-sm text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
					>
						&larr; Back
					</button>
					<h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
					{repoLabel && (
						<p className="mt-1 font-mono text-sm text-stone-500 dark:text-stone-400">
							{repoLabel}
						</p>
					)}
				</div>
				<div className="text-right text-sm text-stone-500 dark:text-stone-400">
					<div>
						Source: <strong className="text-stone-700 dark:text-stone-300">{provider.name}</strong>
					</div>
					<div>
						<strong className="text-stone-700 dark:text-stone-300">{intents.length}</strong> intent{intents.length !== 1 ? "s" : ""}
					</div>
				</div>
			</div>

			{/* View toggle */}
			{!loading && intents.length > 0 && (
				<div className="mb-4 flex gap-1 rounded-lg border border-stone-200 p-1 dark:border-stone-700 w-fit">
					<button
						onClick={() => handleViewModeChange("list")}
						className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${viewMode === "list" ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-500 hover:text-stone-700"}`}
					>
						List
					</button>
					<button
						onClick={() => handleViewModeChange("board")}
						className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${viewMode === "board" ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-500 hover:text-stone-700"}`}
					>
						Board
					</button>
				</div>
			)}

			{loading && intents.length === 0 ? (
				<div className="space-y-3">
					{[1, 2, 3, 4].map((i) => (
						<div key={i} className="animate-pulse rounded-xl border border-stone-200 px-6 py-4 dark:border-stone-700">
							<div className="flex items-center justify-between">
								<div>
									<div className="h-5 w-48 rounded bg-stone-200 dark:bg-stone-700" />
									<div className="mt-2 flex gap-4">
										<div className="h-3 w-20 rounded bg-stone-100 dark:bg-stone-800" />
										<div className="h-3 w-16 rounded bg-stone-100 dark:bg-stone-800" />
										<div className="h-3 w-24 rounded bg-stone-100 dark:bg-stone-800" />
									</div>
								</div>
								<div className="h-8 w-12 rounded bg-stone-100 dark:bg-stone-800" />
							</div>
							<div className="mt-3 h-1.5 w-full rounded-full bg-stone-100 dark:bg-stone-800" />
						</div>
					))}
				</div>
			) : !loading && intents.length === 0 ? (
				<div className="rounded-xl border border-stone-200 px-8 py-16 text-center dark:border-stone-700">
					<p className="text-lg font-medium text-stone-600 dark:text-stone-400">No intents found</p>
					<p className="mt-2 text-sm text-stone-500">
						This workspace has no <code>.haiku/intents/</code> directory, or it's empty.
					</p>
				</div>
			) : viewMode === "board" ? (
				<PortfolioKanban
					provider={provider}
					intents={intents}
					onSelectIntent={handleSelectIntent}
				/>
			) : (
				<div className="space-y-3">
					{[...intents].sort((a, b) => {
						// Active first, then completed, then archived
						const statusOrder: Record<string, number> = { active: 0, blocked: 1, completed: 2, archived: 3 }
						const sa = statusOrder[a.status] ?? 1
						const sb = statusOrder[b.status] ?? 1
						if (sa !== sb) return sa - sb
						// Within same status, sort by start date descending (newest first)
						const da = a.startedAt ? new Date(a.startedAt).getTime() : 0
						const db = b.startedAt ? new Date(b.startedAt).getTime() : 0
						return db - da
					}).map((intent) => (
						<Link
							key={intent.slug}
							href={browseUrl({ intent: intent.slug })}
							onClick={(e) => {
								e.preventDefault()
								handleSelectIntent(intent.slug)
							}}
							className="block w-full rounded-xl border border-stone-200 px-6 py-4 text-left transition hover:border-teal-300 hover:shadow-sm dark:border-stone-700 dark:hover:border-teal-700"
						>
							<div className="flex items-center justify-between">
								<div>
									<div className="flex items-center gap-3">
										<h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
											{intent.title}
										</h2>
										<span className={`rounded px-2 py-0.5 text-xs font-medium ${statusColors[intent.status] || statusColors.active}`}>
											{intent.status}
										</span>
									</div>
									<div className="mt-1 flex items-center gap-4 text-sm text-stone-500 dark:text-stone-400">
										<span>
											Studio: <strong className="text-stone-700 dark:text-stone-300">{titleCase(intent.studio)}</strong>
										</span>
										{intent.activeStage && (
											<span>
												Stage: <strong className="text-stone-700 dark:text-stone-300">{titleCase(intent.activeStage)}</strong>
											</span>
										)}
										<span>
											Mode: <strong className="text-stone-700 dark:text-stone-300">{intent.mode}</strong>
										</span>
										{intent.startedAt && (
											<span>
												{formatDate(intent.startedAt)}{intent.completedAt ? ` — ${formatDate(intent.completedAt)}` : ""}
											</span>
										)}
										{intent.startedAt && (
											<span className="font-mono text-xs">
												{intent.completedAt ? formatDuration(intent.startedAt, intent.completedAt) : `${formatDuration(intent.startedAt, null)} elapsed`}
											</span>
										)}
									</div>
								</div>
								{intent.stagesTotal > 0 && (
									<div className="text-right">
										<div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
											{Math.max(0, intent.stagesComplete)}/{intent.stagesTotal}
										</div>
										<div className="text-xs text-stone-400">stages</div>
									</div>
								)}
							</div>
							{/* Progress bar */}
							{intent.stagesTotal > 0 && (
								<div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
									<div
										className="h-full rounded-full bg-teal-500 transition-all"
										style={{ width: `${Math.max(0, (intent.stagesComplete / intent.stagesTotal) * 100)}%` }}
									/>
								</div>
							)}
						</Link>
					))}
					{loadingMore && (
						<div className="animate-pulse rounded-xl border border-stone-200 px-6 py-4 dark:border-stone-700">
							<div className="h-5 w-36 rounded bg-stone-200 dark:bg-stone-700" />
							<div className="mt-2 flex gap-4">
								<div className="h-3 w-16 rounded bg-stone-100 dark:bg-stone-800" />
								<div className="h-3 w-20 rounded bg-stone-100 dark:bg-stone-800" />
							</div>
							<div className="mt-3 h-1.5 w-full rounded-full bg-stone-100 dark:bg-stone-800" />
						</div>
					)}
				</div>
			)}
		</div>
	)
}
