import { CriteriaChecklist, MarkdownViewer, StatusBadge } from "@haiku/shared"
import { useState } from "react"
import { AnnotationCanvas, type AnnotationPin } from "../../../components/AnnotationCanvas"
import { Card, SectionHeading } from "../../../components/Card"
import {
	type InlineCommentEntry,
	InlineComments,
} from "../../../components/InlineComments"
import { MermaidDiagram } from "../../../components/MermaidDiagram"
import { type TabDef, Tabs } from "../../../components/Tabs"
import type { ParsedUnit } from "../../../parsed"
import type {
	MockupInfo,
	OutputArtifact,
	ReviewAnnotations,
} from "../../../types"
import {
	findSection,
	findSectionWithSubs,
	getPreamble,
	isImageUrl,
	markdownToSimpleHtml,
} from "../shared/section-helpers"
import type { ReviewPageSessionData } from "../shared/session-data"

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
	onInlineCommentsChange,
	onPinsChange,
}: SubReviewProps) {
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
						<StatusBadge label="Status" status={intent.frontmatter.status} />
					</div>

					{overviewMarkdown && (
						<Card>
							<SectionHeading>Overview -- Comment on text</SectionHeading>
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
											const state = stageStates[name]
											const stageUnits = unitsByStage.get(name) ?? []
											return (
												<tr
													key={name}
													className="border-b border-stone-100 dark:border-stone-800"
												>
													<td className="py-3 pr-3 font-medium capitalize">
														{name}
													</td>
													<td className="py-3 pr-3">
														<StatusBadge
															label="Status"
															status={state?.status ?? "pending"}
														/>
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
							units={units}
							unitMockups={unitMockupsMap}
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
				<>
					<div className="flex gap-6 items-start">
						{/* Sticky sidebar TOC */}
						<div className="hidden lg:block w-56 flex-shrink-0 self-start">
							<div className="sticky top-20">
								<nav className="text-sm space-y-1">
									<h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-2">
										Contents
									</h3>
									{knowledgeFiles.map((kf, i) => (
										<a
											key={`kf-${kf.name}`}
											href={`#knowledge-${i}`}
											className="block py-1 px-2 rounded text-stone-600 dark:text-stone-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors truncate"
										>
											{kf.name}
										</a>
									))}
									{stageArtifacts.map((sa, i) => (
										<a
											key={`sa-${sa.stage}-${sa.name}`}
											href={`#artifact-${i}`}
											className="block py-1 px-2 rounded text-stone-600 dark:text-stone-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors truncate"
										>
											{sa.stage}: {sa.name}
										</a>
									))}
								</nav>
							</div>
						</div>

						{/* Content area */}
						<div className="flex-1 min-w-0">
							{knowledgeFiles.map((kf, i) => (
								<Card key={`kf-${kf.name}`} id={`knowledge-${i}`}>
									<SectionHeading>{kf.name}</SectionHeading>
									<InlineComments
										htmlContent={markdownToSimpleHtml(kf.content)}
										onCommentsChange={onInlineCommentsChange}
									/>
								</Card>
							))}
							{stageArtifacts.map((sa, i) => (
								<Card key={`sa-${sa.stage}-${sa.name}`} id={`artifact-${i}`}>
									<SectionHeading>
										{sa.stage}: {sa.name}
									</SectionHeading>
									<InlineComments
										htmlContent={markdownToSimpleHtml(sa.content)}
										onCommentsChange={onInlineCommentsChange}
									/>
								</Card>
							))}
							{knowledgeFiles.length === 0 && stageArtifacts.length === 0 && (
								<Card>
									<p className="text-stone-500 dark:text-stone-400 italic">
										No knowledge files or stage artifacts available.
									</p>
								</Card>
							)}
						</div>
					</div>
				</>
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
				/>
			),
		},
		{
			id: "domain",
			label: "Domain Model",
			content: domainSection ? (
				<Card>
					<SectionHeading>Domain Model</SectionHeading>
					<MarkdownViewer id="domain-overview">
						{domainSection.content}
					</MarkdownViewer>
					{domainSection.subsections.map((sub, i) => (
						<div key={sub.heading} className="mt-6">
							<SectionHeading level={3}>{sub.heading}</SectionHeading>
							<MarkdownViewer id={`domain-sub-${i}`}>
								{sub.content}
							</MarkdownViewer>
						</div>
					))}
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

// --- Helper components ---

function OutputArtifactsTab({
	artifacts,
	onInlineCommentsChange,
}: {
	artifacts: OutputArtifact[]
	onInlineCommentsChange: (comments: InlineCommentEntry[]) => void
}) {
	const [expandedImage, setExpandedImage] = useState<string | null>(null)

	if (artifacts.length === 0) {
		return (
			<Card>
				<p className="text-stone-500 dark:text-stone-400 italic">
					No output artifacts available.
				</p>
			</Card>
		)
	}

	// Group by stage
	const stageOrder: string[] = []
	const byStage = new Map<string, OutputArtifact[]>()
	for (const a of artifacts) {
		if (!byStage.has(a.stage)) {
			byStage.set(a.stage, [])
			stageOrder.push(a.stage)
		}
		byStage.get(a.stage)?.push(a)
	}

	return (
		<>
			<div className="flex gap-6 items-start">
				{/* Sticky sidebar TOC */}
				<div className="hidden lg:block w-56 flex-shrink-0 self-start">
					<div className="sticky top-20">
						<nav className="text-sm space-y-1">
							<h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-2">
								Contents
							</h3>
							{artifacts.map((a, i) => (
								<a
									key={`oa-${a.stage}-${a.name}`}
									href={`#output-${i}`}
									className="block py-1 px-2 rounded text-stone-600 dark:text-stone-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors truncate"
								>
									{a.stage}: {a.name}
								</a>
							))}
						</nav>
					</div>
				</div>

				{/* Content area */}
				<div className="flex-1 min-w-0">
					{stageOrder.map((stage) => {
						const stageArtifacts = byStage.get(stage) || []
						return (
							<div key={stage}>
								<h3 className="text-sm font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3 mt-6 first:mt-0">
									{stage.charAt(0).toUpperCase() + stage.slice(1)}
								</h3>
								{stageArtifacts.map((a, _i) => {
									const globalIndex = artifacts.indexOf(a)
									if (a.type === "markdown" && a.content) {
										return (
											<Card
												key={`oa-${globalIndex}`}
												id={`output-${globalIndex}`}
											>
												<SectionHeading>{a.name}</SectionHeading>
												<InlineComments
													htmlContent={markdownToSimpleHtml(a.content)}
													onCommentsChange={onInlineCommentsChange}
												/>
											</Card>
										)
									}
									if (a.type === "html" && a.content) {
										return (
											<Card
												key={`oa-${globalIndex}`}
												id={`output-${globalIndex}`}
											>
												<div className="flex items-center justify-between mb-3">
													<SectionHeading>{a.name}</SectionHeading>
													{a.relativePath && (
														<a
															href={a.relativePath}
															target="_blank"
															rel="noopener noreferrer"
															className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
														>
															View Full Size &#8599;
														</a>
													)}
												</div>
												<iframe
													srcDoc={a.content}
													sandbox="allow-scripts"
													className="w-full h-[600px] border border-stone-200 dark:border-stone-700 rounded-lg bg-white"
													title={a.name}
												/>
											</Card>
										)
									}
									if (a.type === "image" && a.relativePath) {
										return (
											<Card
												key={`oa-${globalIndex}`}
												id={`output-${globalIndex}`}
											>
												<div className="flex items-center justify-between mb-3">
													<SectionHeading>{a.name}</SectionHeading>
													<a
														href={a.relativePath}
														target="_blank"
														rel="noopener noreferrer"
														className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
													>
														Open in new tab &#8599;
													</a>
												</div>
												<button
													type="button"
													onClick={() =>
														setExpandedImage(
															expandedImage === a.relativePath
																? null
																: (a.relativePath ?? null),
														)
													}
													className="block cursor-pointer"
												>
													<img
														src={a.relativePath}
														alt={a.name}
														className={`border border-stone-200 dark:border-stone-700 rounded-lg transition-all ${
															expandedImage === a.relativePath
																? "max-w-full"
																: "max-w-md"
														}`}
													/>
												</button>
												{expandedImage !== a.relativePath && (
													<p className="text-xs text-stone-600 dark:text-stone-300 mt-1">
														Click to expand
													</p>
												)}
											</Card>
										)
									}
									return null
								})}
							</div>
						)
					})}
				</div>
			</div>

			{/* Image lightbox overlay */}
			{expandedImage && (
				<div
					className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-pointer"
					onClick={() => setExpandedImage(null)}
					onKeyDown={(e) => e.key === "Escape" && setExpandedImage(null)}
					role="dialog"
					aria-label="Expanded image"
				>
					<img
						src={expandedImage}
						alt="Expanded artifact"
						className="max-w-full max-h-full object-contain rounded-lg"
					/>
				</div>
			)}
		</>
	)
}

function UnitsTable({
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

function MockupEmbeds({ mockups }: { mockups: MockupInfo[] }) {
	return (
		<>
			{mockups.map((m) => (
				<div key={m.url} className="mt-4">
					<div className="flex items-center justify-between mb-2">
						<h4 className="text-sm font-medium text-stone-600 dark:text-stone-400">
							{m.label}
						</h4>
						<a
							href={m.url}
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
						>
							Open in new tab &#8599;
						</a>
					</div>
					{isImageUrl(m.url) ? (
						<img
							src={m.url}
							alt={m.label}
							className="max-w-full h-auto border border-stone-200 dark:border-stone-700 rounded-lg"
						/>
					) : (
						<iframe
							src={m.url}
							sandbox="allow-scripts allow-same-origin"
							className="w-full h-[600px] border border-stone-200 dark:border-stone-700 rounded-lg bg-white"
							title={m.label}
						/>
					)}
				</div>
			))}
		</>
	)
}
