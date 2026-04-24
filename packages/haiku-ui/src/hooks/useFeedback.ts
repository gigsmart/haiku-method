import type { FeedbackCreateRequest } from "haiku-api"
import { useCallback, useEffect, useRef, useState } from "react"
import { authHeader } from "../api/auth"
import { useApiClient } from "../api/context"
import type { FeedbackItemData, FeedbackListResponse } from "../types"

const FETCH_HEADERS = { "bypass-tunnel-reminder": "1" }

/**
 * Tunnel-auth headers — attaches `Authorization: Bearer <jwt>` (FB-30)
 * when a token is present (remote-review mode). No-op in local mode.
 * The JWT is the single source of session identity on both reads and
 * mutations — the server extracts the session id from its `sid` claim
 * inside `verifyFeedbackMutationAuth`.
 */
function readHeaders(base: Record<string, string>): Record<string, string> {
	return { ...base, ...authHeader() }
}

export function useFeedback(intent: string | null, stage: string | null) {
	const [items, setItems] = useState<FeedbackItemData[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	// IDs currently in flight (PUT / DELETE). Components use this to show
	// a spinner + disable buttons so the user doesn't double-click while
	// the optimistic mutation is being confirmed by the server.
	const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set())
	// `creating` flips true from the optimistic write until the server
	// echoes back a real feedback_id. Parent can use it to render a
	// placeholder row or a spinner on the FAB.
	const [creating, setCreating] = useState(false)
	const apiClient = useApiClient()
	const itemsRef = useRef<FeedbackItemData[]>([])
	itemsRef.current = items

	const markBusy = useCallback((id: string) => {
		setBusyIds((prev) => {
			if (prev.has(id)) return prev
			const next = new Set(prev)
			next.add(id)
			return next
		})
	}, [])

	const clearBusy = useCallback((id: string) => {
		setBusyIds((prev) => {
			if (!prev.has(id)) return prev
			const next = new Set(prev)
			next.delete(id)
			return next
		})
	}, [])

	const fetchFeedback = useCallback(
		async (statusFilter?: string) => {
			if (!intent) return
			setLoading(true)
			setError(null)
			try {
				const qs = statusFilter ? `?status=${statusFilter}` : ""
				// Fetch stage-scoped + intent-scoped feedback in parallel and
				// merge. Intent-scope items (logged by the studio-level
				// completion review + intent-completion fix loop) need to
				// surface in the sidebar regardless of which stage tab the
				// reviewer is on — otherwise cross-stage findings get hidden
				// behind a tab nobody opens.
				const [stageRes, intentRes] = await Promise.all([
					stage
						? fetch(
								`/api/feedback/${encodeURIComponent(intent)}/${encodeURIComponent(stage)}${qs}`,
								{ headers: readHeaders(FETCH_HEADERS) },
							)
						: Promise.resolve<Response | null>(null),
					fetch(
						`/api/feedback-intent/${encodeURIComponent(intent)}${qs}`,
						{ headers: readHeaders(FETCH_HEADERS) },
					),
				])
				const merged: FeedbackItemData[] = []
				if (stageRes) {
					if (!stageRes.ok) {
						const body = await stageRes.json().catch(() => ({}))
						throw new Error(body.error || `HTTP ${stageRes.status}`)
					}
					const stageData: FeedbackListResponse = await stageRes.json()
					merged.push(...stageData.items)
				}
				if (!intentRes.ok) {
					const body = await intentRes.json().catch(() => ({}))
					throw new Error(body.error || `HTTP ${intentRes.status}`)
				}
				const intentData: FeedbackListResponse = await intentRes.json()
				merged.push(...intentData.items)
				setItems(merged)
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
		async (
			input: string | FeedbackCreateRequest,
			body?: string,
			origin: FeedbackCreateRequest["origin"] = "user-visual",
		) => {
			if (!(intent && stage)) return null
			setCreating(true)
			const payload: FeedbackCreateRequest =
				typeof input === "string"
					? { title: input, body: body ?? "", origin }
					: input
			try {
				const result = await apiClient.feedback.create(intent, stage, payload)
				// v1: refetch on create — the POST response carries just the
				// new id + file path, not the projected FeedbackItem. Update
				// and delete splice optimistically; create remains a refetch
				// until the server response is extended.
				await fetchFeedback()
				return result
			} finally {
				setCreating(false)
			}
		},
		[intent, stage, fetchFeedback, apiClient],
	)

	const updateFeedback = useCallback(
		async (
			feedbackId: string,
			fields: { status?: FeedbackItemData["status"]; closed_by?: string },
		) => {
			if (!(intent && stage)) return null
			// Snapshot the pre-change item so we can roll back on failure.
			const before = itemsRef.current.find((i) => i.feedback_id === feedbackId)
			// Optimistic splice — apply the change locally *before* the
			// network round trip so the UI feels instant. Server confirms
			// asynchronously; on failure we restore `before`.
			setItems((prev) =>
				prev.map((item) =>
					item.feedback_id === feedbackId
						? {
								...item,
								...(fields.status !== undefined
									? { status: fields.status }
									: {}),
								...(fields.closed_by !== undefined
									? { closed_by: fields.closed_by }
									: {}),
							}
						: item,
				),
			)
			markBusy(feedbackId)
			try {
				return await apiClient.feedback.update(
					intent,
					stage,
					feedbackId,
					fields,
				)
			} catch (err) {
				if (before) {
					setItems((prev) =>
						prev.map((item) =>
							item.feedback_id === feedbackId ? before : item,
						),
					)
				}
				throw err
			} finally {
				clearBusy(feedbackId)
			}
		},
		[intent, stage, apiClient, markBusy, clearBusy],
	)

	const deleteFeedback = useCallback(
		async (feedbackId: string) => {
			if (!(intent && stage)) return null
			const before = itemsRef.current.find((i) => i.feedback_id === feedbackId)
			const beforeIndex = itemsRef.current.findIndex(
				(i) => i.feedback_id === feedbackId,
			)
			setItems((prev) => prev.filter((item) => item.feedback_id !== feedbackId))
			markBusy(feedbackId)
			try {
				return await apiClient.feedback.delete(intent, stage, feedbackId)
			} catch (err) {
				if (before) {
					setItems((prev) => {
						const next = prev.slice()
						next.splice(Math.max(0, beforeIndex), 0, before)
						return next
					})
				}
				throw err
			} finally {
				clearBusy(feedbackId)
			}
		},
		[intent, stage, apiClient, markBusy, clearBusy],
	)

	const replyToFeedback = useCallback(
		async (
			feedbackId: string,
			body: string,
			closeAsAnswered = false,
		): Promise<void> => {
			if (!(intent && stage)) return
			const trimmed = body.trim()
			if (!trimmed) throw new Error("Reply body is required")
			const url = `/api/feedback/${encodeURIComponent(intent)}/${encodeURIComponent(stage)}/${encodeURIComponent(feedbackId)}/replies`
			markBusy(feedbackId)
			try {
				const res = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json", ...authHeader() },
					body: JSON.stringify({
						body: trimmed,
						close_as_answered: closeAsAnswered,
					}),
				})
				if (!res.ok) {
					const errBody = await res.json().catch(() => ({}))
					throw new Error(errBody.error || `HTTP ${res.status}`)
				}
				// Refetch so the new reply + any status flip (`answered`)
				// land in the shared context and every consumer rerenders.
				await fetchFeedback()
			} finally {
				clearBusy(feedbackId)
			}
		},
		[intent, stage, fetchFeedback, markBusy, clearBusy],
	)

	return {
		items,
		loading,
		error,
		busyIds,
		creating,
		refetch: fetchFeedback,
		createFeedback,
		updateFeedback,
		deleteFeedback,
		replyToFeedback,
	}
}
