/**
 * /review/:sessionId/stages/:stage/:tab — stage content by tab.
 *
 * Valid tabs: `overview` | `units` | `knowledge` | `outputs`. Any other
 * value falls through to the root 404 via `notFoundComponent`.
 */

import { createFileRoute, notFound } from "@tanstack/react-router"
import type { ReviewTab } from "../../../../../pages/review/shared/stage-tabs"
import { StageContent } from "./-stage-content"

const VALID_TABS: ReviewTab[] = ["overview", "units", "knowledge", "outputs"]

function isTab(v: string): v is ReviewTab {
	return (VALID_TABS as string[]).includes(v)
}

function StageTab(): React.ReactElement {
	const { stage, tab } = Route.useParams()
	return <StageContent stage={stage} tab={tab} detail={null} />
}

export const Route = createFileRoute("/review/$sessionId/stages/$stage/$tab")({
	parseParams: (params) => {
		if (!isTab(params.tab)) throw notFound()
		return { ...params, tab: params.tab }
	},
	component: StageTab,
})
