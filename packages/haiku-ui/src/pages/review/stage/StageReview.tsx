/**
 * StageReview — stage-scoped main content per canonical mockup
 * (`stages/design/artifacts/review-ui-mockup.html`).
 *
 * Filters session data to a single stage and renders the four tabs:
 *   - Overview: Stage Summary + condensed Units + 2-col Knowledge/Outputs
 *   - Units:    numbered unit cards with type pill + status + expand +
 *               NEW/CHANGED markers + feedback-count badges
 *   - Knowledge: kind-labeled rows with summary + expand + body preview
 *   - Outputs:   kind-labeled rows with summary + expand + body preview
 *
 * Next-unseen navigation:
 *   - Each of the three list tabs shows a "<kind> · N/M seen" counter.
 *   - When at least one item is unseen, a "Next unseen (N) →" teal button
 *     scrolls to the next unseen artifact (data-<kind>-card attribute) and
 *     flashes it via the `.unit-flash` class from index.css.
 *
 * Scope left on the follow-up list: inline per-line / pin annotation
 * overlays inside rendered artifact bodies (needs target.annotation
 * coordinates in FeedbackItemData).
 */

import { MarkdownViewer } from "@haiku/shared"
import DOMPurify from "dompurify"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, SectionHeading } from "../../../components/Card"
import { type TabDef, Tabs } from "../../../components/Tabs"
import type { ParsedUnit } from "../../../parsed"
import type { FeedbackItemData } from "../../../types"
import type { ReviewPageSessionData } from "../shared/session-data"
import {
	type ArtifactKind,
	type SeenState,
	shaOf,
	useSeenTracker,
} from "./useSeenTracker"

export interface StageReviewProps {
	session: ReviewPageSessionData
	sessionId: string
	stageName: string
	feedback: FeedbackItemData[]
	onHighlightRequestId?: string | null
	onHighlightConsumed?: () => void
}

const TYPE_BADGE: Record<string, string> = {
	implementation:
		"bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
	refactor:
		"bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 border-purple-200 dark:border-purple-800",
	bugfix:
		"bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400 border-rose-200 dark:border-rose-800",
	research:
		"bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400 border-sky-200 dark:border-sky-800",
	docs: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800",
	backend:
		"bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800",
}

const KIND_BADGE: Record<string, string> = {
	discovery:
		"bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400 border-sky-200 dark:border-sky-800",
	diagram:
		"bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400 border-sky-200 dark:border-sky-800",
	artifact:
		"bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400 border-violet-200 dark:border-violet-800",
	wireframe:
		"bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400 border-violet-200 dark:border-violet-800",
}

function statusPillClass(status: string | undefined): string {
	switch (status) {
		case "completed":
			return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
		case "in_progress":
		case "active":
			return "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400"
		default:
			return "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
	}
}

function feedbackBadgeColor(status: string): string {
	switch (status) {
		case "pending":
			return "bg-amber-500 text-white"
		case "addressed":
			return "bg-blue-500 text-white"
		case "closed":
			return "bg-green-500 text-white"
		default:
			return "bg-stone-400 text-white"
	}
}

function seenBorderClass(state: SeenState): string {
	if (state === "unseen")
		return "border-sky-300 dark:border-sky-800"
	if (state === "changed")
		return "border-amber-300 dark:border-amber-700"
	return "border-stone-200 dark:border-stone-700"
}

function StateBadge({ state }: { state: SeenState }) {
	if (state === "unseen") {
		return (
			<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-sky-500 text-white">
				<span className="w-1.5 h-1.5 rounded-full bg-white" />
				NEW
			</span>
		)
	}
	if (state === "changed") {
		return (
			<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">
				<span className="w-1.5 h-1.5 rounded-full bg-white" />
				CHANGED
			</span>
		)
	}
	return null
}

interface ArtifactViewModel {
	name: string
	kind: string
	summary: string
	body: string
	mime: string
}

