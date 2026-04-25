/**
 * /review/:sessionId/stages/:stage — stage overview (default tab).
 */

import { createFileRoute } from "@tanstack/react-router"
import { StageContent } from "./-stage-content"

function StageOverview(): React.ReactElement {
	const { stage } = Route.useParams()
	return <StageContent stage={stage} tab={undefined} detail={null} />
}

export const Route = createFileRoute("/review/$sessionId/stages/$stage/")({
	component: StageOverview,
})
