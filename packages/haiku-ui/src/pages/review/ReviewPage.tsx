/**
 * ReviewPage — full-bleed review shell per canonical design mockup
 * (`stages/design/artifacts/review-ui-mockup.html`).
 *
 * Structure:
 *   <div.h-screen.flex-col>
 *     <header>                        — H·AI·K·U branding + session id + theme toggle
 *     <StageProgressStrip />          — centered stepper with pending badges
 *     <div.flex-1.flex.overflow-hidden>
 *       <FeedbackSidebar />           — LEFT, full-height scroll, composer + actions at bottom
 *       <main.flex-1.overflow-y-auto> — stage banner + artifact cards
 *
 * Mobile (<xl): sidebar collapses into a FAB + Sheet; main fills the
 * viewport.
 *
 * The page owns the full viewport — it does NOT live inside ShellLayout's
 * max-width container. App.tsx renders it directly.
 */

import { useCallback, useRef, useState } from "react"
import { Header as HeaderLandmark, Main } from "../../a11y"
import type { AnnotationPin } from "../../components/AnnotationCanvas"
import {
	FeedbackFloatingButton,
	FeedbackSheet,
} from "../../components/feedback"
import type { InlineCommentEntry } from "../../components/InlineComments"
import { StageProgressStrip } from "../../components/StageProgressStrip"
import { ThemeToggle } from "../../components/ThemeToggle"
import { useFeedback } from "../../hooks/useFeedback"
import type { ReviewAnnotations } from "../../types"
import { ArtifactsPane } from "./ArtifactsPane"
import { FeedbackPanelBody } from "./FeedbackPanelBody"
import { FeedbackSidebar } from "./FeedbackSidebar"
import { RereviewBanner } from "./shared/RereviewBanner"
import type { ReviewPageSessionData } from "./shared/session-data"
import { StageReview } from "./stage/StageReview"
import { useFeedbackSidebarController } from "./useFeedbackSidebarController"
import { useIsMobile } from "./useIsMobile"

export type { ReviewPageSessionData } from "./shared/session-data"

export interface ReviewPageProps {
	session: ReviewPageSessionData
	sessionId: string
	wsRef?: React.RefObject<WebSocket | null>
}

function resolveActiveStage(session: ReviewPageSessionData): string | null {
	const stageStates = session.stage_states ?? {}
	const names = Object.keys(stageStates)
	const active = names.find((s) => stageStates[s]?.status === "active")
	return active ?? names[0] ?? null
}

export type GateMode = "ask" | "external" | "auto" | "await"

/**
 * Parse the raw `gate_type` string into the ordered list of review
 * mechanisms the gate accepts. H·AI·K·U encodes compound gates as
 * comma-separated tokens (see orchestrator.ts — "external,ask" means
 * either a merged PR OR a local approval satisfies the gate). We
 * preserve order so the banner reads in the same order the stage
 * author wrote them in STAGE.md.
 */
function resolveGateModes(gate: string | undefined): GateMode[] {
	if (!gate) return ["auto"]
	const tokens = gate
		.split(",")
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean)
	const modes: GateMode[] = []
	for (const t of tokens) {
		if (t === "ask" || t === "external" || t === "auto" || t === "await") {
			if (!modes.includes(t)) modes.push(t)
		}
	}
	return modes.length > 0 ? modes : ["auto"]
}

function gateBadgeCopy(
	mode: GateMode,
): { label: string; classes: string } {
	switch (mode) {
		case "ask":
			return {
				label: "Local Review",
				classes:
					"bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
			}
		case "external":
			return {
				label: "External Review",
				classes:
					"bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
			}
		case "await":
			return {
				label: "Awaits Event",
				classes:
					"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
			}
		default:
			return {
				label: "Auto Gate",
				classes:
					"bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
			}
	}
}

/**
 * Derive the "what phase/gate is active for this stage right now" label.
 * The FSM exposes `phase` on stage_state; we map it to the canonical
 * mockup's gate-phase nouns: "Final Review Gate" when the stage is at
 * its close-out review, "In Review" for mid-review, etc.
 */