export function StageReview({
	session,
	sessionId,
	stageName,
	feedback,
	onHighlightRequestId,
	onHighlightConsumed,
}: StageReviewProps): React.ReactElement {
	const [activeTab, setActiveTab] = useState<string>("overview")

	const units = (session.units ?? []).filter(
		(u) => (u.frontmatter.stage ?? "") === stageName,
	)
	const stageArtifacts = (session.stage_artifacts ?? []).filter(
		(a) => a.stage === stageName,
	)
	const outputArtifacts = (session.output_artifacts ?? []).filter(
		(a) => a.stage === stageName,
	)
	// Intent-level knowledge files apply to every stage (per the
	// H·AI·K·U data model — `.haiku/intents/{slug}/knowledge/`). We merge
	// them with stage-scoped artifacts so stages that produce no new
	// discovery still surface the ambient knowledge reviewers need.
	const intentKnowledge = session.knowledge_files ?? []

	const knowledgeVMs: ArtifactViewModel[] = [
		...stageArtifacts.map((a) => ({
			name: a.name,
			kind: inferKind(a.name),
			summary: firstLine(a.content),
			body: a.content,
			mime: inferMime(a.name),
		})),
		...intentKnowledge.map((k) => ({
			name: k.name,
			kind: inferKind(k.name),
			summary: firstLine(k.content),
			body: k.content,
			mime: inferMime(k.name),
		})),
	]
	const outputVMs: ArtifactViewModel[] = outputArtifacts.map((a) => ({
		name: a.name,
		kind: inferOutputKind(a),
		summary: firstLine(a.content ?? ""),
		body: a.content ?? "",
		mime: a.type,
	}))

	// Pre-compute feedback → target maps (keyed by unit slug / knowledge name / output name)
	const { feedbackByUnit, feedbackByKnowledge, feedbackByOutput } = useMemo(() => {
		const byUnit = new Map<string, FeedbackItemData[]>()
		const byKnowledge = new Map<string, FeedbackItemData[]>()
		const byOutput = new Map<string, FeedbackItemData[]>()
		for (const f of feedback) {
			const target = (f as unknown as {
				target?: {
					kind?: string
					unitName?: string
					knowledgeName?: string
					outputName?: string
				}
			}).target
			if (!target) continue
			let bucket: Map<string, FeedbackItemData[]> | null = null
			let key: string | undefined
			if (target.kind === "unit" && target.unitName) {
				bucket = byUnit
				key = target.unitName
			} else if (target.kind === "knowledge" && target.knowledgeName) {
				bucket = byKnowledge
				key = target.knowledgeName
			} else if (target.kind === "output" && target.outputName) {
				bucket = byOutput
				key = target.outputName
			}
			if (bucket && key) {
				const list = bucket.get(key) ?? []
				list.push(f)
				bucket.set(key, list)
			}
		}
		return {
			feedbackByUnit: byUnit,
			feedbackByKnowledge: byKnowledge,
			feedbackByOutput: byOutput,
		}
	}, [feedback])

	const stageSummary = resolveStageSummary(session, stageName)
	const seen = useSeenTracker(sessionId)

	// Condensed Overview rows request navigation to the Units / Knowledge /
	// Outputs tab + expand the target card. We jump the tab here, then push
	// a pending expand request down to the list components which scroll +
	// flash the card into view.
	const [pendingNav, setPendingNav] = useState<{
		tab: "units" | "knowledge" | "outputs"
		name: string
	} | null>(null)
	const navigateTo = useCallback(
		(tab: "units" | "knowledge" | "outputs", name: string) => {
			setActiveTab(tab)
			setPendingNav({ tab, name })
		},
		[],
	)

	const tabs: TabDef[] = [
		{
			id: "overview",
			label: "Overview",
			content: (
				<OverviewTab
					stageName={stageName}
					stageSummary={stageSummary}
					units={units}
					knowledge={knowledgeVMs}
					outputs={outputVMs}
					feedbackByUnit={feedbackByUnit}
					feedbackByKnowledge={feedbackByKnowledge}
					feedbackByOutput={feedbackByOutput}
					seen={seen}
					stageId={stageName}
					onNavigate={navigateTo}
				/>
			),
		},
		{
			id: "units",
			label: `Units (${units.length})`,
			disabled: units.length === 0,
			content: (
				<UnitsTab
					units={units}
					feedbackByUnit={feedbackByUnit}
					seen={seen}
					stageId={stageName}
					highlightRequestId={onHighlightRequestId ?? null}
					onHighlightConsumed={onHighlightConsumed}
					feedback={feedback}
					navTargetName={pendingNav?.tab === "units" ? pendingNav.name : null}
					onNavConsumed={() => setPendingNav(null)}
				/>
			),
		},
		{
			id: "knowledge",
			label: `Knowledge (${knowledgeVMs.length})`,
			disabled: knowledgeVMs.length === 0,
			content: (
				<ArtifactsTab
					kind="knowledge"
					artifacts={knowledgeVMs}
					feedbackByName={feedbackByKnowledge}
					seen={seen}
					stageId={stageName}
					highlightRequestId={onHighlightRequestId ?? null}
					onHighlightConsumed={onHighlightConsumed}
					feedback={feedback}
					navTargetName={
						pendingNav?.tab === "knowledge" ? pendingNav.name : null
					}
					onNavConsumed={() => setPendingNav(null)}
				/>
			),
		},
		{
			id: "outputs",
			label: `Outputs (${outputVMs.length})`,
			disabled: outputVMs.length === 0,
			content: (
				<ArtifactsTab
					kind="output"
					artifacts={outputVMs}
					feedbackByName={feedbackByOutput}
					seen={seen}
					stageId={stageName}
					highlightRequestId={onHighlightRequestId ?? null}
					onHighlightConsumed={onHighlightConsumed}
					feedback={feedback}
					navTargetName={
						pendingNav?.tab === "outputs" ? pendingNav.name : null
					}
					onNavConsumed={() => setPendingNav(null)}
				/>
			),
		},
	]

	return (
		<Tabs
			groupId={`stage-${stageName}`}
			tabs={tabs}
			activeId={activeTab}
			onActiveChange={setActiveTab}
		/>
	)
}

