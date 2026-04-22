/**
 * /review/:sessionId (no sub-route) — land on the currently-active stage.
 *
 * The FSM typically has exactly one stage in status="active" while work
 * is in-flight; redirect to that stage so deep links open on real
 * content. When there is no active stage (unit-scoped reviews, intent
 * reviews with no FSM progress yet), fall through to the intent-scoped
 * `<ArtifactsPane>` — same fallback the pre-router shell rendered.
 */

import { createFileRoute, Navigate } from "@tanstack/react-router"
import { ArtifactsPane } from "../../../pages/review/ArtifactsPane"
import { useReviewContext } from "./-context"

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
