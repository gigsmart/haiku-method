"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { BrowseProvider, HaikuIntent, HaikuIntentDetail } from "@/lib/browse/types"
import { formatDate, formatDuration } from "@/lib/browse/types"
import { IntentDetailView } from "./IntentDetailView"
import { PortfolioKanban } from "./KanbanView"

interface Props {
	provider: BrowseProvider
	onBack: () => void
	repoLabel?: string
}

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

function setHash(params: Record<string, string>) {
	const parts = Object.entries(params)
		.filter(([, v]) => v)
		.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
	const hash = parts.length > 0 ? `#${parts.join("&")}` : " "
	window.history.replaceState(null, "", hash.trim() || window.location.pathname + window.location.search)
}

const statusColors: Record<string, string> = {
	active: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
	completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
	archived: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
	blocked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

export function PortfolioView({ provider, onBack, repoLabel }: Props) {
	const [intents, setIntents] = useState<HaikuIntent[]>([])
	const [selectedIntent, setSelectedIntent] = useState<HaikuIntentDetail | null>(null)
	const [loading, setLoading] = useState(true)
	const [loadingDetail, setLoadingDetail] = useState(false)
	const [viewMode, setViewMode] = useState<"list" | "board">("list")
	const initialHashHandled = useRef(false)

	// Read initial hash state once intents are loaded
	useEffect(() => {
		async function load() {
			const list = await provider.listIntents()
			setIntents(list)
			setLoading(false)

			// Restore state from hash after intents load
			if (!initialHashHandled.current) {
				initialHashHandled.current = true
				const params = parseHash()
				if (params.view === "board" || params.view === "list") {
					setViewMode(params.view)
				}
				if (params.intent) {
					setLoadingDetail(true)
					const detail = await provider.getIntent(params.intent)
					setSelectedIntent(detail)
					setLoadingDetail(false)
				}
			}
		}
		load()
	}, [provider])

	// Sync view mode to hash (only when no intent is selected)
	useEffect(() => {
		if (!selectedIntent && !loading) {
			setHash({ view: viewMode !== "list" ? viewMode : "" })
		}
	}, [viewMode, selectedIntent, loading])

	const handleSelectIntent = useCallback(
		async (slug: string) => {
			setLoadingDetail(true)
			const detail = await provider.getIntent(slug)
			setSelectedIntent(detail)
			setLoadingDetail(false)
			setHash({ intent: slug })
		},
		[provider],
	)

	const handleBackFromIntent = useCallback(() => {
		setSelectedIntent(null)
		setHash({ view: viewMode !== "list" ? viewMode : "" })
	}, [viewMode])

	if (selectedIntent) {
		return (
			<IntentDetailView
				intent={selectedIntent}
				provider={provider}
				onBack={handleBackFromIntent}
			/>
		)
	}

	return (
		<div className="mx-auto max-w-5xl px-4 py-8 lg:py-12">
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
						onClick={() => setViewMode("list")}
						className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${viewMode === "list" ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-500 hover:text-stone-700"}`}
					>
						List
					</button>
					<button
						onClick={() => setViewMode("board")}
						className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${viewMode === "board" ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-500 hover:text-stone-700"}`}
					>
						Board
					</button>
				</div>
			)}

			{loading ? (
				<div className="py-20 text-center text-stone-500">Loading intents...</div>
			) : intents.length === 0 ? (
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
					{intents.map((intent) => (
						<button
							key={intent.slug}
							onClick={() => handleSelectIntent(intent.slug)}
							disabled={loadingDetail}
							className="w-full rounded-xl border border-stone-200 px-6 py-4 text-left transition hover:border-teal-300 hover:shadow-sm dark:border-stone-700 dark:hover:border-teal-700"
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
						</button>
					))}
				</div>
			)}
		</div>
	)
}
