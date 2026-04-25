/**
 * ReviewRouteContext — shared state between the review layout and its
 * child routes. Provided by `review/$sessionId/route.tsx` and consumed
 * by every child route (`index`, `intent`, `stages/$stage/*`).
 *
 * TanStack Router convention: a leading `-` excludes a file from being
 * treated as a route. So this module lives next to the routes that use
 * it without polluting the route tree.
 *
 * What lives here vs. in the URL:
 *   - URL-owned:   sessionId, selectedStage, viewingIntent, tab, detail
 *   - Context:     session payload, activeStage (from session),
 *                  highlightFeedbackId (feedback → artifact scroll),
 *                  submittedDecision (terminal Approve/External flow),
 *                  annotation state (pins + inline comments).
 */

import { createContext, useContext } from "react"
import type { AnnotationPin } from "../../../components/AnnotationCanvas"
import type { InlineCommentEntry } from "../../../components/InlineComments"
import type { ReviewPageSessionData } from "../../../pages/review/shared/session-data"
import type { ReviewAnnotations } from "../../../types"

export interface ReviewRouteContextValue {
	session: ReviewPageSessionData
	sessionId: string
	wsRef: React.RefObject<WebSocket | null> | undefined
	/** Derived from `session.stage_states`; the stage the intent is
	 *  currently "on" (first one whose status === "active"). */
	activeStage: string | null
	/** Feedback-card click → scroll-and-flash the target artifact card.
	 *  Set by the sidebar, consumed by StageReview, cleared one-shot. */
	highlightFeedbackId: string | null
	setHighlightFeedbackId: (id: string | null) => void
	/** Feedback-card click on an inline-anchored item → InlineComments
	 *  scrolls to the matching span (by `commentId`, falling back to a
	 *  text-search on `selectedText`) and flashes it. Set by the
	 *  stage-content layer after it navigates to the correct artifact
	 *  detail URL; cleared by InlineComments when the flash animation
	 *  finishes. */
	pendingFlashAnchor: {
		commentId?: string
		selectedText: string
		paragraph?: number
	} | null
	setPendingFlashAnchor: (
		a: {
			commentId?: string
			selectedText: string
			paragraph?: number
		} | null,
	) => void
	/** Terminal success state after a Approve / External decision. */
	submittedDecision: "approved" | "external" | null
	setSubmittedDecision: (d: "approved" | "external" | null) => void
	/** Annotation scratchpad — pins + inline comments drafted from the
	 *  current artifact and submitted with the next feedback. */
	inlineComments: InlineCommentEntry[]
	setInlineComments: (c: InlineCommentEntry[]) => void
	pins: AnnotationPin[]
	setPins: (p: AnnotationPin[]) => void
	getAnnotations: () => ReviewAnnotations | undefined
}

const ReviewRouteContext = createContext<ReviewRouteContextValue | null>(null)

export function useReviewContext(): ReviewRouteContextValue {
	const ctx = useContext(ReviewRouteContext)
	if (!ctx)
		throw new Error(
			"useReviewContext must be used inside a review route layout",
		)
	return ctx
}

export const ReviewRouteProvider = ReviewRouteContext.Provider
