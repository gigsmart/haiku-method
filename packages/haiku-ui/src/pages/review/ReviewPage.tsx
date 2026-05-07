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

import { MarkdownViewer } from "@haiku/shared"
import { useCallback, useEffect, useRef, useState } from "react"
import { Header as HeaderLandmark, Main } from "../../a11y"
import { ThemeToggle } from "../../atoms/ThemeToggle"
import { FeedbackProvider } from "../../hooks/FeedbackContext"
import { useFeedback } from "../../hooks/useFeedback"
import { DriftBanner, type DriftEntry } from "../../molecules/DriftBanner"
import { StageProgressStrip } from "../../molecules/StageProgressStrip"
import { SubmitSuccess } from "../../molecules/SubmitSuccess"
import type { AnnotationPin } from "../../organisms/AnnotationCanvas"
import { FeedbackFloatingButton } from "../../organisms/FeedbackFloatingButton"
import { FeedbackSheet } from "../../organisms/FeedbackSheet"
import type { InlineCommentEntry } from "../../organisms/InlineComments"
import type { ReviewAnnotations } from "../../types"
import { ArtifactsPane } from "./ArtifactsPane"
import { FeedbackPanelBody } from "./FeedbackPanelBody"
import { FeedbackSidebar } from "./FeedbackSidebar"
import { IntentDriftAssessmentsSection } from "./IntentDriftAssessmentsSection"
import { RereviewBanner } from "./shared/RereviewBanner"
import type { ReviewPageSessionData } from "./shared/session-data"
import type { ReviewDetailKind, ReviewTab } from "./shared/stage-tabs"
import { StageReview } from "./stage/StageReview"
import { useFeedbackSidebarController } from "./useFeedbackSidebarController"
import { useIsMobile } from "./useIsMobile"

export type { ReviewPageSessionData } from "./shared/session-data"

export interface ReviewPageProps {
	session: ReviewPageSessionData
	sessionId: string
	wsRef?: React.RefObject<WebSocket | null>
	/** Initial stage the stepper lands on. Defaults to the session's
	 *  active stage. Used by tests that want to mount the page at a
	 *  specific stage without going through the router. */
	initialStage?: string
	initialTab?: ReviewTab
	initialDetail?: { kind: ReviewDetailKind; name: string } | null
	initialViewingIntent?: boolean
}

function resolveActiveStage(session: ReviewPageSessionData): string | null {
	// v4: active stage = first stage NOT yet merged into intent main.
	// status field is gone; mergedIntoMain is the v4 authoritative
	// signal. Fallback to the legacy `status === "active"` check for
	// pre-migration sessions still in flight on a v3 backend.
	const stageStates = session.stage_states ?? {}
	const names = Object.keys(stageStates)
	const active = names.find((s) => {
		const ss = stageStates[s]
		if (!ss) return false
		// v4: first unmerged stage is active
		if (ss.mergedIntoMain === false) return true
		// v3 fallback
		if (ss.status === "active") return true
		return false
	})
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

function gateBadgeCopy(mode: GateMode): { label: string; classes: string } {
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
 * The workflow engine exposes `phase` on stage_state; we map it to the canonical
 * mockup's gate-phase nouns: "Final Review Gate" when the stage is at
 * its close-out review, "In Review" for mid-review, etc.
 */
// Canonical phase sequence inside a stage (excluding the implicit
// pre-elaborate seed state). Surfaced as a mini stepper in the banner
// so reviewers can see where the stage sits in its own lifecycle.
export const STAGE_PHASES = ["elaborate", "execute", "review", "gate"] as const

const PHASE_TOOLTIPS: Record<(typeof STAGE_PHASES)[number], string> = {
	elaborate: "Elaborate — specify the work (hats plan unit files)",
	execute: "Execute — hats land code and artifacts for each unit",
	review: "Review — adversarial agents + quality gates",
	gate: "Gate — final review checkpoint; human or external approval",
}

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
			classes: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
		}
	}
	return null
}

/**
 * Render a compact phase stepper inline with the stage banner so the
 * reviewer can see where the stage sits in its own lifecycle
 * (elaborate → execute → review → gate).
 */
