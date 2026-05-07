/**
 * /picker/:sessionId — engine-side blocking selection (studio / mode /
 * stage / confirm). Created by runPicker() server-side; the agent
 * never sees the URL+await two-step.
 */

import { createFileRoute } from "@tanstack/react-router"
import { PickerModule } from "../../pages"

function PickerRoute(): React.ReactElement {
	const { sessionId } = Route.useParams()
	return <PickerModule sessionId={sessionId} />
}

export const Route = createFileRoute("/picker/$sessionId")({
	component: PickerRoute,
})
