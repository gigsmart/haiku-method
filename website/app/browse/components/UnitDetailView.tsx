"use client"

import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { BrowseProvider, HaikuAsset, HaikuUnit } from "@/lib/browse/types"
import { formatDate, formatDuration } from "@/lib/browse/types"
import { resolveLinks } from "@/lib/browse/resolve-links"
import { AuthenticatedMedia } from "./AuthenticatedMedia"
import { AssetLightbox } from "./AssetLightbox"

function titleCase(s: string): string {
	return s
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ")
}

const FIELD_LABELS: Record<string, string> = {
	ticket: "Ticket",
	epic: "Epic",
	design_ref: "Design",
	spec_url: "Spec",
	branch: "Branch",
}

interface Props {
	unit: HaikuUnit
	stageName: string
	intentSlug: string
	provider: BrowseProvider
	assets?: HaikuAsset[]
	host?: string
	onBack: () => void
}

export function UnitDetailView({ unit, stageName, intentSlug, provider, assets = [], host, onBack }: Props) {
	const checkedCount = unit.criteria.filter((c) => c.checked).length
	const totalCriteria = unit.criteria.length
	const progress = totalCriteria > 0 ? (checkedCount / totalCriteria) * 100 : 0
	const [settings, setSettings] = useState<Record<string, unknown> | null>(null)

	useEffect(() => {
		provider.getSettings().then(setSettings)
	}, [provider])

	const providerLinks = resolveLinks(unit.raw, settings)

	return (
		<div className="mx-auto max-w-4xl px-4 py-8 lg:py-12">
			{/* Breadcrumb */}
			<button
				onClick={onBack}
				className="mb-4 text-sm text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
			>
				&larr; Back to {titleCase(stageName)}
			</button>

			{/* Header */}
			<header className="mb-8">
				<div className="flex items-center gap-3">
					<h1 className="text-2xl font-bold tracking-tight">{titleCase(unit.name)}</h1>
					<StatusBadge status={unit.status} />
					{unit.type && (
						<span className="rounded bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-400">
							{unit.type}
						</span>
					)}
				</div>
				<p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
					Stage: {titleCase(stageName)}
				</p>
			</header>

			{/* Quick Stats */}
			<div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
				<div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
					<div className="text-xs font-medium uppercase tracking-wider text-stone-400">Criteria</div>
					<div className="mt-1 text-2xl font-bold">
						{checkedCount}
						<span className="text-stone-400">/{totalCriteria}</span>
					</div>
					{totalCriteria > 0 && (
						<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
							<div
								className={`h-full rounded-full transition-all ${progress === 100 ? "bg-green-500" : "bg-teal-500"}`}
								style={{ width: `${progress}%` }}
							/>
						</div>
					)}
				</div>
				<div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
					<div className="text-xs font-medium uppercase tracking-wider text-stone-400">Bolt</div>
					<div className="mt-1 text-2xl font-bold">{unit.bolt || 0}</div>
				</div>
				<div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
					<div className="text-xs font-medium uppercase tracking-wider text-stone-400">Hat</div>
					<div className="mt-1 text-lg font-semibold">{unit.hat ? titleCase(unit.hat) : "—"}</div>
				</div>
				<div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
					<div className="text-xs font-medium uppercase tracking-wider text-stone-400">Status</div>
					<div className="mt-1 text-lg font-semibold">{titleCase(unit.status)}</div>
				</div>
				{unit.startedAt && (
					<div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
						<div className="text-xs font-medium uppercase tracking-wider text-stone-400">
							{unit.completedAt ? "Duration" : "Elapsed"}
						</div>
						<div className="mt-1 text-lg font-semibold">{formatDuration(unit.startedAt, unit.completedAt)}</div>
						<div className="mt-0.5 text-xs text-stone-400">{formatDate(unit.startedAt)}{unit.completedAt ? ` — ${formatDate(unit.completedAt)}` : ""}</div>
					</div>
				)}
			</div>

			{/* Completion Criteria */}
			{unit.criteria.length > 0 && (
				<section className="mb-8">
					<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
						Completion Criteria
					</h2>
					<div className="rounded-xl border border-stone-200 dark:border-stone-700">
						{unit.criteria.map((criterion, i) => (
							<div
								key={i}
								className={`flex items-start gap-3 px-5 py-3 ${
									i < unit.criteria.length - 1 ? "border-b border-stone-100 dark:border-stone-800" : ""
								}`}
							>
								<div className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${
									criterion.checked
										? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
										: "bg-stone-100 text-stone-400 dark:bg-stone-800"
								}`}>
									{criterion.checked ? (
										<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
										</svg>
									) : (
										<span className="h-3 w-3" />
									)}
								</div>
								<span className={`text-sm ${
									criterion.checked
										? "text-stone-500 line-through dark:text-stone-500"
										: "text-stone-800 dark:text-stone-200"
								}`}>
									{criterion.text}
								</span>
							</div>
						))}
					</div>
				</section>
			)}

			{/* Dependencies */}
			{unit.dependsOn.length > 0 && (
				<section className="mb-8">
					<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
						Dependencies
					</h2>
					<div className="flex flex-wrap gap-2">
						{unit.dependsOn.map((dep) => (
							<span
								key={dep}
								className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-600 dark:border-stone-700 dark:text-stone-400"
							>
								{dep}
							</span>
						))}
					</div>
				</section>
			)}

			{/* Referenced Artifacts (from unit refs) */}
			{unit.refs.length > 0 && (
				<RefsSection
					refs={unit.refs}
					intentSlug={intentSlug}
					provider={provider}
					assets={assets}
					host={host}
				/>
			)}

			{/* Provider Links / References */}
			{providerLinks.length > 0 && (
				<section className="mb-8">
					<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
						References
					</h2>
					<div className="flex flex-wrap gap-3">
						{providerLinks.map((link) => {
							const label = FIELD_LABELS[link.field] || titleCase(link.field)
							if (link.url) {
								return (
									<a
										key={link.field}
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
								<span
									key={link.field}
									className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 dark:border-stone-700 dark:text-stone-400"
								>
									<span className="font-medium text-stone-500 dark:text-stone-400">{label}:</span>
									{link.value}
								</span>
							)
						})}
					</div>
				</section>
			)}

			{/* Unit Content */}
			{unit.content && (
				<section>
					<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
						Specification
					</h2>
					<div className="rounded-xl border border-stone-200 p-6 dark:border-stone-700">
						<div className="prose prose-sm prose-stone dark:prose-invert max-w-none">
							<ReactMarkdown remarkPlugins={[remarkGfm]}>{unit.content}</ReactMarkdown>
						</div>
					</div>
				</section>
			)}

			{/* Frontmatter Debug (collapsed) */}
			{Object.keys(unit.raw).length > 0 && (
				<details className="mt-8">
					<summary className="cursor-pointer text-xs text-stone-400 hover:text-stone-600">
						Raw frontmatter
					</summary>
					<pre className="mt-2 overflow-x-auto rounded-lg bg-stone-50 p-4 text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400">
						{JSON.stringify(unit.raw, null, 2)}
					</pre>
				</details>
			)}
		</div>
	)
}

const TEXT_EXTENSIONS = new Set(["md", "json", "yaml", "yml", "txt", "toml", "csv", "xml", "html"])

function isTextFile(path: string): boolean {
	const ext = path.split(".").pop()?.toLowerCase() || ""
	return TEXT_EXTENSIONS.has(ext)
}

function RefsSection({ refs, intentSlug, provider, assets, host }: {
	refs: string[]
	intentSlug: string
	provider: BrowseProvider
	assets: HaikuAsset[]
	host?: string
}) {
	// Build a lookup from relative path (relative to intent dir) to asset
	const assetByRelPath = new Map<string, HaikuAsset>()
	const intentPrefix = `.haiku/intents/${intentSlug}/`
	for (const asset of assets) {
		if (asset.path.startsWith(intentPrefix)) {
			assetByRelPath.set(asset.path.slice(intentPrefix.length), asset)
		}
	}

	return (
		<section className="mb-8">
			<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
				Referenced Artifacts
			</h2>
			<div className="space-y-2">
				{refs.map((ref) => {
					const matchedAsset = assetByRelPath.get(ref)
					if (matchedAsset && host) {
						return (
							<AssetRefItem key={ref} ref_={ref} asset={matchedAsset} host={host} />
						)
					}
					if (isTextFile(ref)) {
						return (
							<TextRefItem key={ref} ref_={ref} intentSlug={intentSlug} provider={provider} />
						)
					}
					return (
						<GenericRefItem key={ref} ref_={ref} />
					)
				})}
			</div>
		</section>
	)
}

function AssetRefItem({ ref_, asset, host }: { ref_: string; asset: HaikuAsset; host: string }) {
	const [showLightbox, setShowLightbox] = useState(false)
	const fileName = ref_.split("/").pop() || ref_
	const dirPath = ref_.includes("/") ? ref_.substring(0, ref_.lastIndexOf("/")) : ""

	return (
		<>
			<button
				onClick={() => setShowLightbox(true)}
				className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-stone-200 p-3 text-left transition hover:border-teal-300 hover:shadow-sm dark:border-stone-700 dark:hover:border-teal-700"
			>
				<div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded bg-stone-100 dark:bg-stone-800">
					<AuthenticatedMedia
						rawUrl={asset.rawUrl}
						name={asset.name}
						host={host}
						className="rounded"
					/>
				</div>
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-stone-700 dark:text-stone-300">{fileName}</p>
					{dirPath && <p className="truncate text-xs text-stone-400">{dirPath}</p>}
				</div>
			</button>
			{showLightbox && (
				<AssetLightbox
					asset={asset}
					host={host}
					onClose={() => setShowLightbox(false)}
				/>
			)}
		</>
	)
}

function TextRefItem({ ref_, intentSlug, provider }: { ref_: string; intentSlug: string; provider: BrowseProvider }) {
	const [content, setContent] = useState<string | null>(null)
	const [showModal, setShowModal] = useState(false)

	const fileName = ref_.split("/").pop() || ref_
	const dirPath = ref_.includes("/") ? ref_.substring(0, ref_.lastIndexOf("/")) : ""
	const isMarkdown = ref_.endsWith(".md")

	const handleOpen = async () => {
		if (content === null) {
			const raw = await provider.readFile(`.haiku/intents/${intentSlug}/${ref_}`)
			setContent(raw || "(empty)")
		}
		setShowModal(true)
	}

	return (
		<>
			<button
				onClick={handleOpen}
				className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-stone-200 p-3 text-left transition hover:border-teal-300 hover:shadow-sm dark:border-stone-700 dark:hover:border-teal-700"
			>
				<div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded bg-stone-100 text-2xl dark:bg-stone-800">
					{isMarkdown ? "📄" : "📋"}
				</div>
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-stone-700 dark:text-stone-300">{fileName}</p>
					{dirPath && <p className="truncate text-xs text-stone-400">{dirPath}</p>}
				</div>
			</button>
			{showModal && content && (
				<DocModal
					fileName={fileName}
					filePath={ref_}
					content={content}
					isMarkdown={isMarkdown}
					onClose={() => setShowModal(false)}
				/>
			)}
		</>
	)
}

function DocModal({ fileName, filePath, content, isMarkdown, onClose }: {
	fileName: string; filePath: string; content: string; isMarkdown: boolean; onClose: () => void
}) {
	useEffect(() => {
		const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
		document.addEventListener("keydown", handleEsc)
		return () => document.removeEventListener("keydown", handleEsc)
	}, [onClose])

	// Strip frontmatter for display
	let displayContent = content
	let frontmatter = ""
	if (isMarkdown && content.startsWith("---")) {
		const endIdx = content.indexOf("---", 3)
		if (endIdx !== -1) {
			frontmatter = content.slice(3, endIdx).trim()
			displayContent = content.slice(endIdx + 3).trim()
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
			<div
				className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between border-b border-stone-200 px-5 py-3 dark:border-stone-700">
					<div>
						<h3 className="font-mono text-sm font-semibold text-stone-900 dark:text-stone-100">{fileName}</h3>
						<p className="font-mono text-xs text-stone-400">{filePath}</p>
					</div>
					<button onClick={onClose} className="rounded p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200">
						&#10005;
					</button>
				</div>
				{frontmatter && (
					<div className="border-b border-stone-100 bg-stone-50 px-5 py-2 dark:border-stone-800 dark:bg-stone-950/50">
						<pre className="font-mono text-[11px] text-stone-500">{frontmatter}</pre>
					</div>
				)}
				<div className="flex-1 overflow-y-auto px-5 py-4">
					{isMarkdown ? (
						<div className="prose prose-sm prose-stone dark:prose-invert max-w-none">
							<ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
						</div>
					) : (
						<pre className="overflow-x-auto text-xs text-stone-600 dark:text-stone-400">{content}</pre>
					)}
				</div>
			</div>
		</div>
	)
}

function GenericRefItem({ ref_ }: { ref_: string }) {
	const fileName = ref_.split("/").pop() || ref_
	const dirPath = ref_.includes("/") ? ref_.substring(0, ref_.lastIndexOf("/")) : ""

	return (
		<div className="flex items-center gap-3 rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-700">
			<svg className="h-5 w-5 flex-shrink-0 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
			</svg>
			<div className="min-w-0">
				<p className="truncate text-sm font-mono text-stone-600 dark:text-stone-400">{fileName}</p>
				{dirPath && (
					<p className="truncate text-xs text-stone-400">{dirPath}</p>
				)}
			</div>
		</div>
	)
}

function StatusBadge({ status }: { status: string }) {
	const colors: Record<string, string> = {
		completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
		active: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
		pending: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
		blocked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
	}
	return (
		<span className={`rounded px-2 py-0.5 text-xs font-medium ${colors[status] || colors.pending}`}>
			{status}
		</span>
	)
}