function PhaseStepper({
	phase,
	stageStatus,
}: {
	phase: string | null
	stageStatus: string
}): React.ReactElement {
	const activeIndex = phase
		? STAGE_PHASES.indexOf(phase as (typeof STAGE_PHASES)[number])
		: -1
	const isStageComplete =
		stageStatus === "completed" || stageStatus === "complete"
	return (
		// biome-ignore lint/a11y/useSemanticElements: minimal grouping; fieldset/legend would impose form semantics
		<div
			className="inline-flex items-center gap-2"
			role="group"
			aria-label={`Phase ${activeIndex + 1} of ${STAGE_PHASES.length}`}
		>
			<span className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400 leading-none">
				Phase
			</span>
			<div className="inline-flex items-center gap-1">
				{STAGE_PHASES.map((p, i) => {
					const isActive = i === activeIndex && !isStageComplete
					const isDone = isStageComplete || activeIndex > i
					const tooltip = PHASE_TOOLTIPS[p]
					return (
						<div key={p} className="flex items-center gap-1" title={tooltip}>
							<span
								className={`inline-block w-2 h-2 rounded-full ${
									isActive
										? "bg-amber-500 ring-2 ring-amber-300 dark:ring-amber-700"
										: isDone
											? "bg-green-500"
											: "bg-stone-300 dark:bg-stone-700"
								}`}
								aria-hidden="true"
							/>
							{i < STAGE_PHASES.length - 1 && (
								<span
									className={`w-3 h-0.5 ${
										isDone
											? "bg-green-400 dark:bg-green-700"
											: "bg-stone-300 dark:bg-stone-700"
									}`}
									aria-hidden="true"
								/>
							)}
						</div>
					)
				})}
			</div>
			<span className="text-xs font-mono text-stone-500 dark:text-stone-400">
				{isStageComplete
					? "done"
					: activeIndex >= 0
						? `${activeIndex + 1}/${STAGE_PHASES.length}`
						: "—"}
			</span>
		</div>
	)
}

function MobileFeedbackSection(): React.ReactElement {
	const [sheetOpen, setSheetOpen] = useState(false)
	const fabRef = useRef<HTMLButtonElement>(null)
	const controller = useFeedbackSidebarController()
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
					onReply={controller.handleReply}
					busyIds={controller.busyIds}
					creating={controller.creating}
				/>
			</FeedbackSheet>
		</>
	)
}

