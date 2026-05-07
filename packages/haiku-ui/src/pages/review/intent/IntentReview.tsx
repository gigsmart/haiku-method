import { CriteriaChecklist, MarkdownViewer, StatusBadge } from "@haiku/shared"
import { useRef, useState } from "react"
import { Card, SectionHeading } from "../../../atoms/Card"
import { type TabDef, Tabs } from "../../../molecules/Tabs"
import {
	AnnotationCanvas,
	type AnnotationPin,
} from "../../../organisms/AnnotationCanvas"
import {
	type InlineCommentEntry,
	InlineComments,
} from "../../../organisms/InlineComments"
import { MermaidDiagram } from "../../../organisms/MermaidDiagram"
import type { ParsedUnit } from "../../../parsed"
import type { ReviewAnnotations } from "../../../types"
import { KnowledgeTab } from "../shared/KnowledgeTab"
import { MockupEmbeds } from "../shared/MockupEmbeds"
import { OutputArtifactsTab } from "../shared/OutputArtifactsTab"
import {
	findSection,
	findSectionWithSubs,
	getPreamble,
	isImageUrl,
	markdownToSimpleHtml,
} from "../shared/section-helpers"
import type { ReviewPageSessionData } from "../shared/session-data"
import { UnitsTable, type UnitsTableHandle } from "../shared/UnitsTable"

export interface SubReviewProps {
	session: ReviewPageSessionData
	sessionId: string
	getAnnotations: () => ReviewAnnotations | undefined
	wsRef?: React.RefObject<WebSocket | null>
	onInlineCommentsChange: (comments: InlineCommentEntry[]) => void
	onPinsChange: (pins: AnnotationPin[]) => void
}

