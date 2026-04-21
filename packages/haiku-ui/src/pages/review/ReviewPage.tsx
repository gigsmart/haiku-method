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
 *   <FeedbackFloatingButton />   — FAB at fixed bottom-right
 *   <FeedbackSheet />            — placeholder dialog (unit-10 upgrades)
 *
 * The responsive branch is driven by `useIsMobile()` (not pure CSS) so the
 * responsive-parity test can render both branches deterministically — see
 * unit-07 tactical plan §7.
 *
 * The `IntentReview` / `UnitReview` leaf views live in the legacy
 * `components/ReviewPage.tsx`; `ArtifactsPane` delegates to them. The
 * legacy comment-composer + sidebar-footer block stays in
 * `components/ReviewSidebar.tsx` — we do NOT rewrite it in this unit. The
 * top-level `ReviewPage` export from the legacy file re-exports THIS
 * component so existing imports keep working (see components/ReviewPage.tsx).
 */

import { useCallback, useState } from "react"
import type { AnnotationPin } from "../../components/AnnotationCanvas"
import type { InlineCommentEntry } from "../../components/InlineComments"
import {
	type ReviewPageSessionData,
	RereviewBanner,
} from "../../components/ReviewPage"
import { ReviewContextHeader } from "../../components/ReviewContextHeader"
import { StageProgressStrip } from "../../components/StageProgressStrip"
import type { ReviewAnnotations } from "../../types"
import { ArtifactsPane } from "./ArtifactsPane"
import {
	FeedbackFloatingButton,
	FeedbackSheet,
	FeedbackSidebar,
} from "./FeedbackSidebar"
import { FooterBar } from "./FooterBar"
import { useIsMobile } from "./useIsMobile"

// Re-export legacy type so old imports from ./ReviewPage keep resolving.
export type { ReviewPageSessionData } from "../../components/ReviewPage"

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
	const [sheetOpen, setSheetOpen] = useState(false)

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
			<div className="flex flex-col xl:flex-row xl:gap-6">
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
				<>
					<FeedbackFloatingButton
						onClick={() => setSheetOpen((o) => !o)}
						isOpen={sheetOpen}
					/>
					<FeedbackSheet
						intent={intentSlug}
						stage={activeStage}
						sessionId={sessionId}
						isOpen={sheetOpen}
						onClose={() => setSheetOpen(false)}
					/>
				</>
			)}
		</div>
	)
}
