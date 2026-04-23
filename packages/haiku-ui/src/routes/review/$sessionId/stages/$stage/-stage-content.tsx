/**
 * StageContent — shared wrapper that mounts `<StageReview>` with tab +
 * detail controlled by the URL. Each leaf route under
 * `stages/$stage/*` picks what to pass based on its own params; this
 * module centralises the navigate-on-change side of the binding.
 *
 * Falls through to `<ArtifactsPane>` for unit-scoped reviews (the
 * session carries a `review_type === "unit"` target) — same fallback
 * the pre-router `StageScopedContent` applied.
 */

import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"
import { useFeedbackContext } from "../../../../../hooks/FeedbackContext"
import { ArtifactsPane } from "../../../../../pages/review/ArtifactsPane"
import type {
	ReviewDetailKind,
	ReviewTab,
} from "../../../../../pages/review/shared/stage-tabs"
import { StageReview } from "../../../../../pages/review/stage/StageReview"
import { useReviewContext } from "../../-context"

export function StageContent({
	stage,
	tab,
	detail,
}: {
	stage: string
	tab: ReviewTab | undefined
	detail: { kind: ReviewDetailKind; name: string } | null
}): React.ReactElement {
	const {
		session,
		sessionId,
		wsRef,
		highlightFeedbackId,
		setHighlightFeedbackId,
		inlineComments,
		setInlineComments,
		pins,
		setPins,
		getAnnotations,
	} = useReviewContext()
	const navigate = useNavigate()

	const intentSlug = session.intent_slug ?? session.intent?.slug ?? null
	const { items: stageFeedback, createFeedback: hookCreateFeedback } =
		useFeedbackContext()

	const handleTabChange = useCallback(
		(next: ReviewTab | undefined) => {
			if (!next || next === "overview") {
				navigate({
					to: "/review/$sessionId/stages/$stage",
					params: { sessionId, stage },
				})
			} else {
				navigate({
					to: "/review/$sessionId/stages/$stage/$tab",
					params: { sessionId, stage, tab: next },
				})
			}
		},
		[navigate, sessionId, stage],
	)

	const handleDetailChange = useCallback(
		(next: { kind: ReviewDetailKind; name: string } | null) => {
			if (next) {
				navigate({
					to: "/review/$sessionId/stages/$stage/$kind/$name",
					params: {
						sessionId,
						stage,
						kind: next.kind,
						name: next.name,
					},
				})
			} else if (tab && tab !== "overview") {
				navigate({
					to: "/review/$sessionId/stages/$stage/$tab",
					params: { sessionId, stage, tab },
				})
			} else {
				navigate({
					to: "/review/$sessionId/stages/$stage",
					params: { sessionId, stage },
				})
			}
		},
		[navigate, sessionId, stage, tab],
	)

	const isUnitReview = session.review_type === "unit" && !!session.target
	if (isUnitReview) {
		return (
			<ArtifactsPane
				session={session}
				sessionId={sessionId}
				getAnnotations={getAnnotations}
				wsRef={wsRef}
				onInlineCommentsChange={setInlineComments}
				onPinsChange={setPins}
			/>
		)
	}

	// `inlineComments` and `pins` are consumed by the sidebar composer
	// via `getAnnotations()`; StageReview itself only needs the setters
	// so detail views can push drafts up.
	void inlineComments
	void pins

	const handleSubmitAnnotation = useCallback(
		async (artifactName: string, comment: string, screenshotDataUrl: string) => {
			if (!intentSlug) {
				throw new Error("Cannot submit annotation without an intent slug")
			}
			// Title is the artifact + first few words of the comment so the
			// feedback list shows something scannable without opening it.
			const firstLine =
				comment.trim().split("\n")[0]?.slice(0, 80) || "Annotation"
			const title = `${artifactName}: ${firstLine}`.slice(0, 200)
			// Route through the hook so it refetches the list on success —
			// without this the new item would only appear after a manual
			// reload.
			await hookCreateFeedback({
				title,
				body: comment.trim(),
				origin: "user-visual",
				source_ref: artifactName,
				attachment_data_url: screenshotDataUrl,
			})
		},
		[hookCreateFeedback, intentSlug],
	)

	return (
		<StageReview
			session={session}
			sessionId={sessionId}
			intentSlug={intentSlug}
			stageName={stage}
			feedback={stageFeedback}
			onHighlightRequestId={highlightFeedbackId}
			onHighlightConsumed={() => setHighlightFeedbackId(null)}
			tab={tab}
			onTabChange={handleTabChange}
			detail={detail}
			onDetailChange={handleDetailChange}
			onInlineCommentsChange={setInlineComments}
			onSubmitAnnotation={handleSubmitAnnotation}
		/>
	)
}
