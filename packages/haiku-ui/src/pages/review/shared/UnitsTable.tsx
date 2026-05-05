import { StatusBadge } from "@haiku/shared"
import { forwardRef, useImperativeHandle, useRef, useState } from "react"
import { withAuthQuery } from "../../../api/auth"
import {
	type InlineCommentEntry,
	InlineComments,
} from "../../../organisms/InlineComments"
import type { ParsedUnit } from "../../../parsed"
import type { MockupInfo, UnitOutputPreview } from "../../../types"
import { markdownToSimpleHtml } from "./section-helpers"

/** Imperative handle the parent uses to expand-and-scroll-to a unit
 *  row. Wired up by IntentReview so a click on a "Declared by" badge
 *  in OutputArtifactsTab opens the unit's expanded view directly,
 *  rather than via DOM-querySelector + scrollIntoView. */
export interface UnitsTableHandle {
	expandAndScrollTo: (unitSlug: string) => void
}

/**
 * UnitsTable — tabular stage-grouped unit listing for the intent
 * review's "Units" tab. Each row expands inline to render the full
 * unit markdown body through the inline-comments surface. New /
 * changed units (versus the previous-review snapshot) are flagged.
 *
 * Extracted from the legacy `components/ReviewPage.tsx` monolith as
 * part of the FB-22 split so `IntentReview` stays under the 400 LOC
 * module budget.
 */
export const UnitsTable = forwardRef<
	UnitsTableHandle,
	{
		units: ParsedUnit[]
		unitMockups: Record<string, MockupInfo[]>
		/** Per-unit output preview entries keyed by unit slug, built
		 *  server-side so the popover content arrives with the session
		 *  payload — no per-row fetch. */
		unitOutputs?: Record<string, UnitOutputPreview[]>
		onInlineCommentsChange?: (comments: InlineCommentEntry[]) => void
		previousUnitContents?: Record<string, string>
	}
