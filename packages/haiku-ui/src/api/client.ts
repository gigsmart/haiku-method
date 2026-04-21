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

const FETCH_HEADERS: Record<string, string> = {
	"bypass-tunnel-reminder": "1",
}

const JSON_HEADERS: Record<string, string> = {
	"Content-Type": "application/json",
	...FETCH_HEADERS,
}

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
	openWebSocket(sessionId: string): WebSocket | null
}

export function createDefaultApiClient(): ApiClient {
	return {
		async fetchSession(sessionId) {
			const res = await fetch(paths.session(sessionId), {
				headers: FETCH_HEADERS,
			})
			return parseJsonOrThrow<SessionPayload>(res)
		},
		async fetchReviewCurrent() {
			const res = await fetch(paths.reviewCurrent(), {
				headers: FETCH_HEADERS,
			})
			return parseJsonOrThrow<ReviewCurrentPayload>(res)
		},
		async submitDecision(sessionId, body) {
			const res = await fetch(paths.reviewDecide(sessionId), {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify(body),
				keepalive: true,
			})
			return parseJsonOrThrow<ReviewDecisionResponse>(res)
		},
		async submitAnswer(sessionId, body) {
			const res = await fetch(paths.questionAnswer(sessionId), {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify(body),
				keepalive: true,
			})
			return parseJsonOrThrow<QuestionAnswerResponse>(res)
		},
		async submitDirection(sessionId, body) {
			const res = await fetch(paths.directionSelect(sessionId), {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify(body),
				keepalive: true,
			})
			return parseJsonOrThrow<DirectionSelectResponse>(res)
		},
		async submitRevisit(sessionId, body) {
			const res = await fetch(paths.revisit(sessionId), {
				method: "POST",
				headers: JSON_HEADERS,
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
					{ headers: FETCH_HEADERS },
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
						headers: JSON_HEADERS,
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
						headers: JSON_HEADERS,
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
					{ method: "DELETE", headers: FETCH_HEADERS },
				)
				return parseJsonOrThrow<FeedbackDeleteResponse>(res)
			},
		},
		openWebSocket(sessionId) {
			if (typeof window === "undefined" || typeof WebSocket === "undefined") {
				return null
			}
			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
			try {
				return new WebSocket(
					`${protocol}//${window.location.host}${paths.wsSession(sessionId)}`,
				)
			} catch {
				return null
			}
		},
	}
}

/** Module-scope default client — single instance shared across the app. */
export const defaultApiClient: ApiClient = createDefaultApiClient()
