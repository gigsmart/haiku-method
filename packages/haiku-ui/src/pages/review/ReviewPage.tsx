/**
 * ReviewPage — three-pane composition shell for `/review/:id` and
 * `/review/current`.
 *
 * Desktop (xl+):
 *   <StageProgressStrip>
 *   <ReviewContextHeader>
 *   <div flex>
 *     <ArtifactsPane />          — left column, stage artifacts + mockups
 *     <FeedbackSidebar />        — right column, summary bar + list + embedded legacy sidebar footer
 *   </div>
 *   <FooterBar />                — canonical review-decision buttons
 *
 * Mobile (< xl):
 *   <StageProgressStrip>
 *   <ReviewContextHeader>
 *   <ArtifactsPane />            — stacked full-width column
 *   <FooterBar />
 *   <FeedbackFloatingButton />   — FAB at fixed bottom-right (canonical
 *                                  components/feedback export — forwardRef,
 *                                  `open`/`onToggle`/`count` API)
 *   <FeedbackSheet />            — canonical <dialog>-based sheet
 *                                  (components/feedback export — `open`/
 *                                  `onClose`/`triggerRef` API with
 *                                  focus-trap, backdrop close, reduced-motion)
 *
 * The responsive branch is driven by `useIsMobile()` (not pure CSS) so the
 * responsive-parity test can render both branches deterministically — see
 * unit-07 tactical plan §7.
 *
 * The `IntentReview` / `UnitReview` leaf views live under
 * `pages/review/intent/` and `pages/review/unit/`; `ArtifactsPane`
 * delegates to them. Shared leaves (`RereviewBanner`,
 * `ReviewPageSessionData`) live under `pages/review/shared/`. There is no
 * legacy `components/ReviewPage.tsx` re-export shim — the monolith was
 * deleted as part of the FB-11 / FB-22 / FB-27 cutover. The legacy
 * comment-composer + sidebar-footer block stays in
 * `components/ReviewSidebar.tsx` — we do NOT rewrite it in this unit.
 */

import { useCallback, useRef, useState } from "react"
import type { AnnotationPin } from "../../components/AnnotationCanvas"
import {
	FeedbackFloatingButton,
	FeedbackSheet,
} from "../../components/feedback"
import type { InlineCommentEntry } from "../../components/InlineComments"
import { ReviewContextHeader } from "../../components/ReviewContextHeader"
import { StageProgressStrip } from "../../components/StageProgressStrip"
import type { ReviewAnnotations } from "../../types"
import { ArtifactsPane } from "./ArtifactsPane"
import { FeedbackPanelBody } from "./FeedbackPanelBody"
import { FeedbackSidebar } from "./FeedbackSidebar"
import { FooterBar } from "./FooterBar"
import { RereviewBanner } from "./shared/RereviewBanner"
import type { ReviewPageSessionData } from "./shared/session-data"
import { useFeedbackSidebarController } from "./useFeedbackSidebarController"
import { useIsMobile } from "./useIsMobile"

// Re-export the session-data type for callers that import it from the page module.
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

function resolveGateType(
	gate: string | undefined,
): "ask" | "external" | "auto" {
	if (gate?.includes("external")) return "external"
	if (gate?.includes("ask")) return "ask"
	return "auto"
}

/**
 * MobileFeedbackSection — composes the canonical `FeedbackFloatingButton` +
 * `FeedbackSheet` (from `components/feedback`) with the shared sidebar
 * controller so the mobile branch matches the desktop sidebar's wiring (same
 * `useFeedback` call, same typed-apiClient mutations). Split out as its own
 * component so the controller hook only runs on the mobile branch — React's
 * rules-of-hooks prevents conditional hook calls at the page level.
 */
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
	const gateType = resolveGateType(session.gate_type)
	const reviewType = session.review_type === "unit" ? "stage" : "intent"
	const isMobile = useIsMobile()

	// Annotation state — pins + inline comments captured by the artifacts
	// pane bubble here. The payload for the review-decision POST reads
	// from this ref when the user clicks Approve / Request Changes.
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
	const stageProgressData = Object.keys(stageStates).map((name) => ({
		name,
		status: stageStates[name]?.status ?? "pending",
		visits: 0,
	}))

	return (
		<div data-testid="review-page-ready">
			{stageProgressData.length > 0 && (
				<div className="mb-4">
					<StageProgressStrip
						stages={stageProgressData}
						currentStage={activeStage ?? ""}
					/>
				</div>
			)}
			<ReviewContextHeader
				reviewType={reviewType}
				stageName={activeStage ?? undefined}
				intentTitle={session.intent?.title}
				gateType={gateType}
			/>
			{session.previous_review && (
				<RereviewBanner snapshot={session.previous_review} />
			)}
			<div
				data-testid="review-split"
				className="flex flex-col xl:flex-row xl:gap-6"
			>
				<ArtifactsPane
					session={session}
					sessionId={sessionId}
					getAnnotations={getAnnotations}
					wsRef={wsRef}
					onInlineCommentsChange={setInlineComments}
					onPinsChange={setPins}
				/>
				{!isMobile && (
					<FeedbackSidebar
						intent={intentSlug}
						stage={activeStage}
						sessionId={sessionId}
					/>
				)}
			</div>
			<FooterBar
				sessionId={sessionId}
				gateType={session.gate_type}
				getAnnotations={getAnnotations}
				className="mt-6"
			/>
			{isMobile && (
				<MobileFeedbackSection
					intentSlug={intentSlug}
					activeStage={activeStage}
				/>
			)}
		</div>
	)
}
