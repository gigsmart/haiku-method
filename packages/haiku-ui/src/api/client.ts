/**
 * ApiClient — single abstraction wrapping fetch + WebSocket so the UI does not
 * talk to the transport directly. Hosts that embed this SPA can inject a
 * custom client (for Storybook, tests, or non-HTTP transports).
 *
 * Route constants come from `haiku-api` — there are no hand-formatted paths
 * here.
 */

import {
	type DirectionSelectRequest,
	type DirectionSelectResponse,
	type FeedbackCreateRequest,
	type FeedbackCreateResponse,
	type FeedbackDeleteResponse,
	type FeedbackListResponse,
	type FeedbackStatus,
	type FeedbackUpdateRequest,
	type FeedbackUpdateResponse,
	paths,
	type QuestionAnswerRequest,
	type QuestionAnswerResponse,
	type ReviewCurrentPayload,
	type ReviewDecisionRequest,
	type ReviewDecisionResponse,
	type RevisitRequest,
	type RevisitResponse,
	type SessionPayload,
} from "haiku-api"
import { authHeader, getAuthToken } from "./auth"

const FETCH_HEADERS: Record<string, string> = {
	"bypass-tunnel-reminder": "1",
}

const JSON_HEADERS: Record<string, string> = {
	"Content-Type": "application/json",
	...FETCH_HEADERS,
}

/**
 * Name of the cross-session auth header the server requires on feedback
 * mutations (POST/PUT/DELETE `/api/feedback/...`). Server-side verification
 * lives in `verifyFeedbackMutationAuth` (packages/haiku/src/http.ts) — when
 * remote review is enabled (tunnel live), absence of this header is a 401.
 */
export const SESSION_HEADER = "X-Haiku-Session-Id"

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { error?: string }
		throw new Error(body.error || `HTTP ${res.status}`)
	}
	return (await res.json()) as T
}

export interface ApiClient {
	fetchSession(sessionId: string): Promise<SessionPayload>
	fetchReviewCurrent(): Promise<ReviewCurrentPayload>
	submitDecision(
		sessionId: string,
		body: ReviewDecisionRequest,
	): Promise<ReviewDecisionResponse>
	submitAnswer(
		sessionId: string,
		body: QuestionAnswerRequest,
	): Promise<QuestionAnswerResponse>
	submitDirection(
		sessionId: string,
		body: DirectionSelectRequest,
	): Promise<DirectionSelectResponse>
	submitRevisit(
		sessionId: string,
		body: RevisitRequest,
	): Promise<RevisitResponse>
	feedback: {
		list(
			intent: string,
			stage: string,
			status?: FeedbackStatus,
		): Promise<FeedbackListResponse>
		create(
			intent: string,
			stage: string,
			body: FeedbackCreateRequest,
		): Promise<FeedbackCreateResponse>
		update(
			intent: string,
			stage: string,
			id: string,
			body: FeedbackUpdateRequest,
		): Promise<FeedbackUpdateResponse>
		delete(
			intent: string,
			stage: string,
			id: string,
		): Promise<FeedbackDeleteResponse>
	}
	/**
	 * Set the session ID the client will attach as `X-Haiku-Session-Id` on
	 * feedback mutation requests. Pass `null` to clear. Called by the page
	 * shell once the session ID is known (URL param or initial payload) —
	 * required when the server runs with remote review enabled.
	 */
	setSessionId(sessionId: string | null): void
	/** Current session ID attached to mutations, or null if not set. */
	getSessionId(): string | null
	openWebSocket(sessionId: string): WebSocket | null
}