function phaseBadgeCopy(
	phase: string | undefined,
	stageStatus: string | undefined,
): { label: string; classes: string } | null {
	if (stageStatus === "completed") {
		return {
			label: "All Gates Closed",
			classes:
				"bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
		}
	}
	if (phase === "gate") {
		return {
			label: "Final Review Gate",
			classes:
				"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-300 dark:border-amber-700",
		}
	}
	if (phase === "review") {
		return {
			label: "In Review",
			classes:
				"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
		}
	}
	if (phase === "execute") {
		return {
			label: "Executing",
			classes:
				"bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
		}
	}
	if (phase === "elaborate") {
		return {
			label: "Elaborating",
			classes:
				"bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
		}
	}
	return null
}

function MobileFeedbackSection({
	intentSlug,
	activeStage,
}: {
	intentSlug: string | null
	activeStage: string | null
}): React.ReactElement {
	const [sheetOpen, setSheetOpen] = useState(false)
	const fabRef = useRef<HTMLButtonElement>(null)
	const controller = useFeedbackSidebarController(intentSlug, activeStage)
	const pendingCount = controller.items.filter(
		(item) => item.status === "pending",
	).length
	return (
		<>
			<FeedbackFloatingButton
				ref={fabRef}
				open={sheetOpen}
				onToggle={() => setSheetOpen((o) => !o)}
				count={pendingCount}
			/>
			<FeedbackSheet
				open={sheetOpen}
				onClose={() => setSheetOpen(false)}
				triggerRef={fabRef}
			>
				<FeedbackPanelBody
					items={controller.items}
					loading={controller.loading}
					error={controller.error}
					onStatusChange={controller.handleStatusChange}
					onDelete={controller.handleDelete}
					onRetry={controller.retry}
				/>
			</FeedbackSheet>
		</>
	)
}

