import { useCallback, useEffect, useState } from "react"
import { useApiClient } from "../api/context"
import { SESSION_HEADER } from "../api/client"
import type { FeedbackItemData, FeedbackListResponse } from "../types"

const FETCH_HEADERS = { "bypass-tunnel-reminder": "1" }

/**
 * Attach the cross-session auth header if the ApiClient has a sessionId
 * registered. The server requires this header on POST/PUT/DELETE feedback
 * mutations when remote review is enabled (tunnel live) — see
 * `verifyFeedbackMutationAuth` in `packages/haiku/src/http.ts`.
 */
function mutationHeaders(
	sessionId: string | null,
	base: Record<string, string>,
): Record<string, string> {
	return sessionId ? { ...base, [SESSION_HEADER]: sessionId } : base
}

export function useFeedback(intent: string | null, stage: string | null) {
	const [items, setItems] = useState<FeedbackItemData[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const apiClient = useApiClient()

	const fetchFeedback = useCallback(
		async (statusFilter?: string) => {
			if (!(intent && stage)) return
			setLoading(true)
			setError(null)
			try {
				const qs = statusFilter ? `?status=${statusFilter}` : ""
				const res = await fetch(
					`/api/feedback/${encodeURIComponent(intent)}/${encodeURIComponent(stage)}${qs}`,
					{ headers: FETCH_HEADERS },
				)
				if (!res.ok) {
					const body = await res.json().catch(() => ({}))
					throw new Error(body.error || `HTTP ${res.status}`)
				}
				const data: FeedbackListResponse = await res.json()
				setItems(data.items)
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to fetch feedback",
				)
			} finally {
				setLoading(false)
			}
		},
		[intent, stage],
	)

	useEffect(() => {
		fetchFeedback()
	}, [fetchFeedback])

	const createFeedback = useCallback(
		async (title: string, body: string, origin = "user-visual") => {
			if (!(intent && stage)) return null
			const sessionId = apiClient.getSessionId()
			const res = await fetch(
				`/api/feedback/${encodeURIComponent(intent)}/${encodeURIComponent(stage)}`,
				{
					method: "POST",
					headers: mutationHeaders(sessionId, {
						"Content-Type": "application/json",
						...FETCH_HEADERS,
					}),
					body: JSON.stringify({ title, body, origin }),
				},
			)
			if (!res.ok) {
				const errBody = await res.json().catch(() => ({}))
				throw new Error(errBody.error || `HTTP ${res.status}`)
			}
			const result = await res.json()
			await fetchFeedback()
			return result
		},
		[intent, stage, fetchFeedback, apiClient],
	)

	const updateFeedback = useCallback(
		async (
			feedbackId: string,
			fields: { status?: string; closed_by?: string },
		) => {
			if (!(intent && stage)) return null
			const sessionId = apiClient.getSessionId()
			const res = await fetch(
				`/api/feedback/${encodeURIComponent(intent)}/${encodeURIComponent(stage)}/${encodeURIComponent(feedbackId)}`,
				{
					method: "PUT",
					headers: mutationHeaders(sessionId, {
						"Content-Type": "application/json",
						...FETCH_HEADERS,
					}),
					body: JSON.stringify(fields),
				},
			)
			if (!res.ok) {
				const errBody = await res.json().catch(() => ({}))
				throw new Error(errBody.error || `HTTP ${res.status}`)
			}
			const result = await res.json()
			await fetchFeedback()
			return result
		},
		[intent, stage, fetchFeedback, apiClient],
	)

	const deleteFeedback = useCallback(
		async (feedbackId: string) => {
			if (!(intent && stage)) return null
			const sessionId = apiClient.getSessionId()
			const res = await fetch(
				`/api/feedback/${encodeURIComponent(intent)}/${encodeURIComponent(stage)}/${encodeURIComponent(feedbackId)}`,
				{
					method: "DELETE",
					headers: mutationHeaders(sessionId, FETCH_HEADERS),
				},
			)
			if (!res.ok) {
				const errBody = await res.json().catch(() => ({}))
				throw new Error(errBody.error || `HTTP ${res.status}`)
			}
			const result = await res.json()
			await fetchFeedback()
			return result
		},
		[intent, stage, fetchFeedback, apiClient],
	)

	return {
		items,
		loading,
		error,
		refetch: fetchFeedback,
		createFeedback,
		updateFeedback,
		deleteFeedback,
	}
}