export function ReviewPage({
	session,
	sessionId,
	wsRef,
	initialStage,
	initialTab,
	initialDetail,
	initialViewingIntent,
}: ReviewPageProps): React.ReactElement {
	const intentSlug = session.intent_slug ?? session.intent?.slug ?? null
	const activeStage = resolveActiveStage(session)
	const gateModes = resolveGateModes(session.gate_type)
	const gateBadges = gateModes.map(gateBadgeCopy)
	const isMobile = useIsMobile()

	// Stepper navigation — which stage's content the main pane is showing.
	// Defaults to the active stage (what the intent is currently on).
	const [selectedStage, setSelectedStage] = useState<string | null>(
		initialStage ?? activeStage,
	)
	// When true, the main pane shows an intent-scoped overview (intent.md
	// rendered + cross-stage summary) instead of a specific stage.
	const [viewingIntent, setViewingIntent] = useState(!!initialViewingIntent)
	// Stage-internal sub-state. In production the router owns these
	// (StageContent drives them from URL params); this component keeps
	// local copies so tests that render ReviewPage directly still work.
	const [stageTab, setStageTab] = useState<ReviewTab | undefined>(initialTab)
	const [stageDetail, setStageDetail] = useState<{
		kind: ReviewDetailKind
		name: string
	} | null>(initialDetail ?? null)

	const studioName =
		(session.intent?.frontmatter?.studio as string | undefined) ?? null

	// Feedback-card click → scroll-and-flash the target artifact card in
	// the main pane. One-shot: StageReview calls `onHighlightConsumed` to
	// clear it after the scroll is in flight.
	const [highlightFeedbackId, setHighlightFeedbackId] = useState<string | null>(
		null,
	)

	// After a successful Approve / External decision we render the
	// terminal success card and attempt to close the tab. MCP review
	// usually opens this via `window.open`, which permits programmatic
	// close; if it fails (standalone browser nav), we keep showing
	// `SubmitSuccess` so the user knows to close manually.
	const [submittedDecision, setSubmittedDecision] = useState<
		"approved" | "external" | null
	>(null)
	useEffect(() => {
		if (!submittedDecision) return
		// Give React a beat to render the success card before asking
		// the browser to close the tab.
		const id = setTimeout(() => {
			try {
				window.close()
			} catch {
				/* non-openable tab — SubmitSuccess stays visible */
			}
		}, 600)
		return () => clearTimeout(id)
	}, [submittedDecision])

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
				...(c.location ? { location: c.location } : {}),
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
			| {
					status?: string
					visits?: number
					pending_feedback?: number
					mergedIntoMain?: boolean
			  }
			| undefined
		// v4: derive a v3-compatible status string from mergedIntoMain.
		// merged → "completed"; not merged → "current" if first
		// unmerged, else "pending". Legacy v3 status field still wins
		// when present (server hasn't migrated this intent yet).
		const v3Status = state?.status
		const v4Status = (() => {
			if (state?.mergedIntoMain === true) return "completed"
			if (state?.mergedIntoMain === false) return "current"
			return "pending"
		})()
		const derivedStatus = v3Status
			? v3Status === "active"
				? "current"
				: v3Status
			: v4Status
		return {
			name,
			status: derivedStatus,
			visits: state?.visits ?? 0,
			pendingCount: state?.pending_feedback ?? 0,
		}
	})

	const isAdHoc = session.ad_hoc === true

	return (
		<FeedbackProvider intent={intentSlug} stage={selectedStage}>
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
							{studioName && (
								<>
									<span className="text-stone-300 dark:text-stone-600">·</span>
									<span className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
										{studioName}
									</span>
								</>
							)}
							{session.intent?.title && (
								<>
									<span className="text-stone-300 dark:text-stone-600">/</span>
									<button
										type="button"
										onClick={() => setViewingIntent(true)}
										className={`text-sm font-semibold truncate rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900 ${viewingIntent ? "text-teal-700 dark:text-teal-400 underline underline-offset-4" : "text-stone-800 dark:text-stone-100 hover:text-teal-700 dark:hover:text-teal-400"}`}
										title="View intent overview"
									>
										{session.intent.title}
									</button>
								</>
							)}
							{isAdHoc && (
								<>
									<span className="text-stone-300 dark:text-stone-600">·</span>
									<span
										className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800"
										title="Ad-hoc review — not a gate. Feedback routes through the normal fix-loop on the next run_next."
									>
										Ad-hoc review
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
							currentStage={activeStage ?? ""}
							viewingStage={
								viewingIntent ? "" : (selectedStage ?? activeStage ?? "")
							}
							onStageClick={(name) => {
								setSelectedStage(name)
								setViewingIntent(false)
								// Stepper clicks land on the stage overview — clear any
								// carry-over tab or detail so the URL matches the bare
								// `/review/:id/stages/:stage` form.
								setStageTab(undefined)
								setStageDetail(null)
							}}
						/>
					)}
				</HeaderLandmark>

				<div
					data-testid="review-split"
					className="flex-1 flex flex-col xl:flex-row overflow-hidden"
				>
					{!isMobile && (
						<FeedbackSidebar
							stage={selectedStage ?? activeStage}
							activeStage={activeStage}
							sessionId={sessionId}
							intentSlug={intentSlug ?? undefined}
							intentTitle={session.intent?.title}
							gateBadges={gateBadges}
							gateType={session.gate_type}
							approveAction={session.approve_action}
							awaitActive={session.await_active}
							pendingDecisionQueued={!!session.pending_decision}
							getAnnotations={getAnnotations}
							adHoc={isAdHoc}
							onFeedbackItemClick={(id) => setHighlightFeedbackId(id)}
							onDecisionSuccess={(decision) => {
								if (decision === "approved" || decision === "external") {
									setSubmittedDecision(decision)
								}
							}}
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
						{submittedDecision ? (
							<div className="px-6 lg:px-10 py-10">
								<SubmitSuccess
									message={
										submittedDecision === "approved"
											? "Review approved — thanks!"
											: "External review submitted — thanks!"
									}
								/>
							</div>
						) : viewingIntent ? (
							<IntentOverviewPane
								session={session}
								onBack={() => setViewingIntent(false)}
							/>
						) : (
							<>
								<StageBanner
									stageName={selectedStage ?? activeStage ?? "review"}
									stageStatus={(() => {
										if (selectedStage === activeStage) return "current"
										const ss = stageStates[selectedStage ?? ""] as
											| { status?: string; mergedIntoMain?: boolean }
											| undefined
										// v4: completion = mergedIntoMain. v3 fallback: status.
										if (ss?.mergedIntoMain === true) return "completed"
										return ss?.status ?? "pending"
									})()}
									stagePhase={stageStates[selectedStage ?? ""]?.phase ?? null}
									gateBadges={gateBadges}
									adHoc={isAdHoc}
								/>

								{/* Drift banner — sticky strip between StageBanner and
								    RereviewBanner per SPA-UI-SPECS §3. Renders nothing
								    when `drift` is empty (DriftBanner returns null
								    internally), so the integration is safe even before
								    the WS plumbing that pushes drift entries lands. The
								    drift entries themselves come from the existing
								    `manual_change_assessment` action's findings via
								    the WS bridge — wiring `drift` to that feed is the
								    next iteration's work. */}
								<DriftBanner drift={[] as DriftEntry[]} />

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
										stageTab={stageTab}
										stageDetail={stageDetail}
										onStageTabChange={setStageTab}
										onStageDetailChange={setStageDetail}
									/>
								</div>
							</>
						)}
					</Main>
				</div>

				{isMobile && <MobileFeedbackSection />}
			</div>
		</FeedbackProvider>
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
	gateBadges,
	adHoc,
}: {
	stageName: string
	stageStatus: string
	stagePhase: string | null
	gateBadges: Array<{ label: string; classes: string }>
	/** Ad-hoc panes are not gate reviews — suppress the gate-context
	 *  badges and render an "Ad-hoc" pill instead so the user can see
	 *  at a glance that this surface won't advance the workflow. */
	adHoc?: boolean
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
					<div className="flex items-center gap-3 flex-wrap">
						<p className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400 leading-none">
							Stage
						</p>
						<PhaseStepper phase={stagePhase} stageStatus={stageStatus} />
					</div>
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
						{adHoc ? (
							<span
								className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800"
								title="Ad-hoc review — not a gate. Feedback routes through the normal fix-loop on the next run_next."
							>
								Ad-hoc
							</span>
						) : (
							gateBadges.map((b) => (
								<span
									key={b.label}
									className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${b.classes}`}
								>
									{b.label}
								</span>
							))
						)}
					</div>
				</div>
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
	stageTab,
	stageDetail,
	onStageTabChange,
	onStageDetailChange,
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
	stageTab: ReviewTab | undefined
	stageDetail: { kind: ReviewDetailKind; name: string } | null
	onStageTabChange: (tab: ReviewTab | undefined) => void
	onStageDetailChange: (
		detail: { kind: ReviewDetailKind; name: string } | null,
	) => void
}): React.ReactElement {
	// All feedback for this intent+stage (fetched once per stage).
	const { items: stageFeedback } = useFeedback(intentSlug, stageName)

	if (!stageName) {
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
			intentSlug={intentSlug}
			stageName={stageName}
			feedback={stageFeedback}
			onHighlightRequestId={highlightFeedbackId}
			onHighlightConsumed={onHighlightConsumed}
			tab={stageTab}
			detail={stageDetail}
			onTabChange={onStageTabChange}
			onDetailChange={onStageDetailChange}
			onInlineCommentsChange={onInlineCommentsChange}
		/>
	)
}

/**
 * IntentOverviewPane — cross-stage intent detail view. Renders the
 * intent.md markdown (problem / solution / goals) plus a quick-jump
 * strip into each stage. Opened from the header breadcrumb.
 */
function IntentOverviewPane({
	session,
	onBack,
}: {
	session: ReviewPageSessionData
	onBack: () => void
}): React.ReactElement {
	const intent = session.intent
	const stageStates = session.stage_states ?? {}
	const intentStageOrder =
		(intent?.frontmatter?.stages as string[] | undefined) ?? []
	const stageNames =
		intentStageOrder.length > 0
			? intentStageOrder.filter((s) => stageStates[s])
			: Object.keys(stageStates)
	const units = session.units ?? []
	const stageArtifacts = session.stage_artifacts ?? []
	const outputArtifacts = session.output_artifacts ?? []

	return (
		<>
			<div className="sticky top-0 z-20 bg-stone-50 dark:bg-stone-950 px-6 lg:px-10 pt-6 pb-3">
				<div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-teal-200 dark:border-teal-900/60 bg-teal-50 dark:bg-teal-900/20">
					<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-700 text-white">
						intent
					</span>
					<div className="flex-1 min-w-0">
						<p className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400 leading-none">
							Intent
						</p>
						<h1 className="text-base font-bold text-stone-900 dark:text-stone-100 leading-tight break-words mt-1">
							{intent?.title ?? "Intent"}
						</h1>
					</div>
					<button
						type="button"
						onClick={onBack}
						className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900"
					>
						← Back to Stage
					</button>
				</div>
			</div>
			<div className="px-6 lg:px-10 pb-6 space-y-4">
				{stageNames.length > 0 && (
					<div className="bg-white dark:bg-stone-900 rounded-lg border-2 border-stone-200 dark:border-stone-700 px-5 py-4">
						<p className="text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-500 mb-3">
							Cross-stage summary
						</p>
						<div className="overflow-x-auto">
							<table className="w-full text-left text-xs">
								<thead>
									<tr className="border-b-2 border-stone-200 dark:border-stone-700">
										<th className="py-2 pr-3 text-stone-600 dark:text-stone-300 uppercase tracking-wider">
											Stage
										</th>
										<th className="py-2 pr-3 text-stone-600 dark:text-stone-300 uppercase tracking-wider">
											Status
										</th>
										<th className="py-2 pr-3 text-stone-600 dark:text-stone-300 uppercase tracking-wider">
											Phase
										</th>
										<th className="py-2 pr-3 text-stone-600 dark:text-stone-300 uppercase tracking-wider text-right">
											Units
										</th>
										<th className="py-2 pr-3 text-stone-600 dark:text-stone-300 uppercase tracking-wider text-right">
											Knowledge
										</th>
										<th className="py-2 text-stone-600 dark:text-stone-300 uppercase tracking-wider text-right">
											Outputs
										</th>
									</tr>
								</thead>
								<tbody>
									{stageNames.map((name) => {
										const s = stageStates[name] as
											| {
													status?: string
													phase?: string
													mergedIntoMain?: boolean
											  }
											| undefined
										const unitCount = units.filter(
											(u) => (u.frontmatter.stage ?? "") === name,
										).length
										const knowledgeCount = stageArtifacts.filter(
											(a) => a.stage === name,
										).length
										const outputCount = outputArtifacts.filter(
											(a) => a.stage === name,
										).length
										// v4: derive a v3-compatible status string from
										// mergedIntoMain. v3 fallback: explicit status.
										const displayStatus = (() => {
											if (s?.mergedIntoMain === true) return "completed"
											if (s?.status) return s.status
											if (s?.mergedIntoMain === false) return "active"
											return undefined
										})()
										const statusColor =
											displayStatus === "active"
												? "text-teal-600 dark:text-teal-400"
												: displayStatus === "completed"
													? "text-green-600 dark:text-green-400"
													: "text-stone-500 dark:text-stone-400"
										return (
											<tr
												key={name}
												className="border-b border-stone-100 dark:border-stone-800"
											>
												<td className="py-2.5 pr-3 font-semibold capitalize text-stone-900 dark:text-stone-100">
													{name}
												</td>
												<td className={`py-2.5 pr-3 font-mono ${statusColor}`}>
													{displayStatus ?? "—"}
												</td>
												<td className="py-2.5 pr-3 font-mono text-stone-600 dark:text-stone-300">
													{s?.phase ?? "—"}
												</td>
												<td className="py-2.5 pr-3 text-right font-mono text-stone-600 dark:text-stone-300">
													{unitCount}
												</td>
												<td className="py-2.5 pr-3 text-right font-mono text-stone-600 dark:text-stone-300">
													{knowledgeCount}
												</td>
												<td className="py-2.5 text-right font-mono text-stone-600 dark:text-stone-300">
													{outputCount}
												</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					</div>
				)}

				<div className="bg-white dark:bg-stone-900 rounded-lg border-2 border-stone-200 dark:border-stone-700 px-5 py-4">
					<p className="text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-500 mb-3">
						Intent definition
					</p>
					{intent?.rawContent ? (
						<MarkdownViewer id="intent-detail">
							{intent.rawContent}
						</MarkdownViewer>
					) : (
						<p className="text-sm text-stone-500 dark:text-stone-400 italic">
							No intent content available.
						</p>
					)}
				</div>

				{/* Drift assessments — intent-scope drift history (per
				    SPA-UI-SPECS §4). Renders after the intent-definition
				    block. Hooks the existing
				    `GET /api/intents/:intent/assessments` endpoint
				    (assessments-routes.ts) on mount; the view's empty state
				    is rendered until the fetch resolves or when no drift
				    has been classified yet. */}
				{intent?.slug && (
					<IntentDriftAssessmentsSection intentSlug={intent.slug} />
				)}
			</div>
		</>
	)
}
