/**
 * /review/:sessionId — layout route for the full-bleed review shell per
 * the canonical mockup (`stages/design/artifacts/review-ui-mockup.html`).
 *
 * Owns:
 *   - `useSession` fetch + `useSessionWebSocket` subscription (per-session
 *     lifecycle). Loading + error + session-type-mismatch states render
 *     here so child routes see a narrowed session.
 *   - Document title sync + publishing the sessionId on the ApiClient
 *     for display + WebSocket binding. (Mutations authenticate via the
 *     tunnel-auth JWT — the server reads the session from the `sid`
 *     claim; no `X-Haiku-Session-Id` header is sent or required.)
 *   - The viewport layout (header + stage-progress strip + sidebar +
 *     main). Main content is driven by the child route via `<Outlet/>`.
 *   - Shared ephemeral state (highlight request, annotation scratchpad,
 *     decision-submitted flag) exposed to children via ReviewRouteContext.
 *
 * Child routes:
 *   - `./index.tsx`                               — redirects to the active stage
 *   - `./intent.tsx`                              — intent overview pane
 *   - `./stages/$stage/route.tsx`                 — stage layout
 *   - `./stages/$stage/index.tsx`                 — overview tab
 *   - `./stages/$stage/$tab.tsx`                  — units | knowledge | outputs
 *   - `./stages/$stage/$kind/$name.tsx`           — artifact detail
 */

import {
	createFileRoute,
	Outlet,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router"
import type { ReviewSessionPayload } from "haiku-api"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Header as HeaderLandmark, Main } from "../../../a11y"
import { useApiClient } from "../../../api/context"
import { ThemeToggle } from "../../../atoms/ThemeToggle"
import { FeedbackProvider } from "../../../hooks/FeedbackContext"
import { useSession, useSessionWebSocket } from "../../../hooks/useSession"
import { SessionEndedOverlay } from "../../../molecules/SessionEndedOverlay"
import { StageProgressStrip } from "../../../molecules/StageProgressStrip"
import { SubmitSuccess } from "../../../molecules/SubmitSuccess"
import type { AnnotationPin } from "../../../organisms/AnnotationCanvas"
import { FeedbackFloatingButton } from "../../../organisms/FeedbackFloatingButton"
import { FeedbackSheet } from "../../../organisms/FeedbackSheet"
import type { InlineCommentEntry } from "../../../organisms/InlineComments"
import { FeedbackPanelBody } from "../../../pages/review/FeedbackPanelBody"
import { FeedbackSidebar } from "../../../pages/review/FeedbackSidebar"
import { IntentCompleteView } from "../../../pages/review/IntentCompleteView"
import type { ReviewPageSessionData } from "../../../pages/review/shared/session-data"
import { useFeedbackSidebarController } from "../../../pages/review/useFeedbackSidebarController"
import { useIsMobile } from "../../../pages/review/useIsMobile"
import { usePageTitle } from "../../../shell/PageTitleContext"
import type { ReviewAnnotations } from "../../../types"
import { type ReviewRouteContextValue, ReviewRouteProvider } from "./-context"
import {
	gateBadgeCopy,
	resolveActiveStage,
	resolveGateModes,
} from "./-review-helpers"

function asReviewPageSession(
	session: ReviewSessionPayload,
): ReviewPageSessionData {
	return session as unknown as ReviewPageSessionData
}

function LoadingState({ message }: { message: string }) {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<div className="text-center">
				<div className="mb-3 h-8 w-8 mx-auto animate-spin rounded-full border-2 border-stone-300 border-t-teal-500" />
				<p className="text-sm text-stone-600 dark:text-stone-300">{message}</p>
			</div>
		</div>
	)
}

function ErrorState({ error }: { error: string | null }) {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<div className="text-center">
				<p className="text-lg font-semibold text-red-600 dark:text-red-400">
					Session not found
				</p>
				<p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
					{error || "The session may have expired."}
				</p>
			</div>
		</div>
	)
}

