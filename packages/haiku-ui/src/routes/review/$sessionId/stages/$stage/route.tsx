/**
 * /review/:sessionId/stages/:stage — stage layout.
 *
 * Renders the sticky StageBanner + a rereview banner (when the session
 * carries a previous-review snapshot), then the child route content in
 * the main pane.
 */

import { createFileRoute, Outlet } from "@tanstack/react-router"
import { RereviewBanner } from "../../../../../pages/review/shared/RereviewBanner"
import {
	gateBadgeCopy,
	resolveGateModes,
} from "../../-review-helpers"
import { useReviewContext } from "../../-context"
import { StageBanner } from "./-stage-banner"

function StageLayout(): React.ReactElement {
	const { stage } = Route.useParams()
	const { session, activeStage } = useReviewContext()
	const stageStates = session.stage_states ?? {}
	const stageStatus =
		stage === activeStage
			? "current"
			: (stageStates[stage]?.status ?? "pending")
	const stagePhase = stageStates[stage]?.phase ?? null
	const gateModes = resolveGateModes(session.gate_type)
	const gateBadges = gateModes.map(gateBadgeCopy)

	return (
		<>
			<StageBanner
				stageName={stage}
				stageStatus={stageStatus}
				stagePhase={stagePhase}
				gateBadges={gateBadges}
			/>
			<div className="px-6 lg:px-10 pb-6">
				{session.previous_review && (
					<RereviewBanner snapshot={session.previous_review} />
				)}
				<Outlet />
			</div>
		</>
	)
}

export const Route = createFileRoute("/review/$sessionId/stages/$stage")({
	component: StageLayout,
})
