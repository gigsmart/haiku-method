/**
 * ArtifactsPane — left-column composition of the review page.
 *
 * Delegates to the legacy `IntentReview` / `UnitReview` leaf views which
 * own the card/tab rendering for stage artifacts, mockups, wireframes,
 * success criteria, and annotation canvas integration. This unit does
 * not rewrite those views — the tactical plan §14 is explicit that the
 * ~1400-LOC monolith stays in place; only the top-level composition
 * responsibility moves.
 *
 * Annotation pin integration: `onPinsChange` bubbles up to the parent
 * `ReviewPage`, which owns the annotations state (see `useAnnotations`-
 * style ref pattern in the legacy component). Unit-13 can reshape the
 * canvas internals without touching this pane — the callsite is
 * prop-driven.
 */

import type { AnnotationPin } from "../../components/AnnotationCanvas"
import type { InlineCommentEntry } from "../../components/InlineComments"
import {
	IntentReview,
	type ReviewPageSessionData,
	UnitReview,
} from "../../components/ReviewPage"
import type { ReviewAnnotations } from "../../types"

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
