/**
 * /question/:sessionId — answer a pending question.
 *
 * Route wraps the existing `QuestionPageModule` inside the shared
 * `ShellLayout` (header + main + footer). The module owns the fetch +
 * WS lifecycle and dispatches to `<QuestionPage>`.
 */

import { createFileRoute } from "@tanstack/react-router"
import { QuestionModule } from "../../pages"
import { ShellLayout } from "../../shell/ShellLayout"

function QuestionRoute(): React.ReactElement {
	const { sessionId } = Route.useParams()
	return (
		<ShellLayout title="Question">
			<QuestionModule sessionId={sessionId} />
		</ShellLayout>
	)
}

export const Route = createFileRoute("/question/$sessionId")({
	component: QuestionRoute,
})