function OverviewTab({
	stageName,
	stageSummary,
	units,
	knowledge,
	outputs,
	feedbackByUnit,
	feedbackByKnowledge,
	feedbackByOutput,
	seen,
	stageId,
	onNavigate,
}: {
	stageName: string
	stageSummary: string | null
	units: ParsedUnit[]
	knowledge: ArtifactViewModel[]
	outputs: ArtifactViewModel[]
	feedbackByUnit: Map<string, FeedbackItemData[]>
	feedbackByKnowledge: Map<string, FeedbackItemData[]>
	feedbackByOutput: Map<string, FeedbackItemData[]>
	seen: ReturnType<typeof useSeenTracker>
	stageId: string
	onNavigate: (tab: "units" | "knowledge" | "outputs", name: string) => void
}) {
	return (
		<div className="space-y-4">
			<Card>
				<p className="text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-500 mb-1.5">
					Stage Summary{" "}
					<span className="font-normal normal-case text-stone-500">
						(from studio definition)
					</span>
				</p>
				<p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
					{stageSummary ??
						`No summary available for the ${stageName} stage.`}
				</p>
			</Card>

			{units.length > 0 && (
				<Card>
					<div className="flex items-center justify-between mb-3">
						<SectionHeading>Units ({units.length})</SectionHeading>
					</div>
					<div className="space-y-2">
						{units.slice(0, 5).map((u, i) => (
							<CondensedUnitRow
								key={u.slug}
								index={i}
								unit={u}
								feedback={feedbackByUnit.get(u.slug) ?? []}
								state={seen.state("unit", stageId, u.slug, shaOf(u))}
								onClick={() => onNavigate("units", u.slug)}
							/>
						))}
						{units.length > 5 && (
							<button
								type="button"
								onClick={() => onNavigate("units", units[5]?.slug ?? "")}
								className="block w-full text-xs text-center text-teal-600 dark:text-teal-400 hover:underline mt-3"
							>
								+ {units.length - 5} more — view all in Units tab
							</button>
						)}
					</div>
				</Card>
			)}

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{knowledge.length > 0 && (
					<Card>
						<SectionHeading>Knowledge ({knowledge.length})</SectionHeading>
						<div className="space-y-2">
							{knowledge.slice(0, 5).map((a) => (
								<CondensedArtifactRow
									key={a.name}
									name={a.name}
									kind={a.kind}
									feedback={feedbackByKnowledge.get(a.name) ?? []}
									iconKind="knowledge"
									state={seen.state("knowledge", stageId, a.name, shaOf(a))}
									onClick={() => onNavigate("knowledge", a.name)}
								/>
							))}
							{knowledge.length > 5 && (
								<button
									type="button"
									onClick={() =>
										onNavigate("knowledge", knowledge[5]?.name ?? "")
									}
									className="block w-full text-xs text-center text-teal-600 dark:text-teal-400 hover:underline mt-2"
								>
									+ {knowledge.length - 5} more
								</button>
							)}
						</div>
					</Card>
				)}

				{outputs.length > 0 && (
					<Card>
						<SectionHeading>Outputs ({outputs.length})</SectionHeading>
						<div className="space-y-2">
							{outputs.slice(0, 5).map((a) => (
								<CondensedArtifactRow
									key={a.name}
									name={a.name}
									kind={a.kind}
									feedback={feedbackByOutput.get(a.name) ?? []}
									iconKind="output"
									state={seen.state("output", stageId, a.name, shaOf(a))}
									onClick={() => onNavigate("outputs", a.name)}
								/>
							))}
							{outputs.length > 5 && (
								<button
									type="button"
									onClick={() =>
										onNavigate("outputs", outputs[5]?.name ?? "")
									}
									className="block w-full text-xs text-center text-teal-600 dark:text-teal-400 hover:underline mt-2"
								>
									+ {outputs.length - 5} more
								</button>
							)}
						</div>
					</Card>
				)}
			</div>
		</div>
	)
}