export function ReviewPage({
	session,
	sessionId,
	wsRef,
}: ReviewPageProps): React.ReactElement {
	const intentSlug = session.intent_slug ?? session.intent?.slug ?? null
	const activeStage = resolveActiveStage(session)
	const gateModes = resolveGateModes(session.gate_type)
	const gateBadges = gateModes.map(gateBadgeCopy)
	const isMobile = useIsMobile()

	// Stepper navigation — which stage's content the main pane is showing.
	// Defaults to the active stage (what the intent is currently on); the
	// header stepper lets reviewers jump to any visited stage.
	const [selectedStage, setSelectedStage] = useState<string | null>(
		activeStage,
	)

	// Feedback-card click → scroll-and-flash the target artifact card in
	// the main pane. One-shot: StageReview calls `onHighlightConsumed` to
	// clear it after the scroll is in flight.
	const [highlightFeedbackId, setHighlightFeedbackId] = useState<string | null>(
		null,
	)

	const [inlineComments, setInlineComments] = useState<InlineCommentEntry[]>([])
	const [pins, setPins] = useState<AnnotationPin[]>([])

	const getAnnotations = useCallback((): ReviewAnnotations | undefined => {
		const hasAny = pins.length > 0 || inlineComments.length > 0
		if (!hasAny) return undefined
		const annotations: ReviewAnnotations = {}
		if (pins.length > 0) {
			annotations.pins = pins.map((p) => ({
				x: Math.round(p.x * 100) / 100,
				y: Math.round(p.y * 100) / 100,
				text: p.text,
			}))
		}
		if (inlineComments.length > 0) {
			annotations.comments = inlineComments.map((c) => ({
				selectedText: c.selectedText,
				comment: c.comment,
				paragraph: c.paragraph,
			}))
		}
		return annotations
	}, [pins, inlineComments])

	const stageStates = session.stage_states ?? {}
	const intentStageOrder =
		(session.intent?.frontmatter?.stages as string[] | undefined) ?? []
	const stageStateKeys = Object.keys(stageStates)
	const orderedStageNames =
		intentStageOrder.length > 0
			? intentStageOrder.filter((s) => stageStateKeys.includes(s))
			: stageStateKeys
	const stageProgressData = orderedStageNames.map((name) => {
		const state = stageStates[name] as
			| { status?: string; visits?: number; pending_feedback?: number }
			| undefined
		return {
			name,
			status:
				state?.status === "active"
					? "current"
					: (state?.status ?? "pending"),
			visits: state?.visits ?? 0,
			pendingCount: state?.pending_feedback ?? 0,
		}
	})

	const sessionIdShort = sessionId ? sessionId.slice(0, 8) : ""

	return (
		<div
			data-testid="review-page-ready"
			className="h-screen overflow-hidden flex flex-col bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100"
		>
			<HeaderLandmark className="shrink-0 z-40 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm border-b border-stone-200 dark:border-stone-800">
				<div className="px-4 sm:px-6 py-3 flex items-center justify-between border-b border-stone-100 dark:border-stone-800/60">
					<div className="flex items-center gap-3 min-w-0">
						<span className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-100">
							H·AI·K·U
						</span>
						<span className="text-stone-300 dark:text-stone-600">|</span>
						<span className="text-sm font-medium text-stone-500 dark:text-stone-400">
							Review
						</span>
						{sessionIdShort && (
							<>
								<span className="text-stone-300 dark:text-stone-600">·</span>
								<span className="text-[11px] font-mono text-stone-500 dark:text-stone-500">
									session <span>{sessionIdShort}</span>
								</span>
							</>
						)}
					</div>
					<div className="flex items-center gap-2 shrink-0">
						<ThemeToggle />
					</div>
				</div>
				{stageProgressData.length > 0 && (
					<StageProgressStrip
						stages={stageProgressData}
						currentStage={selectedStage ?? activeStage ?? ""}
						onStageClick={(name) => setSelectedStage(name)}
					/>
				)}
			</HeaderLandmark>

			<div
				data-testid="review-split"
				className="flex-1 flex flex-col xl:flex-row overflow-hidden"
			>
				{!isMobile && (
					<FeedbackSidebar
						intent={intentSlug}
						stage={selectedStage ?? activeStage}
						activeStage={activeStage}
						sessionId={sessionId}
						intentTitle={session.intent?.title}
						gateBadges={gateBadges}
						gateType={session.gate_type}
						getAnnotations={getAnnotations}
						onFeedbackItemClick={(id) => setHighlightFeedbackId(id)}
					/>
				)}
				<Main
					ariaLabel="Review content"
					className="flex-1 min-w-0 overflow-y-auto"
					style={
						{
							// Tabs.tsx sticks its tablist at top:var(--header-height).
							// Inside main's scroll container, that offset must match the
							// sticky stage banner above, not the global shell header.
							"--header-height": "5.5rem",
						} as React.CSSProperties
					}
				>
					<StageBanner
						stageName={selectedStage ?? activeStage ?? "review"}
						stageStatus={
							selectedStage === activeStage
								? "current"
								: (stageStates[selectedStage ?? ""]?.status ?? "pending")
						}
						stagePhase={
							stageStates[selectedStage ?? ""]?.phase ?? null
						}
						intentTitle={session.intent?.title}
						gateBadges={gateBadges}
					/>

					<div className="px-6 lg:px-10 pb-6">
						{session.previous_review && (
							<RereviewBanner snapshot={session.previous_review} />
						)}
						<StageScopedContent
							session={session}
							sessionId={sessionId}
							stageName={selectedStage ?? activeStage}
							intentSlug={intentSlug}
							getAnnotations={getAnnotations}
							wsRef={wsRef}
							onInlineCommentsChange={setInlineComments}
							onPinsChange={setPins}
							highlightFeedbackId={highlightFeedbackId}
							onHighlightConsumed={() => setHighlightFeedbackId(null)}
						/>
					</div>
				</Main>
			</div>

			{isMobile && (
				<MobileFeedbackSection
					intentSlug={intentSlug}
					activeStage={activeStage}
				/>
			)}
		</div>
	)
}

/**
 * StageBanner — sticky top-of-main banner showing the selected stage's
 * status, name, gate, and the intent title. Updates as the reviewer
 * clicks through the stepper.
 */
