/**
 * /direction/:sessionId — pick a design direction from the archetype set.
 */

import { createFileRoute } from "@tanstack/react-router"
import { DirectionModule } from "../../pages"
import { ShellLayout } from "../../shell/ShellLayout"

function DirectionRoute(): React.ReactElement {
	const { sessionId } = Route.useParams()
	return (
		<ShellLayout title="Design Direction">
			<DirectionModule sessionId={sessionId} />
		</ShellLayout>
	)
}

export const Route = createFileRoute("/direction/$sessionId")({
	component: DirectionRoute,
})
