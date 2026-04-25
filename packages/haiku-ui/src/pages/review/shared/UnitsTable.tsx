import { StatusBadge } from "@haiku/shared"
import { useState } from "react"
import {
	type InlineCommentEntry,
	InlineComments,
} from "../../../components/InlineComments"
import type { ParsedUnit } from "../../../parsed"
import type { MockupInfo } from "../../../types"
import { markdownToSimpleHtml } from "./section-helpers"

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
export function UnitsTable({
	units,
	unitMockups: _unitMockups,
	onInlineCommentsChange,
	previousUnitContents,
}: {
	units: ParsedUnit[]
	unitMockups: Record<string, MockupInfo[]>
	onInlineCommentsChange?: (comments: InlineCommentEntry[]) => void
	previousUnitContents?: Record<string, string>
}) {
	const [expandedUnit, setExpandedUnit] = useState<string | null>(null)

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
}