function SeenCounter({
	label,
	total,
	seenCount,
	onNextUnseen,
}: {
	label: string
	total: number
	seenCount: number
	onNextUnseen?: () => void
}) {
	const unseen = total - seenCount
	return (
		<div className="mb-3 flex items-center justify-between gap-3">
			<div className="flex items-center gap-2 text-xs">
				<span className="font-semibold text-stone-700 dark:text-stone-200">
					{label}
				</span>
				<span className="text-stone-500">·</span>
				<span className="font-mono text-stone-500 dark:text-stone-300">
					{seenCount}/{total} seen
				</span>
			</div>
			{unseen > 0 && onNextUnseen ? (
				<button
					type="button"
					onClick={onNextUnseen}
					className="px-3 py-1.5 text-xs font-semibold rounded-md bg-teal-700 hover:bg-teal-800 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900"
				>
					Next unseen ({unseen}) →
				</button>
			) : (
				<span className="text-xs text-green-600 dark:text-green-400 font-semibold">
					✓ All seen
				</span>
			)}
		</div>
	)
}

function scrollAndFlash(selector: string): void {
	const el = document.querySelector(selector) as HTMLElement | null
	if (!el) return
	el.scrollIntoView({ behavior: "smooth", block: "center" })
	el.classList.add("unit-flash")
	setTimeout(() => el.classList.remove("unit-flash"), 1400)
}

