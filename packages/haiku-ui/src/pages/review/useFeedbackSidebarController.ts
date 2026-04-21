/**
 * useFeedbackSidebarController — shared wiring for the desktop sidebar and
 * the mobile sheet variants of the feedback panel.
 *
 * Consumes `useFeedback(intent, stage)` for the list state + `refetch`
 * callback, and routes status mutations through the typed
 * `useApiClient().feedback.update(...)` so callers do not call `fetch`
 * directly. Per-status-change announcements fire through
 * `useAnnounce('polite', ...)` with canonical phrasing from DESIGN-BRIEF §2
 * — see `statusAnnouncement`. Optimistic UI is bounded: we hand the
 * announcement to AT immediately; a failed update re-fetches and surfaces
 * the error via assertive live region.
 *
 * Extracted from `FeedbackSidebar.tsx` per FB-38 so the desktop, FAB, and
 * sheet components can each own their own file without duplicating the
 * `useFeedback` wiring.
 */

import { useCallback } from "react"
import { useAnnounce } from "../../a11y"
import { useApiClient } from "../../api/context"
import type { FeedbackStatus } from "../../components/feedback"
import { useFeedback } from "../../hooks/useFeedback"
import type { FeedbackItemData } from "../../types"

export function statusAnnouncement(id: string, next: FeedbackStatus): string {
	if (next === "rejected") return `Feedback ${id} marked as rejected`
	if (next === "closed") return `Feedback ${id} marked as closed`
	if (next === "pending") return `Feedback ${id} reopened`
	if (next === "addressed") return `Feedback ${id} marked as addressed`
	if (next === "fixing") return `Feedback ${id} marked as fixing`
	return `Feedback ${id} status changed`
}

export interface UseFeedbackSidebarControllerResult {
	items: FeedbackItemData[]
	loading: boolean
	error: string | null
	retry: () => void
	handleStatusChange: (id: string, next: FeedbackStatus) => void
	handleDelete: (id: string) => void
}

export function useFeedbackSidebarController(
	intent: string | null,
	stage: string | null,
): UseFeedbackSidebarControllerResult {
	const client = useApiClient()
	const announce = useAnnounce()
	const {
		items,
		loading,
		error,
		refetch,
		deleteFeedback: hookDelete,
	} = useFeedback(intent, stage)

	const retry = useCallback(() => {
		void refetch()
	}, [refetch])

	const handleStatusChange = useCallback(
		(id: string, next: FeedbackStatus): void => {
			// Announce immediately — optimistic UI per DESIGN-BRIEF §2.
			announce("polite", statusAnnouncement(id, next))
			if (!(intent && stage)) return
			client.feedback
				.update(intent, stage, id, { status: next })
				.then(() => {
					void refetch()
				})
				.catch((err: unknown) => {
					const message =
						err instanceof Error ? err.message : "Feedback update failed"
					announce("assertive", message)
				})
		},
		[announce, client, intent, stage, refetch],
	)

	const handleDelete = useCallback(
		(id: string): void => {
			hookDelete(id).catch(() => {
				announce("assertive", "Feedback delete failed")
			})
		},
		[announce, hookDelete],
	)

	return { items, loading, error, retry, handleStatusChange, handleDelete }
}
