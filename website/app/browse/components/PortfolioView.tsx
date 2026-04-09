"use client"

import { createSearchIndex } from "@/lib/browse/search"
import type { SearchDocument } from "@/lib/browse/search"
import {
	type CachedDocument,
	cacheDocuments,
	clearIntentCache,
	getCachedDocuments,
	isCacheFresh,
	isDeepIndexComplete,
	markCacheIndexed,
} from "@/lib/browse/search-db"
import type {
	BrowseProvider,
	HaikuIntent,
	HaikuIntentDetail,
} from "@/lib/browse/types"
import { formatDate, formatDuration } from "@/lib/browse/types"
import { buildBrowseUrl } from "@/lib/browse/url"
import type { BrowseLocation } from "@/lib/browse/url"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { IntentDetailView } from "./IntentDetailView"
import { PortfolioKanban } from "./KanbanView"
import { SearchBar } from "./SearchBar"
import type { SearchSelection } from "./SearchBar"

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

function formatRelativeTime(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
	if (seconds < 5) return "just now"
	if (seconds < 60) return `${seconds}s ago`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	return `${hours}h ago`
}

const statusColors: Record<string, string> = {
	active: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
	completed:
		"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
	archived: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
	blocked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

const prStatusColors: Record<string, string> = {
	open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
	merged: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
	closed: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
}

export function PortfolioView({
	provider,
	location,
	onBack,
	repoLabel,
}: Props) {
	const router = useRouter()
	const [intents, setIntents] = useState<HaikuIntent[]>([])
	const [selectedIntent, setSelectedIntent] =
		useState<HaikuIntentDetail | null>(null)
	const [loading, setLoading] = useState(true)
	const [loadingMore, setLoadingMore] = useState(false)
	const [loadingDetail, setLoadingDetail] = useState(false)
	const [viewMode, setViewMode] = useState<"list" | "board">(
		location?.view === "board" ? "board" : "list",
	)
	const [knowledgeFiles, setKnowledgeFiles] = useState<string[]>([])
	const initialNavHandled = useRef(false)
	const [searchQuery, setSearchQuery] = useState("")
	const [searchIndexVersion, setSearchIndexVersion] = useState(0)
	const searchIndex = useMemo(() => createSearchIndex(), [])
	const indexedIds = useRef(new Set<string>())
	const [deepIndexProgress, setDeepIndexProgress] = useState<{
		current: number
		total: number
	} | null>(null)
	const deepIndexAbort = useRef<AbortController | null>(null)
	const cacheWriteBuffer = useRef<CachedDocument[]>([])
	const [lastPolled, setLastPolled] = useState<Date | null>(null)

	// Repo key for IndexedDB scoping
	const repoKey = useMemo(() => {
		if (!location) return "local"
		return `${location.host}/${location.project}/${location.branch || ""}`
	}, [location])

	// Whether we have path-based navigation (remote browse) or local-only state
	const hasPathNav = !!location

	// Build a URL helper that inherits host/project/branch from the current location
	const browseUrl = useCallback(
		(overrides: Partial<BrowseLocation> = {}) => {
			if (!location) return "#"
			return buildBrowseUrl({
				host: location.host,
				project: location.project,
				branch: location.branch,
				...overrides,
			})
		},
		[location],
	)

	// Helper to add a document to the search index (deduped) and buffer for cache
	const addToIndex = useCallback(
		(doc: SearchDocument) => {
			if (indexedIds.current.has(doc.id)) return
			indexedIds.current.add(doc.id)
			searchIndex.add(doc)
			// Buffer for IndexedDB persistence
			cacheWriteBuffer.current.push({
				...doc,
				repoKey,
				updatedAt: Date.now(),
			})
			setSearchIndexVersion((v) => v + 1)
		},
		[searchIndex, repoKey],
	)

	// Helper to remove a document from the search index
	const removeFromIndex = useCallback(
		(id: string) => {
			if (!indexedIds.current.has(id)) return
			indexedIds.current.delete(id)
			try {
				searchIndex.discard(id)
			} catch {
				/* already removed */
			}
		},
		[searchIndex],
	)

	// Index all sub-items from an intent detail (units, knowledge, assets)
	const indexIntentDetail = useCallback(
		(detail: HaikuIntentDetail) => {
			// Update the intent document with richer content
			const intentId = `intent:${detail.slug}`
			removeFromIndex(intentId)
			addToIndex({
				id: intentId,
				type: "intent",
				title: detail.title,
				slug: detail.slug,
				studio: detail.studio,
				status: detail.status,
				content: `${detail.title} ${detail.content || ""} ${detail.studio} ${detail.activeStage || ""} ${detail.mode}`,
			})

			// Remove stale units/knowledge/assets for this intent before re-indexing
			const staleIds = Array.from(indexedIds.current).filter(
				(id) =>
					id.startsWith(`unit:${detail.slug}:`) ||
					id.startsWith(`knowledge:${detail.slug}:`) ||
					id.startsWith(`asset:${detail.slug}:`),
			)
			for (const id of staleIds) {
				removeFromIndex(id)
			}

			// Index units
			for (const stage of detail.stages) {
				for (const unit of stage.units) {
					const criteriaText = unit.criteria.map((c) => c.text).join(" ")
					addToIndex({
						id: `unit:${detail.slug}:${stage.name}:${unit.name}`,
						type: "unit",
						title: unit.name,
						slug: detail.slug,
						stage: stage.name,
						studio: detail.studio,
						status: unit.status,
						content: `${unit.name} ${unit.content || ""} ${criteriaText} ${unit.type} ${unit.hat}`,
					})
				}
			}

			// Index knowledge files
			for (const file of detail.knowledge) {
				addToIndex({
					id: `knowledge:${detail.slug}:${file}`,
					type: "knowledge",
					title: file,
					slug: detail.slug,
					content: file,
					path: `.haiku/intents/${detail.slug}/knowledge/${file}`,
				})
			}

			// Index assets
			for (const asset of detail.assets) {
				addToIndex({
					id: `asset:${detail.slug}:${asset.path}`,
					type: "asset",
					title: asset.name,
					slug: detail.slug,
					content: `${asset.name} ${asset.path}`,
					path: asset.path,
				})
			}
		},
		[addToIndex, removeFromIndex],
	)

	// Restore deeplink state IMMEDIATELY before loading the full list
	useEffect(() => {
		if (initialNavHandled.current) return
		initialNavHandled.current = true
		if (location?.intent) {
			// Load the deeplinked intent right away — don't wait for the full list
			setLoadingDetail(true)
			provider.getIntent(location.intent).then((detail) => {
				setSelectedIntent(detail)
				if (detail) indexIntentDetail(detail)
				setLoadingDetail(false)
			}).catch((e) => {
				console.error("[haiku-browse] Failed to load deeplinked intent:", e)
				setIntentError(`Failed to load intent "${location.intent}": ${(e as Error).message}`)
				setLoadingDetail(false)
			})
		}
	}, [provider, location?.intent, indexIntentDetail])

	// Restore search index from IndexedDB cache on mount
	useEffect(() => {
		let cancelled = false
		async function restoreCache() {
			try {
				const fresh = await isCacheFresh(repoKey)
				if (!fresh) return
				const cached = await getCachedDocuments(repoKey)
				if (cancelled || cached.length === 0) return
				for (const doc of cached) {
					addToIndex({
						id: doc.id,
						type: doc.type,
						title: doc.title,
						slug: doc.slug,
						stage: doc.stage,
						studio: doc.studio,
						status: doc.status,
						content: doc.content,
						path: doc.path,
					})
				}
			} catch {
				// IndexedDB may not be available (SSR, private browsing, etc.)
			}
		}
		restoreCache()
		return () => {
			cancelled = true
		}
	}, [repoKey, addToIndex])

	// Progressive loading — show each intent as it loads
	useEffect(() => {
		async function load() {
			setIntents([])
			setLoadingMore(true)

			try {
				await provider.listIntents((intent) => {
					setIntents((prev) => [...prev, intent])
					setLoading(false)
					// Index this intent for search (now includes body content)
					addToIndex({
						id: `intent:${intent.slug}`,
						type: "intent",
						title: intent.title,
						slug: intent.slug,
						studio: intent.studio,
						status: intent.status,
						content: `${intent.title} ${intent.content || ""} ${intent.studio} ${intent.activeStage || ""} ${intent.mode}`,
					})
				})
			} catch (e) {
				console.error("[haiku-browse] Failed to list intents:", e)
				setIntentError(`Failed to load intents: ${(e as Error).message}`)
			}

			setLoadingMore(false)
			setLoading(false)
		}
		load()
	}, [provider, addToIndex])

	// Background deep indexing — fetch all intent details for unit search
	useEffect(() => {
		if (loadingMore || loading || intents.length === 0) return

		// Abort any previous deep index run
		deepIndexAbort.current?.abort()
		const controller = new AbortController()
		deepIndexAbort.current = controller

		async function deepIndex() {
			// Check if deep index is already cached and fresh
			try {
				const [fresh, deepDone] = await Promise.all([
					isCacheFresh(repoKey),
					isDeepIndexComplete(repoKey),
				])
				if (fresh && deepDone) return
			} catch {
				// IndexedDB unavailable — still do in-memory indexing
			}

			setDeepIndexProgress({ current: 0, total: intents.length })

			for (let i = 0; i < intents.length; i++) {
				if (controller.signal.aborted) return
				const intent = intents[i]

				// Skip if we already have unit-level data for this intent
				const hasUnits = Array.from(indexedIds.current).some((id) =>
					id.startsWith(`unit:${intent.slug}:`),
				)
				if (hasUnits) {
					setDeepIndexProgress({ current: i + 1, total: intents.length })
					continue
				}

				try {
					// Yield to the main thread between fetches
					await new Promise<void>((resolve) => {
						if (typeof requestIdleCallback !== "undefined") {
							requestIdleCallback(() => resolve())
						} else {
							setTimeout(resolve, 0)
						}
					})
					if (controller.signal.aborted) return

					const detail = await provider.getIntent(intent.slug)
					if (controller.signal.aborted) return
					if (!detail) continue

					indexIntentDetail(detail)
				} catch {
					// Individual intent fetch failure — continue with others
				}
				setDeepIndexProgress({ current: i + 1, total: intents.length })
			}

			setDeepIndexProgress(null)

			// Flush accumulated documents to IndexedDB
			try {
				const buffer = cacheWriteBuffer.current
				cacheWriteBuffer.current = []
				if (buffer.length > 0) {
					await cacheDocuments(buffer)
				}
				await markCacheIndexed(repoKey, true)
			} catch {
				// IndexedDB write failure — non-critical
			}
		}

		deepIndex()

		return () => {
			controller.abort()
			setDeepIndexProgress(null)
		}
	}, [intents, loading, loadingMore, provider, repoKey, indexIntentDetail])

	// Periodic flush of cache write buffer (for documents added outside deep index)
	useEffect(() => {
		const interval = setInterval(async () => {
			const buffer = cacheWriteBuffer.current
			if (buffer.length === 0) return
			cacheWriteBuffer.current = []
			try {
				await cacheDocuments(buffer)
				await markCacheIndexed(repoKey, false)
			} catch {
				// Non-critical
			}
		}, 5000)
		return () => clearInterval(interval)
	}, [repoKey])

	// Load portfolio-level knowledge files
	useEffect(() => {
		provider
			.listFiles(".haiku/knowledge")
			.then((files) => {
				setKnowledgeFiles(files.filter((f) => !f.startsWith(".")))
			})
			.catch(() => {
				// Directory may not exist — that's fine
			})
	}, [provider])

	// Smart polling — check for branch changes every 30s using ETags
	useEffect(() => {
		if (!provider?.checkForBranchChanges) return

		const POLL_INTERVAL = 30_000 // 30 seconds
		let intervalId: ReturnType<typeof setInterval> | null = null

		const poll = async () => {
			// Skip polling when tab is hidden
			if (typeof document !== "undefined" && document.visibilityState === "hidden") return

			try {
				const changed = await provider.checkForBranchChanges!()
				setLastPolled(new Date())
				if (changed) {
					// Clear caches and re-fetch
					provider.clearBranchCache?.()
					const refreshed = await provider.listIntents((intent) => {
						// Index refreshed intents
						addToIndex({
							id: `intent:${intent.slug}`,
							type: "intent",
							title: intent.title,
							slug: intent.slug,
							studio: intent.studio,
							status: intent.status,
							content: `${intent.title} ${intent.content || ""} ${intent.studio} ${intent.activeStage || ""} ${intent.mode}`,
						})
					})
					setIntents(refreshed)
				}
			} catch {
				// Polling failure is non-fatal — silently continue
			}
		}

		// Also pause/resume polling on visibility change
		const handleVisibility = () => {
			if (document.visibilityState === "visible") {
				// Immediately poll when tab becomes visible again
				poll()
			}
		}

		intervalId = setInterval(poll, POLL_INTERVAL)
		document.addEventListener("visibilitychange", handleVisibility)

		return () => {
			if (intervalId) clearInterval(intervalId)
			document.removeEventListener("visibilitychange", handleVisibility)
		}
	}, [provider, addToIndex])

	// Listen for browser back/forward (path-based navigation only)
	useEffect(() => {
		if (!hasPathNav) return
		const onPopState = () => {
			// Re-parse the current URL to determine state
			const segments = window.location.pathname
				.replace(/^\/browse\//, "")
				.replace(/\/$/, "")
				.split("/")
			const hasIntent = segments.includes("intent")
			const hasBoard = segments.includes("board")

			if (hasIntent) {
				const intentIdx = segments.indexOf("intent")
				const slug = segments[intentIdx + 1]
				if (slug) {
					provider.getIntent(slug).then((detail) => setSelectedIntent(detail))
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

	const [intentError, setIntentError] = useState<string | null>(null)

	const handleSelectIntent = useCallback(
		async (slug: string) => {
			setLoadingDetail(true)
			setIntentError(null)
			try {
				const detail = await provider.getIntent(slug)
				if (!detail) {
					setIntentError(
						`Could not load intent "${slug}". It may have been deleted or the API returned an error.`,
					)
					setLoadingDetail(false)
					return
				}
				setSelectedIntent(detail)
				// Re-index the intent detail (surgical update — removes stale, adds fresh)
				indexIntentDetail(detail)
				// Also invalidate the IndexedDB cache for this intent so stale data doesn't persist
				clearIntentCache(repoKey, slug).catch(() => {
					/* non-critical */
				})
				if (hasPathNav) {
					router.push(browseUrl({ intent: slug }))
				}
			} catch (e) {
				setIntentError(
					`Error loading intent "${slug}": ${(e as Error).message}`,
				)
			}
			setLoadingDetail(false)
		},
		[provider, router, browseUrl, hasPathNav, indexIntentDetail, repoKey],
	)

	const handleSearchSelect = useCallback(
		(selection: SearchSelection) => {
			setSearchQuery("")
			if (selection.type === "intent") {
				handleSelectIntent(selection.slug)
			} else if (selection.type === "unit") {
				// Navigate to intent, which will show the unit
				handleSelectIntent(selection.slug)
			} else if (selection.type === "knowledge") {
				handleSelectIntent(selection.slug)
			} else if (selection.type === "asset") {
				handleSelectIntent(selection.slug)
			}
		},
		[handleSelectIntent],
	)

	const handleBackFromIntent = useCallback(() => {
		setSelectedIntent(null)
		if (hasPathNav) {
			window.history.back()
		}
	}, [hasPathNav])

	const handleViewModeChange = useCallback(
		(mode: "list" | "board") => {
			setViewMode(mode)
			if (hasPathNav) {
				const url =
					mode === "board" ? browseUrl({ view: "board" }) : browseUrl()
				window.history.replaceState(null, "", url)
			}
		},
		[browseUrl, hasPathNav],
	)

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
		<div
			className={`mx-auto px-4 py-8 lg:py-12 ${viewMode === "board" ? "max-w-full" : "max-w-5xl"}`}
		>
			{/* Header */}
			<div className="mb-8">
				<div className="flex items-center justify-between">
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
							Source:{" "}
							<strong className="text-stone-700 dark:text-stone-300">
								{provider.name}
							</strong>
						</div>
						<div>
							<strong className="text-stone-700 dark:text-stone-300">
								{intents.length}
							</strong>{" "}
							intent{intents.length !== 1 ? "s" : ""}
						</div>
						{lastPolled && (
							<div className="text-xs text-stone-400">
								Updated {formatRelativeTime(lastPolled)}
							</div>
						)}
					</div>
				</div>
				{/* Search bar */}
				{!loading && intents.length > 0 && (
					<div className="mt-4">
						<SearchBar
							index={searchIndexVersion >= 0 ? searchIndex : null}
							onSelect={handleSearchSelect}
							query={searchQuery}
							onQueryChange={setSearchQuery}
							placeholder={
								deepIndexProgress
									? `Indexing... ${deepIndexProgress.current}/${deepIndexProgress.total}`
									: undefined
							}
						/>
					</div>
				)}
			</div>

			{/* Portfolio Knowledge */}
			{knowledgeFiles.length > 0 && (
				<PortfolioKnowledge files={knowledgeFiles} provider={provider} />
			)}

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

			{intentError && (
				<div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
					{intentError}
				</div>
			)}

			{loading && intents.length === 0 ? (
				<div className="space-y-3">
					{[1, 2, 3, 4].map((i) => (
						<div
							key={i}
							className="animate-pulse rounded-xl border border-stone-200 px-6 py-4 dark:border-stone-700"
						>
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
					<p className="text-lg font-medium text-stone-600 dark:text-stone-400">
						No intents found
					</p>
					<p className="mt-2 text-sm text-stone-500">
						This workspace has no <code>.haiku/intents/</code> directory, or
						it's empty.
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
					{[...intents]
						.sort((a, b) => {
							// Active first, then completed, then archived
							const statusOrder: Record<string, number> = {
								active: 0,
								blocked: 1,
								completed: 2,
								archived: 3,
							}
							const sa = statusOrder[a.status] ?? 1
							const sb = statusOrder[b.status] ?? 1
							if (sa !== sb) return sa - sb
							// Within same status, sort by start date descending (newest first)
							const da = a.startedAt ? new Date(a.startedAt).getTime() : 0
							const db = b.startedAt ? new Date(b.startedAt).getTime() : 0
							return db - da
						})
						.map((intent) => (
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
											<span
												className={`rounded px-2 py-0.5 text-xs font-medium ${statusColors[intent.status] || statusColors.active}`}
											>
												{intent.status}
											</span>
											{intent.prUrl && intent.prStatus && (
												<a
													href={intent.prUrl}
													target="_blank"
													rel="noopener noreferrer"
													onClick={(e) => e.stopPropagation()}
													className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium hover:opacity-80 ${prStatusColors[intent.prStatus] || prStatusColors.open}`}
												>
													<svg className="h-3 w-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
														<path d="M5 5.5v5m6-5v5M5 3a2 2 0 100-4 2 2 0 000 4zm6 0a2 2 0 100-4 2 2 0 000 4zM5 14.5a2 2 0 100-4 2 2 0 000 4z" />
													</svg>
													{provider.name === "GitLab" ? "MR" : "PR"} {intent.prNumber ? `${provider.name === "GitLab" ? "!" : "#"}${intent.prNumber}` : ""} {intent.prStatus}
												</a>
											)}
										</div>
										<div className="mt-1 flex items-center gap-4 text-sm text-stone-500 dark:text-stone-400">
											<span>
												Studio:{" "}
												<strong className="text-stone-700 dark:text-stone-300">
													{titleCase(intent.studio)}
												</strong>
											</span>
											{intent.activeStage && (
												<span>
													Stage:{" "}
													<strong className="text-stone-700 dark:text-stone-300">
														{titleCase(intent.activeStage)}
													</strong>
												</span>
											)}
											<span>
												Mode:{" "}
												<strong className="text-stone-700 dark:text-stone-300">
													{intent.mode}
												</strong>
											</span>
											{intent.branch && (
												<span className="font-mono text-xs text-stone-400 dark:text-stone-500" title={intent.branch}>
													{intent.branch}
												</span>
											)}
											{intent.startedAt && (
												<span>
													{formatDate(intent.startedAt)}
													{intent.completedAt
														? ` — ${formatDate(intent.completedAt)}`
														: ""}
												</span>
											)}
											{intent.startedAt && (
												<span className="font-mono text-xs">
													{intent.completedAt
														? formatDuration(
																intent.startedAt,
																intent.completedAt,
															)
														: `${formatDuration(intent.startedAt, null)} elapsed`}
												</span>
											)}
										</div>
									</div>
									{intent.stagesTotal > 0 && intent.stagesComplete > 0 && (
										<div className="text-right">
											<div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
												{intent.stagesComplete}/{intent.stagesTotal}
											</div>
											<div className="text-xs text-stone-400">stages</div>
										</div>
									)}
								</div>
								{intent.stagesTotal > 0 && intent.stagesComplete > 0 && (
									<div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
										<div
											className="h-full rounded-full bg-teal-500 transition-all"
											style={{
												width: `${(intent.stagesComplete / intent.stagesTotal) * 100}%`,
											}}
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

function PortfolioKnowledge({
	files,
	provider,
}: { files: string[]; provider: BrowseProvider }) {
	const [expanded, setExpanded] = useState(false)

	return (
		<section className="mb-6">
			<button
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-2 rounded-lg border border-stone-200 px-4 py-3 text-left transition hover:border-teal-300 dark:border-stone-700 dark:hover:border-teal-700"
			>
				<svg
					className={`h-4 w-4 flex-shrink-0 text-stone-400 transition ${expanded ? "rotate-180" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M19 9l-7 7-7-7"
					/>
				</svg>
				<h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400">
					Knowledge
				</h2>
				<span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
					{files.length} file{files.length !== 1 ? "s" : ""}
				</span>
			</button>
			{expanded && (
				<div className="mt-2 space-y-2">
					{files.map((file) => (
						<PortfolioKnowledgeFile
							key={file}
							file={file}
							provider={provider}
						/>
					))}
				</div>
			)}
		</section>
	)
}

function PortfolioKnowledgeFile({
	file,
	provider,
}: { file: string; provider: BrowseProvider }) {
	const [content, setContent] = useState<string | null>(null)
	const [expanded, setExpanded] = useState(false)

	const handleExpand = async () => {
		if (content === null) {
			const raw = await provider.readFile(`.haiku/knowledge/${file}`)
			setContent(raw || "(empty)")
		}
		setExpanded(!expanded)
	}

	const isMarkdown = file.endsWith(".md")

	return (
		<div className="rounded-lg border border-stone-200 dark:border-stone-700">
			<button
				onClick={handleExpand}
				className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-800"
			>
				<span className="font-mono text-stone-600 dark:text-stone-400">
					{file}
				</span>
				<svg
					className={`h-4 w-4 text-stone-400 transition ${expanded ? "rotate-180" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</button>
			{expanded && content && (
				<div className="border-t border-stone-100 px-4 py-4 dark:border-stone-800">
					{isMarkdown ? (
						<div className="prose prose-sm prose-stone dark:prose-invert max-w-none">
							<ReactMarkdown remarkPlugins={[remarkGfm]}>
								{content}
							</ReactMarkdown>
						</div>
					) : (
						<pre className="overflow-x-auto text-xs text-stone-600 dark:text-stone-400">
							{content}
						</pre>
					)}
				</div>
			)}
		</div>
	)
}
