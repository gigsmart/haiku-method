/**
 * ArtifactsPane — left-column composition of the review page.
 *
 * Delegates to the `IntentReview` / `UnitReview` leaf views which
 * own the card/tab rendering for stage artifacts, mockups, wireframes,
 * success criteria, and annotation canvas integration. The leaf views
 * were migrated out of the legacy `components/ReviewPage.tsx` monolith
 * into `pages/review/intent/` and `pages/review/unit/` as part of the
 * FB-11 / FB-22 / FB-27 cutover.
 *
 * Annotation pin integration: `onPinsChange` bubbles up to the parent
 * `ReviewPage`, which owns the annotations state. The callsite is
 * prop-driven so the canvas internals can be reshaped without touching
 * this pane.
 */

import type { AnnotationPin } from "../../components/AnnotationCanvas"
import type { InlineCommentEntry } from "../../components/InlineComments"
import type { ReviewAnnotations } from "../../types"
import { IntentReview } from "./intent/IntentReview"
import type { ReviewPageSessionData } from "./shared/session-data"
import { UnitReview } from "./unit/UnitReview"

export interface ArtifactsPaneProps {
	session: ReviewPageSessionData
	sessionId: string
	getAnnotations: () => ReviewAnnotations | undefined
	wsRef?: React.RefObject<WebSocket | null>
	onInlineCommentsChange: (comments: InlineCommentEntry[]) => void
	onPinsChange: (pins: AnnotationPin[]) => void
	className?: string
}

export function ArtifactsPane({
	session,
	sessionId,
	getAnnotations,
	wsRef,
	onInlineCommentsChange,
	onPinsChange,
	className,
}: ArtifactsPaneProps): React.ReactElement {
	const isUnitReview = session.review_type === "unit" && !!session.target

	const commonProps = {
		session,
		sessionId,
		getAnnotations,
		wsRef,
		onInlineCommentsChange,
		onPinsChange,
	}

	return (
		<div
			data-testid="artifacts-pane"
			className={`flex-1 min-w-0 ${className ?? ""}`}
		>
			{isUnitReview ? (
				<UnitReview {...commonProps} />
			) : (
				<IntentReview {...commonProps} />
			)}
		</div>
	)
}