export function IntentReview({
	session,
	sessionId: _sessionId,
	onInlineCommentsChange,
	onPinsChange,
}: SubReviewProps) {
	const unitsTableRef = useRef<UnitsTableHandle | null>(null)
	const intent =
		session.intent ??
		({
			slug: "",
			title: "",
			frontmatter: {},
			sections: [],
			rawContent: "",
		} as unknown as NonNullable<ReviewPageSessionData["intent"]>)
	const units = session.units ?? []
	const criteria = session.criteria ?? []
	const mermaid = session.mermaid ?? ""
	const intentMockups = session.intent_mockups ?? []
	const unitMockupsMap = session.unit_mockups ?? {}
	const stageStates = session.stage_states ?? {}
	const knowledgeFiles = session.knowledge_files ?? []
	const stageArtifacts = session.stage_artifacts ?? []
	const outputArtifacts = session.output_artifacts ?? []
	const unitOutputs = session.unit_outputs ?? {}
	const [dagMaximized, setDagMaximized] = useState(false)

	if (!intent) {
		return <p className="text-stone-500">No intent data available.</p>
	}

	const preamble = getPreamble(intent.sections)
	const problem = findSection(intent.sections, "Problem")
	const solution = findSection(intent.sections, "Solution")
	const goals = findSection(intent.sections, "Goals", "Objectives")
	const domainSection = findSectionWithSubs(intent.sections, "Domain Model")

	// Build overview markdown from whatever sections are available
	let overviewMarkdown = ""
	if (preamble) overviewMarkdown += `${preamble}\n\n`
	if (problem) overviewMarkdown += `## Problem\n\n${problem}\n\n`
	if (solution) overviewMarkdown += `## Solution\n\n${solution}\n\n`
	if (goals) overviewMarkdown += `## Goals\n\n${goals}\n\n`
	// If no structured sections, show all remaining sections
	if (!overviewMarkdown.trim()) {
		for (const section of intent.sections) {
			if (section.heading === "_preamble") continue
			overviewMarkdown += `## ${section.heading}\n\n${section.content}\n\n`
		}
	}

	const firstImageMockup = intentMockups.find((m) => isImageUrl(m.url))
	const remainingMockups = intentMockups.filter((m) => m !== firstImageMockup)

	// Group units by stage for display — use intent's stage order, not alphabetical
	const intentStageOrder = (intent.frontmatter.stages as string[]) ?? []
	const stageStateKeys = Object.keys(stageStates)
	const stageNames =
		intentStageOrder.length > 0
			? intentStageOrder.filter((s) => stageStateKeys.includes(s))
			: stageStateKeys
	const unitsByStage = new Map<string, ParsedUnit[]>()
	for (const unit of units) {
		const stage = unit.frontmatter.stage ?? "_root"
		const group = unitsByStage.get(stage) ?? []
		group.push(unit)
		unitsByStage.set(stage, group)
	}

	const hasUnits = units.length > 0
	const hasKnowledge = knowledgeFiles.length > 0 || stageArtifacts.length > 0
	const hasOutputs = outputArtifacts.length > 0
	const hasDomain = !!domainSection

	const tabs: TabDef[] = [
		{
			id: "overview",
			label: "Overview",
			content: (
				<>
					<div className="flex flex-wrap items-center gap-2 mb-6">
						<StatusBadge label="Review type" status="intent" />
						<StatusBadge
							label="Status"
							status={(() => {
								// v4: derive from `sealed_at`. v3 fallback: raw `status`.
								const fm = intent.frontmatter as Record<string, unknown>
								if (typeof fm.sealed_at === "string" && fm.sealed_at) {
									return "sealed"
								}
								if (typeof fm.status === "string" && fm.status) {
									return fm.status
								}
								return "active"
							})()}
						/>
						{(() => {
							// Schema indicator. v4 stamps plugin_version on
							// intent.md; v3 has no field. Show a small chip
							// so the reviewer knows which schema they're
							// looking at — useful during the rolling
							// migration window.
							const fm = intent.frontmatter as Record<string, unknown>
							const ver =
								typeof fm.plugin_version === "string"
									? fm.plugin_version
									: ""
							const schema = ver
								? `v${ver.split(".")[0] ?? "?"}`
								: "v3"
							return <StatusBadge label="Schema" status={schema} />
						})()}
					</div>

					{(() => {
						// Migrated-from-v3 banner. The v0→v4 migrator stamps
						// `migrated: true` on synthesized approvals (intent
						// or unit scope) to flag that the approval is a
						// synthetic stand-in for a v3 "completed" record,
						// not a real user signature. Surface this so the
						// reviewer doesn't trust the synthetic approval
						// as if it were manually signed.
						const intentFm = intent.frontmatter as Record<
							string,
							unknown
						>
						const intentApprovals =
							(intentFm.approvals as Record<string, { migrated?: boolean }>) ||
							{}
						const intentMigrated = Object.values(intentApprovals).some(
							(a) => a?.migrated === true,
						)
						let unitMigratedCount = 0
						for (const u of units) {
							const ufm = u.frontmatter as Record<string, unknown>
							const uapps =
								(ufm.approvals as Record<string, { migrated?: boolean }>) ||
								{}
							if (Object.values(uapps).some((a) => a?.migrated === true)) {
								unitMigratedCount += 1
							}
						}
						if (!intentMigrated && unitMigratedCount === 0) return null
						return (
							<div className="mb-6 rounded-md border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-600 p-4 text-sm">
								<div className="font-bold text-amber-800 dark:text-amber-300 mb-1">
									Migrated from v3
								</div>
								<div className="text-amber-700 dark:text-amber-200">
									{intentMigrated && (
										<p className="mb-1">
											One or more intent-level approvals were synthesized by
											the v0→v4 migrator from a v3 <code>completed</code>{" "}
											record. The approval is a stand-in — not a real user
											signature.
										</p>
									)}
									{unitMigratedCount > 0 && (
										<p>
											{unitMigratedCount} unit{unitMigratedCount === 1 ? "" : "s"}{" "}
											have synthesized approvals (look for the{" "}
											<em>migrated</em> indicator on the unit row). These were
											stamped by the migrator to preserve the v3 completion
											signal; the cursor treats them as approved but the user
											never signed them.
										</p>
									)}
								</div>
							</div>
						)
					})()}

					{overviewMarkdown && (
						<Card as="article" ariaLabelledBy="intent-overview-heading">
							<SectionHeading id="intent-overview-heading">
								Overview -- Comment on text
							</SectionHeading>
							<p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
								Select text to add inline comments.
							</p>
							<InlineComments
								htmlContent={markdownToSimpleHtml(overviewMarkdown)}
								onCommentsChange={onInlineCommentsChange}
							/>
						</Card>
					)}

					{criteria.length > 0 && (
						<Card>
							<SectionHeading>Success Criteria</SectionHeading>
							<CriteriaChecklist criteria={criteria} />
						</Card>
					)}

					{firstImageMockup && (
						<Card>
							<SectionHeading>Mockup -- Annotate</SectionHeading>
							<div className="flex items-center justify-between mb-3">
								<h4 className="text-sm font-medium text-stone-600 dark:text-stone-400">
									{firstImageMockup.label}
								</h4>
								<a
									href={firstImageMockup.url}
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
								>
									Open in new tab &#8599;
								</a>
							</div>
							<AnnotationCanvas
								imageUrl={firstImageMockup.url}
								onPinsChange={onPinsChange}
							/>
						</Card>
					)}

					{remainingMockups.length > 0 && (
						<Card>
							<SectionHeading>
								{firstImageMockup ? "Additional Mockups" : "Mockups"}
							</SectionHeading>
							<MockupEmbeds mockups={remainingMockups} />
						</Card>
					)}

					{stageNames.length > 0 && (
						<Card>
							<SectionHeading>Stage Progress</SectionHeading>
							<div className="overflow-x-auto">
								<table className="w-full text-left">
									<thead>
										<tr className="border-b-2 border-stone-200 dark:border-stone-700">
											<th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
												Stage
											</th>
											<th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
												Status
											</th>
											<th className="py-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
												Units
											</th>
										</tr>
									</thead>
									<tbody>
										{stageNames.map((name) => {
											const state = stageStates[name] as
												| {
														status?: string
														mergedIntoMain?: boolean
												  }
												| undefined
											const stageUnits = unitsByStage.get(name) ?? []
											// v4: completion derived from mergedIntoMain.
											// v3 fallback: state.status.
											const statusLabel =
												state?.mergedIntoMain === true
													? "completed"
													: (state?.status ??
														(state?.mergedIntoMain === false
															? "active"
															: "pending"))
											return (
												<tr
													key={name}
													className="border-b border-stone-100 dark:border-stone-800"
												>
													<td className="py-3 pr-3 font-medium capitalize">
														{name}
													</td>
													<td className="py-3 pr-3">
														<StatusBadge label="Status" status={statusLabel} />
													</td>
													<td className="py-3 text-sm text-stone-500 dark:text-stone-400">
														{stageUnits.length}
													</td>
												</tr>
											)
										})}
									</tbody>
								</table>
							</div>
						</Card>
					)}
				</>
			),
		},
		{
			id: "units-dag",
			label: `Units (${units.length})`,
			content: (
				<>
					{mermaid && (
						<>
							<Card>
								<div className="flex items-center justify-between mb-3">
									<SectionHeading>Dependency Graph</SectionHeading>
									<button
										type="button"
										onClick={() => setDagMaximized(true)}
										className="text-xs px-2 py-1 rounded border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
									>
										View Full Size
									</button>
								</div>
								<MermaidDiagram definition={mermaid} />
							</Card>
							{dagMaximized && (
								<div
									className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
									onClick={() => setDagMaximized(false)}
									onKeyDown={(e) => {
										if (e.key === "Escape") setDagMaximized(false)
									}}
									role="dialog"
									aria-modal="true"
									aria-label="Dependency graph preview"
								>
									{/* biome-ignore lint/a11y/noStaticElementInteractions: inner container stops propagation to prevent backdrop close-on-click when interacting with content */}
									{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation is not an interactive action, just click-capture suppression */}
									<div
										className="relative bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 shadow-xl overflow-auto"
										style={{ width: "90vw", height: "90vh" }}
										onClick={(e) => e.stopPropagation()}
									>
										<div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-white/90 dark:bg-stone-900/90 backdrop-blur border-b border-stone-200 dark:border-stone-700">
											<span className="font-semibold text-stone-900 dark:text-stone-100">
												Dependency Graph
											</span>
											<button
												type="button"
												onClick={() => setDagMaximized(false)}
												className="text-sm px-3 py-1 rounded border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
											>
												Close
											</button>
										</div>
										<div className="p-4">
											<MermaidDiagram definition={mermaid} />
										</div>
									</div>
								</div>
							)}
						</>
					)}
					<Card>
						<SectionHeading>Units</SectionHeading>
						<UnitsTable
							ref={unitsTableRef}
							units={units}
							unitMockups={unitMockupsMap}
							unitOutputs={unitOutputs}
							onInlineCommentsChange={onInlineCommentsChange}
							previousUnitContents={session.previous_review?.unitRawContents}
						/>
					</Card>
				</>
			),
		},
		{
			id: "knowledge",
			label: "Knowledge",
			disabled: knowledgeFiles.length === 0 && stageArtifacts.length === 0,
			content: (
				<KnowledgeTab
					knowledgeFiles={knowledgeFiles}
					stageArtifacts={stageArtifacts}
					onInlineCommentsChange={onInlineCommentsChange}
				/>
			),
		},
		{
			id: "outputs",
			label: `Outputs (${outputArtifacts.length})`,
			disabled: !hasOutputs,
			content: (
				<OutputArtifactsTab
					artifacts={outputArtifacts}
					onInlineCommentsChange={onInlineCommentsChange}
					outputDeclaredBy={session.output_declared_by}
					onUnitClick={(unitSlug) => {
						// Imperative bridge — UnitsTable owns the
						// expand+scroll lifecycle and exposes a single
						// `expandAndScrollTo` handle. No DOM lookups, no
						// duplicate state about which row is expanded.
						unitsTableRef.current?.expandAndScrollTo(unitSlug)
					}}
				/>
			),
		},
		{
			id: "domain",
			label: "Domain Model",
			content: domainSection ? (
				<Card as="article" ariaLabelledBy="intent-domain-heading">
					<SectionHeading id="intent-domain-heading">
						Domain Model
					</SectionHeading>
					<MarkdownViewer id="domain-overview">
						{domainSection.content}
					</MarkdownViewer>
					{domainSection.subsections.map((sub, i) => {
						const subId = `intent-domain-sub-${i}-heading`
						return (
							<section
								key={sub.heading}
								className="mt-6"
								aria-labelledby={subId}
							>
								<SectionHeading level={3} id={subId}>
									{sub.heading}
								</SectionHeading>
								<MarkdownViewer id={`domain-sub-${i}`}>
									{sub.content}
								</MarkdownViewer>
							</section>
						)
					})}
				</Card>
			) : (
				<Card>
					<SectionHeading>Domain Model</SectionHeading>
					<p className="text-stone-500 dark:text-stone-400 italic">
						No domain model defined.
					</p>
				</Card>
			),
		},
	].filter((tab) => {
		if (tab.id === "units-dag" && !hasUnits) return false
		if (tab.id === "knowledge" && !hasKnowledge) return false
		if (tab.id === "outputs" && !hasOutputs) return false
		if (tab.id === "domain" && !hasDomain) return false
		return true
	})

	return <Tabs groupId="intent" tabs={tabs} />
}