function UnitsTab({
	units,
	feedbackByUnit,
	seen,
	stageId,
	highlightRequestId,
	onHighlightConsumed,
	feedback,
	navTargetName,
	onNavConsumed,
}: {
	units: ParsedUnit[]
	feedbackByUnit: Map<string, FeedbackItemData[]>
	seen: ReturnType<typeof useSeenTracker>
	stageId: string
	highlightRequestId: string | null
	onHighlightConsumed?: () => void
	feedback: FeedbackItemData[]
	navTargetName: string | null
	onNavConsumed?: () => void
}) {
	const [forceExpandId, setForceExpandId] = useState<string | null>(null)

	// External highlight request — route to the matching unit.
	useEffect(() => {
		if (!highlightRequestId) return
		const target = feedback.find((f) => f.feedback_id === highlightRequestId)
		const unitName = (
			target as unknown as { target?: { unitName?: string } }
		)?.target?.unitName
		if (!unitName) return
		setForceExpandId(unitName)
		setTimeout(() => {
			scrollAndFlash(`[data-unit-card="${CSS.escape(unitName)}"]`)
			onHighlightConsumed?.()
		}, 40)
	}, [highlightRequestId, feedback, onHighlightConsumed])

	// Overview-row click → navigate + scroll + flash.
	useEffect(() => {
		if (!navTargetName) return
		setForceExpandId(navTargetName)
		setTimeout(() => {
			scrollAndFlash(`[data-unit-card="${CSS.escape(navTargetName)}"]`)
			onNavConsumed?.()
		}, 60)
	}, [navTargetName, onNavConsumed])

	const seenCount = units.filter(
		(u) => seen.state("unit", stageId, u.slug, shaOf(u)) === "seen",
	).length

	const handleNextUnseen = (): void => {
		const next = units.find(
			(u) => seen.state("unit", stageId, u.slug, shaOf(u)) !== "seen",
		)
		if (!next) return
		setForceExpandId(next.slug)
		setTimeout(() => {
			scrollAndFlash(`[data-unit-card="${CSS.escape(next.slug)}"]`)
		}, 40)
	}

	return (
		<>
			<SeenCounter
				label="Units"
				total={units.length}
				seenCount={seenCount}
				onNextUnseen={handleNextUnseen}
			/>
			<div className="space-y-3">
				{units.map((u, i) => (
					<UnitCard
						key={u.slug}
						index={i}
						unit={u}
						feedback={feedbackByUnit.get(u.slug) ?? []}
						state={seen.state("unit", stageId, u.slug, shaOf(u))}
						onExpand={() =>
							seen.markSeen("unit", stageId, u.slug, shaOf(u))
						}
						startExpanded={forceExpandId === u.slug}
					/>
				))}
			</div>
		</>
	)
}