export function createDefaultApiClient(): ApiClient {
	// Closure-held sessionId — gets attached as `X-Haiku-Session-Id` on every
	// feedback mutation (POST/PUT/DELETE). The page shell calls
	// `setSessionId(...)` once it has the id from the URL/session payload.
	let sessionId: string | null = null

	// Per-call header builder. Merges in:
	//   - the session-id header (FB-20: cross-session auth on mutations).
	//   - the `Authorization: Bearer <jwt>` header (FB-30: tunnel auth on
	//     every tunnel-reachable route). `authHeader()` is a no-op when no
	//     token is present (local-only mode without a hash).
	// Both gates are no-ops when remote review is off.
	const withAuth = (base: Record<string, string>): Record<string, string> => ({
		...base,
		...authHeader(),
	})
	const withAuthAndSession = (
		base: Record<string, string>,
	): Record<string, string> => {
		const next = withAuth(base)
		return sessionId ? { ...next, [SESSION_HEADER]: sessionId } : next
	}

	return {
		async fetchSession(sessionId) {
			const res = await fetch(paths.session(sessionId), {
				headers: withAuth(FETCH_HEADERS),
			})
			return parseJsonOrThrow<SessionPayload>(res)
		},
		async fetchReviewCurrent() {
			const res = await fetch(paths.reviewCurrent(), {
				headers: withAuth(FETCH_HEADERS),
			})
			return parseJsonOrThrow<ReviewCurrentPayload>(res)
		},
		async submitDecision(sessionId, body) {
			const res = await fetch(paths.reviewDecide(sessionId), {
				method: "POST",
				headers: withAuth(JSON_HEADERS),
				body: JSON.stringify(body),
				keepalive: true,
			})
			return parseJsonOrThrow<ReviewDecisionResponse>(res)
		},
		async submitAnswer(sessionId, body) {
			const res = await fetch(paths.questionAnswer(sessionId), {
				method: "POST",
				headers: withAuth(JSON_HEADERS),
				body: JSON.stringify(body),
				keepalive: true,
			})
			return parseJsonOrThrow<QuestionAnswerResponse>(res)
		},
		async submitDirection(sessionId, body) {
			const res = await fetch(paths.directionSelect(sessionId), {
				method: "POST",
				headers: withAuth(JSON_HEADERS),
				body: JSON.stringify(body),
				keepalive: true,
			})
			return parseJsonOrThrow<DirectionSelectResponse>(res)
		},
		async submitRevisit(sessionId, body) {
			const res = await fetch(paths.revisit(sessionId), {
				method: "POST",
				headers: withAuth(JSON_HEADERS),
				body: JSON.stringify(body),
				keepalive: true,
			})
			return parseJsonOrThrow<RevisitResponse>(res)
		},
		feedback: {
			async list(intent, stage, status) {
				const qs = status ? `?status=${encodeURIComponent(status)}` : ""
				const res = await fetch(
					`${paths.feedbackList(encodeURIComponent(intent), encodeURIComponent(stage))}${qs}`,
					{ headers: withAuth(FETCH_HEADERS) },
				)
				return parseJsonOrThrow<FeedbackListResponse>(res)
			},
			async create(intent, stage, body) {
				const res = await fetch(
					paths.feedbackList(
						encodeURIComponent(intent),
						encodeURIComponent(stage),
					),
					{
						method: "POST",
						headers: withAuthAndSession(JSON_HEADERS),
						body: JSON.stringify(body),
					},
				)
				return parseJsonOrThrow<FeedbackCreateResponse>(res)
			},
			async update(intent, stage, id, body) {
				const res = await fetch(
					paths.feedbackItem(
						encodeURIComponent(intent),
						encodeURIComponent(stage),
						encodeURIComponent(id),
					),
					{
						method: "PUT",
						headers: withAuthAndSession(JSON_HEADERS),
						body: JSON.stringify(body),
					},
				)
				return parseJsonOrThrow<FeedbackUpdateResponse>(res)
			},
			async delete(intent, stage, id) {
				const res = await fetch(
					paths.feedbackItem(
						encodeURIComponent(intent),
						encodeURIComponent(stage),
						encodeURIComponent(id),
					),
					{ method: "DELETE", headers: withAuthAndSession(FETCH_HEADERS) },
				)
				return parseJsonOrThrow<FeedbackDeleteResponse>(res)
			},
		},
		setSessionId(next) {
			sessionId = next
		},
		getSessionId() {
			return sessionId
		},
		openWebSocket(sessionId) {
			if (typeof window === "undefined" || typeof WebSocket === "undefined") {
				return null
			}
			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
			// Browsers can't attach custom headers on the WebSocket upgrade,
			// so the tunnel-auth JWT rides in the query string. In local mode
			// `getAuthToken()` returns null and we fall back to an unauth'd
			// URL — the server-side gate is also a no-op there.
			const token = getAuthToken()
			const basePath = paths.wsSession(sessionId)
			const suffix = token ? `?t=${encodeURIComponent(token)}` : ""
			try {
				return new WebSocket(
					`${protocol}//${window.location.host}${basePath}${suffix}`,
				)
			} catch {
				return null
			}
		},
	}
}

/** Module-scope default client — single instance shared across the app. */
export const defaultApiClient: ApiClient = createDefaultApiClient()