function StageBanner({
	stageName,
	stageStatus,
	stagePhase,
	intentTitle,
	gateBadges,
}: {
	stageName: string
	stageStatus: string
	stagePhase: string | null
	intentTitle?: string
	gateBadges: Array<{ label: string; classes: string }>
}): React.ReactElement {
	const statusPill =
		stageStatus === "current" || stageStatus === "active"
			? {
					bannerClasses:
						"border-teal-200 dark:border-teal-900/60 bg-teal-50 dark:bg-teal-900/20",
					pillClasses: "bg-teal-700 text-white",
					label: "current",
				}
			: stageStatus === "completed" || stageStatus === "complete"
				? {
						bannerClasses:
							"border-green-200 dark:border-green-900/60 bg-green-50 dark:bg-green-900/20",
						pillClasses: "bg-green-700 text-white",
						label: "complete",
					}
				: {
						bannerClasses:
							"border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40",
						pillClasses: "bg-stone-600 text-white",
						label: "upcoming",
					}
	const phasePill = phaseBadgeCopy(stagePhase ?? undefined, stageStatus)
	return (
		<div
			data-testid="review-stage-banner"
			className="sticky top-0 z-20 bg-stone-50 dark:bg-stone-950 px-6 lg:px-10 pt-6 pb-3"
		>
			<div
				className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${statusPill.bannerClasses}`}
			>
				<span
					className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusPill.pillClasses}`}
				>
					{statusPill.label}
				</span>
				<div className="flex-1 min-w-0">
					<p className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400 leading-none">
						Stage
					</p>
					<div className="flex items-center gap-2 mt-1 flex-wrap">
						<h1 className="text-base font-bold text-stone-900 dark:text-stone-100 leading-tight capitalize">
							{stageName}
						</h1>
						{phasePill && (
							<span
								className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${phasePill.classes}`}
							>
								{phasePill.label}
							</span>
						)}
						{gateBadges.map((b) => (
							<span
								key={b.label}
								className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${b.classes}`}
							>
								{b.label}
							</span>
						))}
					</div>
				</div>
				{intentTitle && (
					<p className="hidden sm:block text-xs text-stone-500 dark:text-stone-400 max-w-sm leading-snug">
						{intentTitle}
					</p>
				)}
			</div>
		</div>
	)
}

/**
 * StageScopedContent — dispatches to StageReview when a stage is selected,
 * falls back to the intent-scoped ArtifactsPane when there is no stage
 * (e.g. unit reviews or pre-stage state).
 */
function StageScopedContent({
	session,
	sessionId,
	stageName,
	intentSlug,
	getAnnotations,
	wsRef,
	onInlineCommentsChange,
	onPinsChange,
	highlightFeedbackId,
	onHighlightConsumed,
}: {
	session: ReviewPageSessionData
	sessionId: string
	stageName: string | null
	intentSlug: string | null
	getAnnotations: () => ReviewAnnotations | undefined
	wsRef?: React.RefObject<WebSocket | null>
	onInlineCommentsChange: (comments: InlineCommentEntry[]) => void
	onPinsChange: (pins: AnnotationPin[]) => void
	highlightFeedbackId: string | null
	onHighlightConsumed: () => void
}): React.ReactElement {
	// All feedback for this intent+stage (fetched once per stage).
	const { items: stageFeedback } = useFeedback(intentSlug, stageName)

	const isUnitReview = session.review_type === "unit" && !!session.target
	if (isUnitReview || !stageName) {
		return (
			<ArtifactsPane
				session={session}
				sessionId={sessionId}
				getAnnotations={getAnnotations}
				wsRef={wsRef}
				onInlineCommentsChange={onInlineCommentsChange}
				onPinsChange={onPinsChange}
			/>
		)
	}
	return (
		<StageReview
			session={session}
			sessionId={sessionId}
			stageName={stageName}
			feedback={stageFeedback}
			onHighlightRequestId={highlightFeedbackId}
			onHighlightConsumed={onHighlightConsumed}
		/>
	)
}
