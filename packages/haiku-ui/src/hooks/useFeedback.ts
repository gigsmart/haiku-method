import { useCallback, useEffect, useState } from "react"
import { authHeader } from "../api/auth"
import { SESSION_HEADER } from "../api/client"
import { useApiClient } from "../api/context"
import type { FeedbackItemData, FeedbackListResponse } from "../types"

const FETCH_HEADERS = { "bypass-tunnel-reminder": "1" }

/**
 * Attach the cross-session auth header if the ApiClient has a sessionId
 * registered. The server requires this header on POST/PUT/DELETE feedback
 * mutations when remote review is enabled (tunnel live) — see
 * `verifyFeedbackMutationAuth` in `packages/haiku/src/http.ts`.
 *
 * Also attaches the tunnel-auth `Authorization: Bearer <jwt>` header
 * (FB-30) — no-op when no token is present (local-only mode).
 */
function mutationHeaders(
	sessionId: string | null,
	base: Record<string, string>,
): Record<string, string> {
	const next = { ...base, ...authHeader() }
	return sessionId ? { ...next, [SESSION_HEADER]: sessionId } : next
}

/**
 * Tunnel-auth-only headers — used on GET reads. Pairs with the server's
 * `requireTunnelAuth` gate when remote review is live.
 */
function readHeaders(base: Record<string, string>): Record<string, string> {
	return { ...base, ...authHeader() }
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
					{ headers: readHeaders(FETCH_HEADERS) },
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
			// v1: refetch on create — response doesn't project the full item
			// (see FB-47 fix rationale). Update and delete use optimistic
			// splices below; create stays on refetch until the POST response
			// is extended to echo the projected FeedbackItem.
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
			// FB-47: optimistic splice instead of full-list refetch.
			// The request body carries the new status / closed_by values and
			// the path identifies the target item, so the client has
			// everything it needs to reconcile without a follow-up GET.
			setItems((prev) =>
				prev.map((item) =>
					item.feedback_id === feedbackId
						? {
								...item,
								...(fields.status !== undefined
									? {
											status: fields.status as FeedbackItemData["status"],
										}
									: {}),
								...(fields.closed_by !== undefined
									? { closed_by: fields.closed_by }
									: {}),
							}
						: item,
				),
			)
			return result
		},
		[intent, stage, apiClient],
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
			// FB-47: optimistic filter instead of full-list refetch. The id
			// on the request path is authoritative, so the client knows
			// exactly which row to drop without a follow-up GET.
			setItems((prev) => prev.filter((item) => item.feedback_id !== feedbackId))
			return result
		},
		[intent, stage, apiClient],
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
