/**
 * /review/:sessionId (no sub-route) — land on the currently-active stage,
 * or on the intent overview when the intent has reached a terminal state.
 *
 * The workflow engine typically has exactly one stage in status="active"
 * while work is in-flight; redirect there. When the intent is in
 * `awaiting_completion_review` or `status: completed`, `getCurrentState`
 * still returns the last stage (its fallback for "all stages done"), so
 * we'd end up at `/stages/<last>` with the stepper highlighting it as
 * "viewing" and the sidebar labeling it "current" — neither is true.
 * Redirect to `/intent` instead so the chrome reflects "we're reviewing
 * the intent, not a stage" and ReviewLayoutLoaded's terminal-detection
 * swaps in `IntentCompleteView`. When neither condition holds (early
 * intent with no progress yet), fall through to the intent-scoped
 * `<ArtifactsPane>`.
 */

import { createFileRoute, Navigate } from "@tanstack/react-router"
import { ArtifactsPane } from "../../../pages/review/ArtifactsPane"
import { useReviewContext } from "./-context"
import { isIntentTerminal } from "./-review-helpers"

function ReviewIndex(): React.ReactElement {
	const {
		sessionId,
		session,
		activeStage,
		wsRef,
		getAnnotations,
		setInlineComments,
		setPins,
	} = useReviewContext()
	if (isIntentTerminal(session)) {
		return (
			<Navigate to="/review/$sessionId/intent" params={{ sessionId }} replace />
		)
	}
	if (activeStage) {
		return (
			<Navigate
				to="/review/$sessionId/stages/$stage"
				params={{ sessionId, stage: activeStage }}
				replace
			/>
		)
	}
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

export const Route = createFileRoute("/review/$sessionId/")({
	component: ReviewIndex,
})
