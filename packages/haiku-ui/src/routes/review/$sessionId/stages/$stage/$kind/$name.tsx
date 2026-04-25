/**
 * /review/:sessionId/stages/:stage/:kind/:name — artifact detail view.
 *
 * Valid `kind`: `units` | `knowledge` | `outputs`. The artifact name
 * round-trips through `encodeURIComponent` so names containing slashes
 * or spaces survive the URL grammar (see `buildReviewPath` history +
 * TanStack Router's default param encoder).
 */

import { createFileRoute, notFound } from "@tanstack/react-router"
import type { ReviewDetailKind } from "../../../../../../pages/review/shared/stage-tabs"
import { StageContent } from "../-stage-content"

const VALID_KINDS: ReviewDetailKind[] = ["units", "knowledge", "outputs"]

function isKind(v: string): v is ReviewDetailKind {
	return (VALID_KINDS as string[]).includes(v)
}

function StageDetail(): React.ReactElement {
	const { stage, kind, name } = Route.useParams()
	return <StageContent stage={stage} tab={kind} detail={{ kind, name }} />
}

export const Route = createFileRoute(
	"/review/$sessionId/stages/$stage/$kind/$name",
)({
	parseParams: (params) => {
		if (!isKind(params.kind)) throw notFound()
		return { ...params, kind: params.kind }
	},
	component: StageDetail,
})
