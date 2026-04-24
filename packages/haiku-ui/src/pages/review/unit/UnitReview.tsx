import { CriteriaChecklist, MarkdownViewer, StatusBadge } from "@haiku/shared"
import {
	AnnotationCanvas,
	type AnnotationPin,
} from "../../../components/AnnotationCanvas"
import { Card, SectionHeading } from "../../../components/Card"
import {
	type InlineCommentEntry,
	InlineComments,
} from "../../../components/InlineComments"
import { type TabDef, Tabs } from "../../../components/Tabs"
import type { ReviewAnnotations } from "../../../types"
import { MockupEmbeds } from "../shared/MockupEmbeds"
import {
	findSection,
	getPreamble,
	isImageUrl,
	markdownToSimpleHtml,
} from "../shared/section-helpers"
import type { ReviewPageSessionData } from "../shared/session-data"

export interface UnitReviewProps {
	session: ReviewPageSessionData
	sessionId: string
	getAnnotations: () => ReviewAnnotations | undefined
	wsRef?: React.RefObject<WebSocket | null>
	onInlineCommentsChange: (comments: InlineCommentEntry[]) => void
	onPinsChange: (pins: AnnotationPin[]) => void
}

export function UnitReview({
	session,
	onInlineCommentsChange,
	onPinsChange,
}: UnitReviewProps) {
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
	const unitMockupsMap = session.unit_mockups ?? {}

	if (!intent) {
		return <p className="text-stone-500">No intent data available.</p>
	}

	const targetUnit = units.find(
		(u) => u.slug === session.target || u.title === session.target,
	)

	if (!targetUnit) {
		return (
			<div className="p-8 text-center text-red-600 dark:text-red-400">
				<p className="text-lg font-semibold">
					Unit not found: {session.target}
				</p>
			</div>
		)
	}

	const wireframeMockups = unitMockupsMap[targetUnit.slug] ?? []

	const unitPreamble = getPreamble(targetUnit.sections)
	const description = findSection(
		targetUnit.sections,
		"Description",
		"Overview",
	)
	const techSpec = findSection(
		targetUnit.sections,
		"Technical Spec",
		"Technical Specification",
		"Implementation",
	)
	const domainEntities = findSection(
		targetUnit.sections,
		"Domain Entities",
		"Entities",
	)
	const completionCriteria = findSection(
		targetUnit.sections,
		"Completion Criteria",
		"Success Criteria",
		"Criteria",
	)
	const risks = findSection(
		targetUnit.sections,
		"Risks",
		"Risk",
		"Known Risks (Accepted)",
	)
	const boundaries = findSection(
		targetUnit.sections,
		"Boundaries",
		"Out of Scope",
		"NOT in scope",
	)
	const notes = findSection(targetUnit.sections, "Notes", "Additional Notes")
	const findings = findSection(
		targetUnit.sections,
		"Findings Addressed",
		"Findings",
	)

	let combinedSpec = ""
	if (unitPreamble) combinedSpec += `${unitPreamble}\n\n`
	if (description) combinedSpec += `## Description\n\n${description}\n\n`
	if (techSpec) combinedSpec += `## Technical Spec\n\n${techSpec}\n\n`
	if (domainEntities)
		combinedSpec += `## Domain Entities\n\n${domainEntities}\n\n`
	if (completionCriteria)
		combinedSpec += `## Completion Criteria\n\n${completionCriteria}\n\n`
	if (findings) combinedSpec += `## Findings Addressed\n\n${findings}\n\n`

	const hasWireframe = wireframeMockups.length > 0
	const firstImageMockup = wireframeMockups.find((m) => isImageUrl(m.url))
	const remainingMockups = wireframeMockups.filter(
		(m) => m !== firstImageMockup,
	)

	const tabs: TabDef[] = [
		{
			id: "spec",
			label: "Spec",
			content: (
				<>
					{/* Breadcrumb */}
					<nav aria-label="Breadcrumb" className="mb-4">
						<ol className="flex items-center gap-1 text-sm text-stone-500 dark:text-stone-400">
							<li>{intent.title}</li>
							<li className="flex items-center gap-1">
								<span
									aria-hidden="true"
									className="text-stone-600 dark:text-stone-300"
								>
									/
								</span>
								<span
									className="text-stone-700 dark:text-stone-200 font-medium"
									aria-current="page"
								>
									{targetUnit.title}
								</span>
							</li>
						</ol>
					</nav>

					<div className="flex flex-wrap items-center gap-2 mb-6">
						<StatusBadge label="Unit" status="unit" />
						<StatusBadge
							label="Status"
							status={targetUnit.frontmatter.status}
						/>
						{targetUnit.frontmatter.discipline && (
							<StatusBadge
								label="Discipline"
								status={targetUnit.frontmatter.discipline}
							/>
						)}
						{(() => {
							const prev =
								session.previous_review?.unitRawContents?.[targetUnit.slug]
							if (prev === undefined) return null
							if (prev === targetUnit.rawContent) return null
							return (
								<span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-semibold uppercase tracking-wider">
									Changed
								</span>
							)
						})()}
					</div>

					{combinedSpec ? (
						<Card>
							<SectionHeading>Spec -- Comment on text</SectionHeading>
							<p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
								Select text to add inline comments.
							</p>
							<InlineComments
								htmlContent={markdownToSimpleHtml(combinedSpec)}
								onCommentsChange={onInlineCommentsChange}
							/>
						</Card>
					) : (
						<Card>
							<p className="text-stone-500 dark:text-stone-400 italic">
								No spec content available.
							</p>
						</Card>
					)}
				</>
			),
		},
		{
			id: "wireframe",
			label: "Wireframe",
			disabled: !hasWireframe,
			content: hasWireframe ? (
				<>
					{firstImageMockup && (
						<Card>
							<SectionHeading>Wireframe -- Annotate</SectionHeading>
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
								{firstImageMockup ? "Additional Wireframes" : "Wireframe"}
							</SectionHeading>
							<MockupEmbeds mockups={remainingMockups} />
						</Card>
					)}
				</>
			) : (
				<Card>
					<SectionHeading>Wireframe</SectionHeading>
					<p className="text-stone-500 dark:text-stone-400 italic">
						No wireframe available for this unit.
					</p>
				</Card>
			),
		},
		{
			id: "criteria",
			label: "Success Criteria",
			content: (
				<Card>
					<SectionHeading>Success Criteria</SectionHeading>
					<CriteriaChecklist criteria={criteria} />
				</Card>
			),
		},
		{
			id: "risks",
			label: "Risks & Boundaries",
			content: (
				<>
					{risks && (
						<Card>
							<SectionHeading>Risks</SectionHeading>
							<MarkdownViewer id="unit-risks">{risks}</MarkdownViewer>
						</Card>
					)}
					{boundaries && (
						<Card>
							<SectionHeading>Boundaries (NOT in scope)</SectionHeading>
							<MarkdownViewer id="unit-boundaries">{boundaries}</MarkdownViewer>
						</Card>
					)}
					{notes && (
						<Card>
							<SectionHeading>Notes</SectionHeading>
							<MarkdownViewer id="unit-notes">{notes}</MarkdownViewer>
						</Card>
					)}
					{!(risks || boundaries || notes) && (
						<Card>
							<p className="text-stone-500 dark:text-stone-400 italic">
								No risks or boundaries documented for this unit.
							</p>
						</Card>
					)}
				</>
			),
		},
	]

	return <Tabs groupId="unit" tabs={tabs} />
}
