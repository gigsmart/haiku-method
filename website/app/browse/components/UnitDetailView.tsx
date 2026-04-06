"use client"

import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { BrowseProvider, HaikuUnit } from "@/lib/browse/types"
import { formatDate, formatDuration } from "@/lib/browse/types"
import { resolveLinks } from "@/lib/browse/resolve-links"

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
	onBack: () => void
}

export function UnitDetailView({ unit, stageName, provider, onBack }: Props) {
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