function UnitCard({
	index,
	unit,
	feedback,
	state,
	onExpand,
	startExpanded,
}: {
	index: number
	unit: ParsedUnit
	feedback: FeedbackItemData[]
	state: SeenState
	onExpand: () => void
	startExpanded?: boolean
}) {
	const [expanded, setExpanded] = useState(!!startExpanded)
	useEffect(() => {
		if (startExpanded) setExpanded(true)
	}, [startExpanded])
	const fm = unit.frontmatter as typeof unit.frontmatter & {
		type?: string
		description?: string
	}
	const type = fm.type ?? fm.discipline ?? ""
	const typeCls = type
		? (TYPE_BADGE[type.toLowerCase()] ??
			"bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300 border-stone-200 dark:border-stone-700")
		: ""
	const description =
		fm.description ??
		(unit.sections[0]?.content
			? unit.sections[0].content.split("\n")[0]
			: "")

	const toggle = (): void => {
		const next = !expanded
		setExpanded(next)
		if (next) onExpand()
	}

	return (
		<div
			data-unit-card={unit.slug}
			className={`bg-white dark:bg-stone-900 rounded-lg border-2 ${seenBorderClass(state)} overflow-hidden transition-colors`}
		>
			<button
				type="button"
				onClick={toggle}
				aria-expanded={expanded}
				className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
			>
				<span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-300 text-xs font-bold font-mono mt-0.5">
					{String(index + 1).padStart(2, "0")}
				</span>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<span className="text-sm font-semibold text-stone-900 dark:text-stone-100 leading-tight break-words">
							{unit.title || unit.slug}
						</span>
						<StateBadge state={state} />
						{type && (
							<span
								className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border ${typeCls}`}
							>
								{type}
							</span>
						)}
					</div>
					<p className="text-xs font-mono text-stone-500 dark:text-stone-500 truncate mt-0.5">
						{unit.slug}
					</p>
					{description && (
						<p
							className={`text-xs text-stone-600 dark:text-stone-300 leading-snug mt-1 ${expanded ? "" : "line-clamp-1"}`}
						>
							{description}
						</p>
					)}
				</div>
				<div className="shrink-0 flex items-center gap-2 mt-0.5">
					{feedback.length > 0 && (
						<span className="inline-flex items-center gap-0.5">
							{feedback.slice(0, 3).map((f, i) => (
								<span
									key={f.feedback_id}
									title={f.title}
									className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${feedbackBadgeColor(f.status)}`}
								>
									{i + 1}
								</span>
							))}
							{feedback.length > 3 && (
								<span className="ml-0.5 text-xs font-mono text-stone-500">
									+{feedback.length - 3}
								</span>
							)}
						</span>
					)}
					<span
						className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${statusPillClass(fm.status)}`}
					>
						{fm.status ?? "unknown"}
					</span>
					<svg
						className={`w-4 h-4 text-stone-500 transition-transform ${expanded ? "rotate-180" : ""}`}
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<title>expand</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</div>
			</button>
			{expanded && (
				<div className="border-t border-stone-200 dark:border-stone-700 px-4 py-3 space-y-3 bg-stone-50/50 dark:bg-stone-900/50">
					{unit.rawContent && (
						<MarkdownViewer id={`unit-${unit.slug}`}>
							{unit.rawContent}
						</MarkdownViewer>
					)}
				</div>
			)}
		</div>
	)
}

function CondensedUnitRow({
	index,
	unit,
	feedback,
	state,
	onClick,
}: {
	index: number
	unit: ParsedUnit
	feedback: FeedbackItemData[]
	state: SeenState
	onClick?: () => void
}) {
	const fm = unit.frontmatter
	return (
		<button
			type="button"
			onClick={onClick}
			className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg bg-stone-50 dark:bg-stone-800/50 border ${seenBorderClass(state)} hover:border-teal-400 dark:hover:border-teal-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900`}
		>
			<span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 text-xs font-bold font-mono">
				{String(index + 1).padStart(2, "0")}
			</span>
			<span className="flex-1 min-w-0 text-xs font-mono text-stone-700 dark:text-stone-300 truncate">
				{unit.slug}
			</span>
			<StateBadge state={state} />
			{feedback.length > 0 && (
				<span
					className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${feedbackBadgeColor(feedback[0].status)}`}
				>
					{feedback.length}
				</span>
			)}
			<span
				className={`shrink-0 px-1.5 py-0.5 rounded-full text-xs font-semibold ${statusPillClass(fm.status)}`}
			>
				{fm.status ?? "unknown"}
			</span>
		</button>
	)
}

function ArtifactsTab({
	kind,
	artifacts,
	feedbackByName,
	seen,
	stageId,
	highlightRequestId,
	onHighlightConsumed,
	feedback,
	navTargetName,
	onNavConsumed,
}: {
	kind: ArtifactKind & ("knowledge" | "output")
	artifacts: ArtifactViewModel[]
	feedbackByName: Map<string, FeedbackItemData[]>
	seen: ReturnType<typeof useSeenTracker>
	stageId: string
	highlightRequestId: string | null
	onHighlightConsumed?: () => void
	feedback: FeedbackItemData[]
	navTargetName: string | null
	onNavConsumed?: () => void
}) {
	const [forceExpandName, setForceExpandName] = useState<string | null>(null)

	useEffect(() => {
		if (!highlightRequestId) return
		const target = feedback.find((f) => f.feedback_id === highlightRequestId)
		const targetKind = (
			target as unknown as { target?: { kind?: string } }
		)?.target?.kind
		if (targetKind !== kind) return
		const name = (
			target as unknown as {
				target?: { knowledgeName?: string; outputName?: string }
			}
		)?.target?.[kind === "knowledge" ? "knowledgeName" : "outputName"]
		if (!name) return
		setForceExpandName(name)
		setTimeout(() => {
			scrollAndFlash(`[data-artifact-card="${CSS.escape(name)}"]`)
			onHighlightConsumed?.()
		}, 40)
	}, [highlightRequestId, feedback, kind, onHighlightConsumed])

	// Overview-row click → navigate + scroll + flash.
	useEffect(() => {
		if (!navTargetName) return
		setForceExpandName(navTargetName)
		setTimeout(() => {
			scrollAndFlash(`[data-artifact-card="${CSS.escape(navTargetName)}"]`)
			onNavConsumed?.()
		}, 60)
	}, [navTargetName, onNavConsumed])

	const seenCount = artifacts.filter(
		(a) => seen.state(kind, stageId, a.name, shaOf(a)) === "seen",
	).length

	const handleNextUnseen = (): void => {
		const next = artifacts.find(
			(a) => seen.state(kind, stageId, a.name, shaOf(a)) !== "seen",
		)
		if (!next) return
		setForceExpandName(next.name)
		setTimeout(() => {
			scrollAndFlash(`[data-artifact-card="${CSS.escape(next.name)}"]`)
		}, 40)
	}

	const label = kind === "knowledge" ? "Knowledge" : "Outputs"

	return (
		<>
			<SeenCounter
				label={label}
				total={artifacts.length}
				seenCount={seenCount}
				onNextUnseen={handleNextUnseen}
			/>
			<div className="space-y-3">
				{artifacts.map((a) => (
					<ArtifactCard
						key={a.name}
						kind={kind}
						artifact={a}
						feedback={feedbackByName.get(a.name) ?? []}
						state={seen.state(kind, stageId, a.name, shaOf(a))}
						onExpand={() => seen.markSeen(kind, stageId, a.name, shaOf(a))}
						startExpanded={forceExpandName === a.name}
					/>
				))}
			</div>
		</>
	)
}

function ArtifactCard({
	kind,
	artifact,
	feedback,
	state,
	onExpand,
	startExpanded,
}: {
	kind: "knowledge" | "output"
	artifact: ArtifactViewModel
	feedback: FeedbackItemData[]
	state: SeenState
	onExpand: () => void
	startExpanded?: boolean
}) {
	const [expanded, setExpanded] = useState(!!startExpanded)
	useEffect(() => {
		if (startExpanded) setExpanded(true)
	}, [startExpanded])
	const iconCls = kind === "knowledge" ? "text-sky-500" : "text-violet-500"
	const icon = kind === "knowledge" ? "\u{1F9E0}" : "\u{1F4E6}"
	const kindCls =
		KIND_BADGE[artifact.kind.toLowerCase()] ??
		"bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300 border-stone-200 dark:border-stone-700"

	const toggle = (): void => {
		const next = !expanded
		setExpanded(next)
		if (next) onExpand()
	}

	return (
		<div
			data-artifact-card={artifact.name}
			className={`bg-white dark:bg-stone-900 rounded-lg border-2 ${seenBorderClass(state)} overflow-hidden transition-colors`}
		>
			<button
				type="button"
				onClick={toggle}
				aria-expanded={expanded}
				className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
			>
				<span
					className={`shrink-0 ${iconCls} text-lg leading-none mt-0.5`}
					aria-hidden="true"
				>
					{icon}
				</span>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<span className="text-sm font-semibold text-stone-900 dark:text-stone-100 font-mono truncate">
							{artifact.name}
						</span>
						<StateBadge state={state} />
						<span
							className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border ${kindCls}`}
						>
							{artifact.kind}
						</span>
					</div>
					{artifact.summary && (
						<p
							className={`text-xs text-stone-600 dark:text-stone-300 leading-snug mt-1 ${expanded ? "" : "line-clamp-1"} break-words`}
						>
							{artifact.summary}
						</p>
					)}
				</div>
				<div className="shrink-0 flex items-center gap-2 mt-0.5">
					{feedback.length > 0 && (
						<span className="inline-flex items-center gap-0.5">
							{feedback.slice(0, 3).map((f, i) => (
								<span
									key={f.feedback_id}
									title={f.title}
									className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${feedbackBadgeColor(f.status)}`}
								>
									{i + 1}
								</span>
							))}
						</span>
					)}
					<svg
						className={`w-4 h-4 text-stone-500 transition-transform ${expanded ? "rotate-180" : ""}`}
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<title>expand</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</div>
			</button>
			{expanded && (
				<div className="border-t border-stone-200 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/50 px-4 py-3">
					{artifact.mime === "markdown" || artifact.mime === "text" ? (
						<MarkdownViewer id={`${kind}-${artifact.name}`}>
							{artifact.body}
						</MarkdownViewer>
					) : artifact.mime === "html" ? (
						// Agent-emitted HTML mockups/wireframes typically self-load
						// styling via <script src="cdn.tailwindcss.com"> — that
						// requires `allow-scripts`. We deliberately exclude
						// `allow-same-origin` so the iframe runs in an opaque
						// origin (no access to parent DOM, cookies, localStorage,
						// or same-origin fetches). This matches the canonical
						// mockup preview contract (review-ui-mockup.html §renderArtifactPreview).
						<iframe
							srcDoc={artifact.body}
							sandbox="allow-scripts"
							title={artifact.name}
							className="w-full h-96 border border-stone-200 dark:border-stone-800 rounded-md bg-white"
						/>
					) : artifact.mime === "svg" ? (
						<SvgPreview body={artifact.body} />
					) : (
						<pre className="text-xs font-mono text-stone-700 dark:text-stone-300 whitespace-pre-wrap bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-md p-3 max-h-80 overflow-auto">
							{artifact.body}
						</pre>
					)}
				</div>
			)}
		</div>
	)
}

function SvgPreview({ body }: { body: string }) {
	const safe = useMemo(
		() =>
			DOMPurify.sanitize(body, {
				USE_PROFILES: { svg: true, svgFilters: true },
			}),
		[body],
	)
	return (
		<div
			className="relative bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-md p-4 overflow-auto max-h-96"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: body is sanitized via DOMPurify with the svg profile — same contract as shared/section-helpers.ts::markdownToSimpleHtml.
			// audit-allow: DOMPurify-sanitized SVG render path
			dangerouslySetInnerHTML={{ __html: safe }}
		/>
	)
}

function CondensedArtifactRow({
	name,
	kind,
	feedback,
	iconKind,
	state,
	onClick,
}: {
	name: string
	kind: string
	feedback: FeedbackItemData[]
	iconKind: "knowledge" | "output"
	state: SeenState
	onClick?: () => void
}) {
	const iconCls = iconKind === "knowledge" ? "text-sky-500" : "text-violet-500"
	const icon = iconKind === "knowledge" ? "\u{1F9E0}" : "\u{1F4E6}"
	const kindCls =
		KIND_BADGE[kind.toLowerCase()] ??
		"bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300 border-stone-200 dark:border-stone-700"
	return (
		<button
			type="button"
			onClick={onClick}
			className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-50 dark:bg-stone-800/50 border ${seenBorderClass(state)} hover:border-teal-400 dark:hover:border-teal-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900`}
		>
			<span className={`shrink-0 ${iconCls}`} aria-hidden="true">
				{icon}
			</span>
			<span className="flex-1 min-w-0 text-xs font-mono text-stone-700 dark:text-stone-300 truncate">
				{name}
			</span>
			<StateBadge state={state} />
			<span
				className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border ${kindCls}`}
			>
				{kind}
			</span>
			{feedback.length > 0 && (
				<span
					className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${feedback[0].status === "pending" ? "bg-amber-500 text-white" : feedback[0].status === "addressed" ? "bg-blue-500 text-white" : "bg-stone-400 text-white"}`}
				>
					{feedback.length}
				</span>
			)}
		</button>
	)
}

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveStageSummary(
	session: ReviewPageSessionData,
	stageName: string,
): string | null {
	const summaries = (
		session as unknown as { stage_summaries?: Record<string, string> }
	).stage_summaries
	if (summaries && typeof summaries[stageName] === "string") {
		return summaries[stageName]
	}
	return null
}

function inferKind(filename: string): string {
	const lower = filename.toLowerCase()
	if (lower.endsWith(".svg")) return "diagram"
	if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
		return "image"
	if (lower.endsWith(".html")) return "wireframe"
	if (lower.endsWith(".pdf")) return "artifact"
	return "discovery"
}

function inferOutputKind(a: { name: string; type: string }): string {
	if (a.type === "image") return "image"
	if (a.type === "html") return "wireframe"
	return inferKind(a.name)
}

function inferMime(filename: string): string {
	const lower = filename.toLowerCase()
	if (lower.endsWith(".md")) return "markdown"
	if (lower.endsWith(".svg")) return "svg"
	if (lower.endsWith(".html")) return "html"
	if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
		return "image"
	if (lower.endsWith(".pdf")) return "pdf"
	return "text"
}

function firstLine(content: string): string {
	const trimmed = content.trim()
	if (!trimmed) return ""
	const line =
		trimmed.split("\n").find((l) => {
			const t = l.trim()
			return t && !t.startsWith("---")
		}) ?? ""
	return line.replace(/^#+\s*/, "").trim().slice(0, 200)
}