>(function UnitsTable(
	{
		units,
		unitMockups: _unitMockups,
		unitOutputs,
		onInlineCommentsChange,
		previousUnitContents,
	},
	ref,
) {
	const [expandedUnit, setExpandedUnit] = useState<string | null>(null)
	// One ref per unit row keyed by slug — used by the imperative
	// `expandAndScrollTo` handle so clicks on a "Declared by" badge
	// can scroll directly to the row React-side without DOM lookups.
	const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

	useImperativeHandle(ref, () => ({
		expandAndScrollTo(unitSlug: string) {
			setExpandedUnit(unitSlug)
			// Defer the scroll until after the expand renders so the
			// row's full content is laid out — otherwise scrollIntoView
			// targets the un-expanded height and ends up mis-centered.
			requestAnimationFrame(() => {
				const el = rowRefs.current[unitSlug]
				if (el) {
					el.scrollIntoView({ behavior: "smooth", block: "center" })
				}
			})
		},
	}))

	if (units.length === 0) {
		return (
			<p className="text-stone-500 dark:text-stone-400 italic">
				No units found.
			</p>
		)
	}

	// Group by stage, preserving order
	const stageOrder: string[] = []
	const byStage = new Map<string, ParsedUnit[]>()
	for (const u of units) {
		const stage = u.frontmatter.stage || "unknown"
		if (!byStage.has(stage)) {
			byStage.set(stage, [])
			stageOrder.push(stage)
		}
		byStage.get(stage)?.push(u)
	}

	return (
		<div className="space-y-6">
			{stageOrder.map((stage) => {
				const stageUnits = byStage.get(stage) || []
				const completed = stageUnits.filter(
					(u) => u.frontmatter.status === "completed",
				).length
				return (
					<div key={stage}>
						<div className="flex items-center gap-3 mb-3">
							<h3 className="text-sm font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
								{stage.charAt(0).toUpperCase() + stage.slice(1)}
							</h3>
							<span className="text-xs text-stone-600 dark:text-stone-300">
								{completed}/{stageUnits.length} complete
							</span>
						</div>
						<div className="overflow-x-auto">
							<table className="w-full text-left">
								<thead>
									<tr className="border-b-2 border-stone-200 dark:border-stone-700">
										<th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
											#
										</th>
										<th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
											Name
										</th>
										<th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
											Type
										</th>
										<th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
											Status
										</th>
										<th className="py-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
											Dependencies
										</th>
									</tr>
								</thead>
								<tbody>
									{stageUnits.map((u) => {
										const deps = u.frontmatter.depends_on?.length
											? u.frontmatter.depends_on.join(", ")
											: "—"
										const isExpanded = expandedUnit === u.slug
										const prevRaw = previousUnitContents?.[u.slug]
										const isNew =
											previousUnitContents !== undefined &&
											prevRaw === undefined
										const isChanged =
											prevRaw !== undefined &&
											u.rawContent !== undefined &&
											prevRaw !== u.rawContent
										// Build unit content from sections for inline commenting
										let unitContent = ""
										for (const section of u.sections) {
											if (section.heading === "_preamble") {
												unitContent += `${section.content}\n\n`
											} else {
												unitContent += `## ${section.heading}\n\n${section.content}\n\n`
											}
										}
										return (
											<tr
												key={u.slug}
												ref={(el) => {
													rowRefs.current[u.slug] = el
												}}
												data-unit-slug={u.slug}
												className="border-b border-stone-100 dark:border-stone-800"
											>
												<td
													className="py-3 pr-3 font-mono text-sm text-stone-500 dark:text-stone-400"
													colSpan={isExpanded ? 6 : undefined}
												>
													{isExpanded ? (
														<div>
															<button
																type="button"
																onClick={() => setExpandedUnit(null)}
																className="text-xs text-teal-600 dark:text-teal-400 hover:underline mb-3"
															>
																Collapse
															</button>
															<div className="font-sans">
																<h4 className="text-base font-semibold text-stone-800 dark:text-stone-200 mb-2">
																	{u.title}
																	{(isChanged || isNew) && (
																		<span
																			className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider align-middle ${
																				isNew
																					? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
																					: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
																			}`}
																		>
																			{isNew ? "New" : "Changed"}
																		</span>
																	)}
																</h4>
																<div className="flex flex-wrap items-center gap-2 mb-3">
																	<StatusBadge
																		label="Status"
																		status={u.frontmatter.status}
																	/>
																	{u.frontmatter.stage && (
																		<StatusBadge
																			label="Stage"
																			status={u.frontmatter.stage}
																		/>
																	)}
																	{u.frontmatter.discipline && (
																		<StatusBadge
																			label="Discipline"
																			status={u.frontmatter.discipline}
																		/>
																	)}
																</div>
																{unitContent.trim() && (
																	<InlineComments
																		htmlContent={markdownToSimpleHtml(
																			unitContent,
																		)}
																		onCommentsChange={onInlineCommentsChange}
																	/>
																)}
																<UnitOutputsSection
																	outputs={unitOutputs?.[u.slug] ?? []}
																/>
															</div>
														</div>
													) : (
														String(u.number).padStart(2, "0")
													)}
												</td>
												{!isExpanded && (
													<>
														<td className="py-3 pr-3 font-medium">
															<button
																type="button"
																onClick={() => setExpandedUnit(u.slug)}
																className="text-left hover:text-teal-600 dark:hover:text-teal-400 hover:underline"
															>
																{u.title}
															</button>
															{(isChanged || isNew) && (
																<span
																	className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
																		isNew
																			? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
																			: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
																	}`}
																	title={
																		isNew
																			? "Added since your last review"
																			: "Content changed since your last review"
																	}
																>
																	{isNew ? "New" : "Changed"}
																</span>
															)}
														</td>
														<td className="py-3 pr-3 text-sm capitalize">
															{u.frontmatter.stage ?? ""}
														</td>
														<td className="py-3 pr-3 text-sm">
															{u.frontmatter.discipline ?? ""}
														</td>
														<td className="py-3 pr-3">
															<StatusBadge
																label="Status"
																status={u.frontmatter.status}
															/>
														</td>
														<td className="py-3 text-sm text-stone-500 dark:text-stone-400">
															{deps}
														</td>
													</>
												)}
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					</div>
				)
			})}
		</div>
	)
})

// ── Per-unit Outputs subsection ───────────────────────────────────────────
//
// Listed inside each expanded unit row. Each output is a click-out link
// to the actual file (opens in a new tab via the auth-wrapped tunnel
// route) plus a hover popover that previews the content. Markdown
// previews render inline; HTML previews use a small sandboxed iframe;
// images use a thumbnail; binary/unknown files show a name + size
// summary.

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
	return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function UnitOutputsSection({ outputs }: { outputs: UnitOutputPreview[] }) {
	if (outputs.length === 0) return null
	return (
		<div className="mt-4 pt-4 border-t border-stone-200 dark:border-stone-700">
			<h5 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
				Outputs ({outputs.length})
			</h5>
			<ul className="space-y-1">
				{outputs.map((o) => (
					<li key={o.path}>
						<UnitOutputLink output={o} />
					</li>
				))}
			</ul>
		</div>
	)
}

function UnitOutputLink({ output }: { output: UnitOutputPreview }) {
	const authedUrl = withAuthQuery(output.url)
	return (
		<span className="relative inline-block group">
			<a
				href={authedUrl}
				target="_blank"
				rel="noopener noreferrer"
				className={`inline-flex items-center gap-1.5 text-sm font-mono ${
					output.exists
						? "text-teal-600 dark:text-teal-400 hover:underline"
						: "text-stone-500 dark:text-stone-400 line-through"
				}`}
				title={
					output.exists
						? `${output.path} — open in new tab`
						: `${output.path} — declared but not on disk`
				}
			>
				<span aria-hidden="true">↗</span>
				<span>{output.path}</span>
				{output.sizeBytes !== undefined && (
					<span className="text-stone-500 dark:text-stone-400">
						{formatBytes(output.sizeBytes)}
					</span>
				)}
				{!output.exists && (
					<span className="text-amber-600 dark:text-amber-400">(missing)</span>
				)}
			</a>
			<UnitOutputPopover output={output} authedUrl={authedUrl} />
		</span>
	)
}

function UnitOutputPopover({
	output,
	authedUrl,
}: {
	output: UnitOutputPreview
	authedUrl: string
}) {
	if (!output.exists) return null

	let body: React.ReactNode = null
	if (output.type === "markdown" && output.previewBody) {
		body = (
			<div
				className="prose prose-sm dark:prose-invert max-w-none"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via the shared markdownToSimpleHtml pipeline (DOMPurify default profile) — same contract as InlineComments/OutputArtifactsTab // audit-allow: DOMPurify-sanitized markdown render path
				dangerouslySetInnerHTML={{
					__html: markdownToSimpleHtml(output.previewBody),
				}}
			/>
		)
	} else if (output.type === "html" && output.previewBody) {
		body = (
			<iframe
				srcDoc={output.previewBody}
				sandbox=""
				className="w-full h-64 border border-stone-200 dark:border-stone-700 rounded bg-white"
				title={`Preview of ${output.path}`}
			/>
		)
	} else if (output.type === "image") {
		body = (
			<img
				src={authedUrl}
				alt={output.path}
				className="max-w-full max-h-64 rounded border border-stone-200 dark:border-stone-700"
			/>
		)
	} else {
		body = (
			<p className="text-sm text-stone-600 dark:text-stone-300">
				{output.name}
				{output.sizeBytes !== undefined &&
					` — ${formatBytes(output.sizeBytes)}`}
				<br />
				<span className="text-xs text-stone-500 dark:text-stone-400">
					Click to download.
				</span>
			</p>
		)
	}

	return (
		<div
			role="tooltip"
			className="absolute left-0 top-full mt-2 z-10 w-96 max-w-[32rem] p-3 rounded-lg shadow-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
		>
			<div className="text-xs font-mono text-stone-500 dark:text-stone-400 mb-2 truncate">
				{output.path}
			</div>
			{body}
		</div>
	)
}
