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
import type { FeedbackStatus } from "../../components/feedback"
import { useFeedbackContext } from "../../hooks/FeedbackContext"
import type { FeedbackItemData } from "../../types"

export function statusAnnouncement(id: string, next: FeedbackStatus): string {
	if (next === "rejected") return `Feedback ${id} marked as rejected`
	if (next === "closed") return `Feedback ${id} marked as closed`
	if (next === "pending") return `Feedback ${id} reopened`
	if (next === "addressed") return `Feedback ${id} marked as addressed`
	if (next === "fixing") return `Feedback ${id} marked as fixing`
	if (next === "answered") return `Feedback ${id} marked as answered`
	return `Feedback ${id} status changed`
}

export interface UseFeedbackSidebarControllerResult {
	items: FeedbackItemData[]
	loading: boolean
	error: string | null
	busyIds: ReadonlySet<string>
	creating: boolean
	retry: () => void
	handleStatusChange: (id: string, next: FeedbackStatus) => void
	handleDelete: (id: string) => void
	handleReply: (
		id: string,
		body: string,
		closeAsAnswered?: boolean,
	) => Promise<void>
	createFeedback: ReturnType<typeof useFeedbackContext>["createFeedback"]
}

export function useFeedbackSidebarController(): UseFeedbackSidebarControllerResult {
	const announce = useAnnounce()
	const {
		items,
		loading,
		error,
		busyIds,
		creating,
		refetch,
		updateFeedback: hookUpdate,
		deleteFeedback: hookDelete,
		createFeedback,
		replyToFeedback,
	} = useFeedbackContext()

	const retry = useCallback(() => {
		void refetch()
	}, [refetch])

	const handleStatusChange = useCallback(
		(id: string, next: FeedbackStatus): void => {
			// Announce immediately — the hook applies an optimistic splice
			// synchronously so the card flips to the new status before the
			// network round trip resolves. `hookUpdate` rolls back and
			// announces on failure.
			announce("polite", statusAnnouncement(id, next))
			hookUpdate(id, { status: next }).catch((err: unknown) => {
				const message =
					err instanceof Error ? err.message : "Feedback update failed"
				announce("assertive", message)
			})
		},
		[announce, hookUpdate],
	)

	const handleDelete = useCallback(
		(id: string): void => {
			hookDelete(id).catch(() => {
				announce("assertive", "Feedback delete failed")
			})
		},
		[announce, hookDelete],
	)

	const handleReply = useCallback(
		async (
			id: string,
			body: string,
			closeAsAnswered?: boolean,
		): Promise<void> => {
			try {
				await replyToFeedback(id, body, closeAsAnswered)
				announce(
					"polite",
					closeAsAnswered
						? `Replied and closed feedback ${id}`
						: `Replied to feedback ${id}`,
				)
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Reply failed to send"
				announce("assertive", message)
				throw err
			}
		},
		[announce, replyToFeedback],
	)

	return {
		items,
		loading,
		error,
		busyIds,
		creating,
		retry,
		handleStatusChange,
		handleDelete,
		handleReply,
		createFeedback,
	}
}
