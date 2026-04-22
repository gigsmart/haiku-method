/**
 * /review/current — always-available review state (no session id).
 *
 * This route uses a different data source from `/review/:id` — the
 * `/api/review/current` endpoint on the MCP review server. The module
 * owns the fetch + title lifecycle.
 */

import { createFileRoute } from "@tanstack/react-router"
import { ReviewCurrentModule } from "../../pages"
import { ShellLayout } from "../../shell/ShellLayout"

function ReviewCurrentRoute(): React.ReactElement {
	return (
		<ShellLayout title="Review">
			<ReviewCurrentModule />
		</ShellLayout>
	)
}

export const Route = createFileRoute("/review/current")({
	component: ReviewCurrentRoute,
})