function MobileFeedbackSection(): React.ReactElement {
	const [sheetOpen, setSheetOpen] = useState(false)
	const fabRef = useFabRef()
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

function useFabRef() {
	return useRef<HTMLButtonElement>(null)
}

function ReviewLayout(): React.ReactElement {
	const { sessionId } = Route.useParams()
	const { session, loading, error, notFound, refetch } = useSession(sessionId)
	const [sessionEnded, setSessionEnded] = useState(false)
	// Per-intent live-state events arrive over the WS as the workflow
	// engine ticks, gates open/close, awaits flip on/off, and decisions
	// queue. The simplest correct response is to re-pull the full
	// session snapshot — the API projects from disk + memory and is
	// authoritative. Debounce to coalesce bursts (a single tick can
	// fan out 2-3 events: gate_prepared + await_state_changed +
	// pending_decision_changed).
	const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	useEffect(
		() => () => {
			if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
		},
		[],
	)
	const wsRef = useSessionWebSocket(sessionId, {
		onServerClose: () => setSessionEnded(true),
		onIntentEvent: () => {
			if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
			refetchTimerRef.current = setTimeout(() => {
				refetchTimerRef.current = null
				refetch()
			}, 250)
		},
	})
	const apiClient = useApiClient()

	// Publish sessionId to the shared ApiClient so `getSessionId()` is
	// available to callers that need it for display, WS channel binding,
	// or other session-scoped lookups. Feedback mutations no longer
	// depend on this — the server authenticates them via the tunnel JWT
	// (`sid` claim). This setter is retained for non-auth callers that
	// still need to know which session the UI is rendering.
	useEffect(() => {
		apiClient.setSessionId(sessionId)
		return () => {
			apiClient.setSessionId(null)
		}
	}, [apiClient, sessionId])

	const dynamicTitle =
		session && session.session_type === "review" && session.intent?.title
			? `Review: ${session.intent.title}`
			: null
	usePageTitle(dynamicTitle)
	useEffect(() => {
		if (dynamicTitle) document.title = dynamicTitle
	}, [dynamicTitle])

	// Session-ended terminal state wins over everything else:
	//   - `sessionEnded` — WS closed mid-review (or poll detected 404)
	//   - `notFound`     — reload of a stale tab; server no longer has
	//                      the session (MCP restarted, TTL evicted, etc.)
	// In both cases the page is read-only and the reviewer should get
	// the dismiss-and-close overlay rather than the raw error surface.
	if (sessionEnded || notFound) {
		return (
			<SessionEndedOverlay
				reason={
					notFound
						? "This review session no longer exists — it may have already been decided or expired."
						: undefined
				}
			/>
		)
	}

	if (loading) return <LoadingState message="Loading session..." />
	if (error || !session) return <ErrorState error={error} />
	if (session.session_type !== "review") {
		return <ErrorState error="Session type mismatch (expected review)." />
	}

	// From here on the session is narrowed; hand off to the concrete
	// layout component so its hooks can safely depend on session fields.
	return (
		<ReviewLayoutLoaded
			sessionId={sessionId}
			session={asReviewPageSession(session)}
			wsRef={wsRef}
		/>
	)
}

function ReviewLayoutLoaded({
	sessionId,
	session,
	wsRef,
}: {
	sessionId: string
	session: ReviewPageSessionData
	wsRef: React.RefObject<WebSocket | null>
}): React.ReactElement {
	const navigate = useNavigate()
	const routerState = useRouterState()

	// After a successful Approve / External decision render the terminal
	// success card + try to close the tab. MCP review usually opens via
	// `window.open`, which permits programmatic close; if it fails
	// (standalone nav), keep showing SubmitSuccess.
	const [submittedDecision, setSubmittedDecision] = useState<
		"approved" | "external" | null
	>(null)
	useEffect(() => {
		if (!submittedDecision) return
		const id = setTimeout(() => {
			try {
				window.close()
			} catch {
				/* non-openable tab — SubmitSuccess stays visible */
			}
		}, 600)
		return () => clearTimeout(id)
	}, [submittedDecision])

	const [highlightFeedbackId, setHighlightFeedbackId] = useState<string | null>(
		null,
	)
	const [pendingFlashAnchor, setPendingFlashAnchor] = useState<{
		commentId?: string
		selectedText: string
		paragraph?: number
	} | null>(null)
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

	const isMobile = useIsMobile()

	const intentSlug = session.intent_slug ?? session.intent?.slug ?? null
	const activeStage = resolveActiveStage(session)
	const gateModes = resolveGateModes(session.gate_type)
	const gateBadges = gateModes.map(gateBadgeCopy)
	const studioName =
		(session.intent?.frontmatter?.studio as string | undefined) ?? null
	const isAdHoc = (session as { ad_hoc?: boolean }).ad_hoc === true

	// Which stage is in focus + whether the intent overview is active are
	// both derived from the URL. The current location's pathname decides;
	// child routes own the bindings, we only need them here for the
	// header / stepper / sidebar.
	const path = routerState.location.pathname
	const viewingIntent = path.endsWith(`/review/${sessionId}/intent`)
	const stageMatch = path.match(/\/review\/[^/]+\/stages\/([^/]+)/)
	const selectedStage = stageMatch?.[1] ?? activeStage

	const stageStates = session.stage_states ?? {}
	const intentStageOrder =
		(session.intent?.frontmatter?.stages as string[] | undefined) ?? []
	const stageStateKeys = Object.keys(stageStates)
	// Show every stage in the studio's ordered list, even ones that
	// haven't started yet — the stepper conveys "where we are in the
	// whole pipeline," and hiding future stages makes a 5-stage flow
	// look like a 1-stage flow until the user reaches the end. Stages
	// with no state are rendered as `pending`. When the intent doesn't
	// declare a stage list (legacy / repair), fall back to the started
	// set so we show *something*.
	const orderedStageNames =
		intentStageOrder.length > 0 ? intentStageOrder : stageStateKeys
	const stageProgressData = orderedStageNames.map((name) => {
		const state = stageStates[name] as
			| { status?: string; visits?: number; pending_feedback?: number }
			| undefined
		return {
			name,
			status:
				state?.status === "active" ? "current" : (state?.status ?? "pending"),
			visits: state?.visits ?? 0,
			pendingCount: state?.pending_feedback ?? 0,
		}
	})

	// Intent-terminal detection: when intent is in
	// `awaiting_completion_review` or `status: completed`, the per-stage
	// review pane has nothing meaningful to render (every stage is done;
	// no "current" stage). Render IntentCompleteView instead. The merge
	// into mainline is the only remaining action.
	const intentFm = session.intent?.frontmatter
	const intentStatus = (intentFm?.status as string | undefined) ?? ""
	const intentPhase = (intentFm?.phase as string | undefined) ?? ""
	const isIntentTerminal =
		intentStatus === "completed" ||
		intentPhase === "awaiting_completion_review" ||
		intentPhase === "intent_completion"
	// When terminal, blank out the chrome's "selected stage" so the
	// FeedbackSidebar renders an Intent header (not "Security current")
	// and the stepper doesn't highlight the last stage as "viewing." The
	// sidebar already falls back to "Intent" when stage is null.
	const chromeSelectedStage = isIntentTerminal ? null : selectedStage
	const chromeViewingStage = isIntentTerminal ? "" : (selectedStage ?? "")
	const stageNamesOrdered = orderedStageNames
	// Surface any external_review_url recorded in stage state — the
	// agent records the delivery PR URL via
	// `haiku_run_next { external_review_url }` on the
	// `external_review_requested` action. Under autopilot intent
	// completion the URL lands on the last stage's state. Pick the
	// most-recently-set URL across stages (later stages win when
	// multiple are set) so the screen always shows the delivery PR
	// rather than an earlier per-stage PR.
	let deliveryReviewUrl: string | null = null
	for (const name of orderedStageNames) {
		const s = stageStates[name] as { external_review_url?: string } | undefined
		if (s?.external_review_url) deliveryReviewUrl = s.external_review_url
	}
	// Auto-detected PR/MR URL — populated by the session API via raw
	// git (`git ls-remote origin 'refs/pull/<n>/head'` etc). Used as a
	// fallback when the agent never recorded an explicit URL. The
	// engine never gates on this — it's informational only.
	const discoveredReviewUrl = session.discovered_review_url ?? null

	const contextValue: ReviewRouteContextValue = useMemo(
		() => ({
			session: session,
			sessionId,
			wsRef,
			activeStage,
			highlightFeedbackId,
			setHighlightFeedbackId,
			pendingFlashAnchor,
			setPendingFlashAnchor,
			submittedDecision,
			setSubmittedDecision,
			inlineComments,
			setInlineComments,
			pins,
			setPins,
			getAnnotations,
		}),
		[
			session,
			sessionId,
			wsRef,
			activeStage,
			highlightFeedbackId,
			pendingFlashAnchor,
			submittedDecision,
			inlineComments,
			pins,
			getAnnotations,
		],
	)

	return (
		<ReviewRouteProvider value={contextValue}>
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
										<span className="text-stone-300 dark:text-stone-600">
											·
										</span>
										<span className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
											{studioName}
										</span>
									</>
								)}
								{session.intent?.title && (
									<>
										<span className="text-stone-300 dark:text-stone-600">
											/
										</span>
										<button
											type="button"
											onClick={() =>
												navigate({
													to: "/review/$sessionId/intent",
													params: { sessionId },
												})
											}
											className={`text-sm font-semibold truncate rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900 ${viewingIntent ? "text-teal-700 dark:text-teal-400 underline underline-offset-4" : "text-stone-800 dark:text-stone-100 hover:text-teal-700 dark:hover:text-teal-400"}`}
											title="View intent overview"
										>
											{session.intent.title}
										</button>
									</>
								)}
								{isAdHoc && (
									<>
										<span className="text-stone-300 dark:text-stone-600">
											·
										</span>
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
								currentStage={isIntentTerminal ? "" : (activeStage ?? "")}
								viewingStage={
									viewingIntent || isIntentTerminal ? "" : chromeViewingStage
								}
								onStageClick={(name) =>
									navigate({
										to: "/review/$sessionId/stages/$stage",
										params: { sessionId, stage: name },
									})
								}
							/>
						)}
					</HeaderLandmark>

					<div
						data-testid="review-split"
						className="flex-1 flex flex-col xl:flex-row overflow-hidden"
					>
						{!isMobile && (
							<FeedbackSidebar
								stage={chromeSelectedStage}
								activeStage={isIntentTerminal ? null : activeStage}
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
							) : isIntentTerminal && intentSlug ? (
								<IntentCompleteView
									intentSlug={intentSlug}
									intentTitle={session.intent?.title ?? intentSlug}
									intentFrontmatter={
										session.intent?.frontmatter ?? { status: "" }
									}
									stageStates={stageStates}
									stageOrder={stageNamesOrdered}
									deliveryReviewUrl={deliveryReviewUrl}
									discoveredReviewUrl={discoveredReviewUrl}
									outputArtifacts={session.output_artifacts}
									outputDeclaredBy={session.output_declared_by}
								/>
							) : (
								<Outlet />
							)}
						</Main>
					</div>

					{isMobile && <MobileFeedbackSection />}
				</div>
			</FeedbackProvider>
		</ReviewRouteProvider>
	)
}

export const Route = createFileRoute("/review/$sessionId")({
	component: ReviewLayout,
})
