/**
 * Route table — the canonical enumeration of every HTTP route and WebSocket
 * upgrade path handled by packages/haiku/src/http.ts. Consumed by:
 *   - `openapi.buildOpenApi()` to emit dist/openapi.json
 *   - tests in test/routes.test.mjs that assert every concrete handler in
 *     http.ts has a matching entry here
 *   - (future, unit-02+) the MCP backend and SPA to resolve path constants
 *
 * Path templates use RFC 6570 style (`{param}`). The `paths` object exposes
 * small builder functions so callers don't need to hand-format the templates.
 */

import type { ZodTypeAny } from "zod"
import {
	DEFAULT_BODY_MAX_BYTES,
	FEEDBACK_BODY_MAX_BYTES,
	FEEDBACK_CREATE_MAX_BYTES,
	type RouteTransport,
} from "./schemas/common.js"
import {
	DirectionSelectRequestSchema,
	DirectionSelectResponseSchema,
} from "./schemas/direction.js"
import {
	FeedbackCreateRequestSchema,
	FeedbackCreateResponseSchema,
	FeedbackDeleteResponseSchema,
	FeedbackListResponseSchema,
	FeedbackReplyCreateRequestSchema,
	FeedbackReplyCreateResponseSchema,
	FeedbackUpdateRequestSchema,
	FeedbackUpdateResponseSchema,
} from "./schemas/feedback.js"
import {
	QuestionAnswerRequestSchema,
	QuestionAnswerResponseSchema,
} from "./schemas/question.js"
import {
	ReviewDecisionRequestSchema,
	ReviewDecisionResponseSchema,
} from "./schemas/review.js"
import {
	RevisitRequestSchema,
	RevisitResponseSchema,
} from "./schemas/revisit.js"
import {
	HeartbeatResponseSchema,
	SessionPayloadSchema,
} from "./schemas/session.js"

export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "OPTIONS"

export interface RouteSpec {
	/** HTTP method. `"WS"` is used for the WebSocket upgrade path. */
	method: HttpMethod | "WS"
	/** RFC-6570-style path template, e.g. `/api/session/{id}`. */
	pathTemplate: string
	/** Unique `operationId` surfaced into the emitted OpenAPI document. */
	operationId: string
	/** Request body schema, or null when the method has no request body. */
	request: ZodTypeAny | null
	/** Response body schema, or null for streams / empty responses. */
	response: ZodTypeAny | null
	/** Short human-readable summary (becomes OpenAPI `summary`). */
	summary: string
	/** Optional — tag grouping in the emitted OpenAPI document. */
	tag?: string
	/** Transport invariant. v1 hardcodes every route to `loopback`; any drift
	 *  should be caught by the transport-invariant test. */
	transport: RouteTransport
	/** Per-route request-body cap in bytes. Absent → use DEFAULT_BODY_MAX_BYTES.
	 *  Tighter than the global 1 MiB cap for routes like feedback that should
	 *  reject oversize bodies early. */
	maxBodyBytes?: number
}

/**
 * Path builders. Using functions (not just templates) forces consumers to
 * provide each parameter and keeps the path set refactorable.
 */
export const paths = {
	session: (id: string) => `/api/session/${id}`,
	sessionHeartbeat: (id: string) => `/api/session/${id}/heartbeat`,
	reviewCurrentPage: () => "/review/current",
	reviewPage: (id: string) => `/review/${id}`,
	reviewDecide: (id: string) => `/review/${id}/decide`,
	mockup: (id: string, path: string) => `/mockups/${id}/${path}`,
	wireframe: (id: string, path: string) => `/wireframe/${id}/${path}`,
	stageArtifact: (id: string, path: string) => `/stage-artifacts/${id}/${path}`,
	directionPage: (id: string) => `/direction/${id}`,
	directionSelect: (id: string) => `/direction/${id}/select`,
	questionImage: (id: string, index: number) =>
		`/question-image/${id}/${index}`,
	questionPage: (id: string) => `/question/${id}`,
	questionAnswer: (id: string, _?: never) => `/question/${id}/answer`,
	reviewCurrent: () => "/api/review/current",
	revisit: (id: string) => `/api/revisit/${id}`,
	feedbackList: (intent: string, stage: string) =>
		`/api/feedback/${intent}/${stage}`,
	feedbackItem: (intent: string, stage: string, id: string) =>
		`/api/feedback/${intent}/${stage}/${id}`,
	file: (id: string, path: string) => `/files/${id}/${path}`,
	health: () => "/health",
	wsSession: (id: string) => `/ws/session/${id}`,
} as const

/**
 * The canonical route table. Ordering follows the dispatch order in
 * http.ts :: handleRequest (lines ~1376-1520) so diffs against the source
 * stay readable.
 */
export const routes: readonly RouteSpec[] = [
	// File serving ────────────────────────────────────────────────────────
	{
		method: "GET",
		pathTemplate: "/files/{sessionId}/{path}",
		operationId: "getSessionFile",
		request: null,
		response: null,
		summary: "Serve a file from a session's file-bundle root (raw stream).",
		tag: "files",
		transport: "loopback",
	},

	// Session API ────────────────────────────────────────────────────────
	{
		method: "GET",
		pathTemplate: "/api/session/{sessionId}",
		operationId: "getSession",
		request: null,
		response: SessionPayloadSchema,
		summary: "Return session JSON for the SPA to render.",
		tag: "session",
		transport: "loopback",
	},
	{
		method: "HEAD",
		pathTemplate: "/api/session/{sessionId}/heartbeat",
		operationId: "sessionHeartbeat",
		request: null,
		response: HeartbeatResponseSchema,
		summary: "Client presence ping. 200 if session exists, 404 otherwise.",
		tag: "session",
		transport: "loopback",
	},

	// Review pane (always-available) ─────────────────────────────────────
	{
		method: "GET",
		pathTemplate: "/review/current",
		operationId: "getReviewCurrentPage",
		request: null,
		response: null,
		summary: "Serve the always-available review pane (HTML SPA entry).",
		tag: "review",
		transport: "loopback",
	},
	{
		method: "GET",
		pathTemplate: "/review/{sessionId}",
		operationId: "getReviewPage",
		request: null,
		response: null,
		summary: "Serve the review page for a session (HTML SPA entry).",
		tag: "review",
		transport: "loopback",
	},
	{
		method: "POST",
		pathTemplate: "/review/{sessionId}/decide",
		operationId: "postReviewDecide",
		request: ReviewDecisionRequestSchema,
		response: ReviewDecisionResponseSchema,
		summary: "Submit a review decision (approved | changes_requested).",
		tag: "review",
		transport: "loopback",
	},

	// Mockup / wireframe / stage-artifact file serving ───────────────────
	{
		method: "GET",
		pathTemplate: "/mockups/{sessionId}/{path}",
		operationId: "getMockup",
		request: null,
		response: null,
		summary: "Serve a mockup asset for a review session (raw stream).",
		tag: "files",
		transport: "loopback",
	},
	{
		method: "GET",
		pathTemplate: "/wireframe/{sessionId}/{path}",
		operationId: "getWireframe",
		request: null,
		response: null,
		summary: "Serve a wireframe asset for a review session (raw stream).",
		tag: "files",
		transport: "loopback",
	},
	{
		method: "GET",
		pathTemplate: "/stage-artifacts/{sessionId}/{path}",
		operationId: "getStageArtifact",
		request: null,
		response: null,
		summary: "Serve a stage artifact for a review session (raw stream).",
		tag: "files",
		transport: "loopback",
	},

	// Design direction ───────────────────────────────────────────────────
	{
		method: "GET",
		pathTemplate: "/direction/{sessionId}",
		operationId: "getDirectionPage",
		request: null,
		response: null,
		summary: "Serve the design-direction selection page (HTML SPA entry).",
		tag: "direction",
		transport: "loopback",
	},
	{
		method: "POST",
		pathTemplate: "/direction/{sessionId}/select",
		operationId: "postDirectionSelect",
		request: DirectionSelectRequestSchema,
		response: DirectionSelectResponseSchema,
		summary: "Record a design-direction archetype + parameter selection.",
		tag: "direction",
		transport: "loopback",
	},

	// Question ───────────────────────────────────────────────────────────
	{
		method: "GET",
		pathTemplate: "/question-image/{sessionId}/{index}",
		operationId: "getQuestionImage",
		request: null,
		response: null,
		summary: "Serve an image referenced by a question session (raw stream).",
		tag: "question",
		transport: "loopback",
	},
	{
		method: "GET",
		pathTemplate: "/question/{sessionId}",
		operationId: "getQuestionPage",
		request: null,
		response: null,
		summary: "Serve the question page (HTML SPA entry).",
		tag: "question",
		transport: "loopback",
	},
	{
		method: "POST",
		pathTemplate: "/question/{sessionId}/answer",
		operationId: "postQuestionAnswer",
		request: QuestionAnswerRequestSchema,
		response: QuestionAnswerResponseSchema,
		summary: "Submit answers for a question session.",
		tag: "question",
		transport: "loopback",
	},

	// Revisit ────────────────────────────────────────────────────────────
	{
		method: "POST",
		pathTemplate: "/api/revisit/{sessionId}",
		operationId: "postRevisit",
		request: RevisitRequestSchema,
		response: RevisitResponseSchema,
		summary:
			"Request a stage revisit from the review UI. Optionally includes reasons that are written as feedback files before rollback.",
		tag: "review",
		transport: "loopback",
	},

	// Feedback CRUD ──────────────────────────────────────────────────────
	{
		method: "GET",
		pathTemplate: "/api/feedback/{intent}/{stage}",
		operationId: "listFeedback",
		request: null,
		response: FeedbackListResponseSchema,
		summary:
			"List feedback items for an intent's stage (optionally filter by status).",
		tag: "feedback",
		transport: "loopback",
	},
	{
		method: "POST",
		pathTemplate: "/api/feedback/{intent}/{stage}",
		operationId: "createFeedback",
		request: FeedbackCreateRequestSchema,
		response: FeedbackCreateResponseSchema,
		summary: "Create a new feedback item in an intent's stage.",
		tag: "feedback",
		transport: "loopback",
		// Larger cap than the update/delete routes because create may
		// carry a base64-encoded screenshot attachment.
		maxBodyBytes: FEEDBACK_CREATE_MAX_BYTES,
	},
	{
		method: "PUT",
		pathTemplate: "/api/feedback/{intent}/{stage}/{feedbackId}",
		operationId: "updateFeedback",
		request: FeedbackUpdateRequestSchema,
		response: FeedbackUpdateResponseSchema,
		summary: "Update status or closed_by on a feedback item.",
		tag: "feedback",
		transport: "loopback",
		maxBodyBytes: FEEDBACK_BODY_MAX_BYTES,
	},
	{
		method: "DELETE",
		pathTemplate: "/api/feedback/{intent}/{stage}/{feedbackId}",
		operationId: "deleteFeedback",
		request: null,
		response: FeedbackDeleteResponseSchema,
		summary: "Delete a feedback item (blocks open items via 409).",
		tag: "feedback",
		transport: "loopback",
	},
	{
		method: "GET",
		pathTemplate: "/api/feedback-attachment/{intent}/{stage}/{filename}",
		operationId: "getFeedbackAttachment",
		request: null,
		response: null,
		summary:
			"Serve an annotated-screenshot sidecar attached to a feedback item.",
		tag: "feedback",
		transport: "loopback",
	},
	{
		method: "POST",
		pathTemplate: "/api/feedback/{intent}/{stage}/{feedbackId}/replies",
		operationId: "createFeedbackReply",
		request: FeedbackReplyCreateRequestSchema,
		response: FeedbackReplyCreateResponseSchema,
		summary:
			"Append a reply to a feedback thread. Optionally closes the parent as 'answered'.",
		tag: "feedback",
		transport: "loopback",
		maxBodyBytes: FEEDBACK_BODY_MAX_BYTES,
	},

	// Health ─────────────────────────────────────────────────────────────
	{
		method: "GET",
		pathTemplate: "/health",
		operationId: "getHealth",
		request: null,
		response: null,
		summary:
			"Readiness probe used by the tunnel and any load balancer. Returns 200 `ok` once the server has finished listening and post-listen initialization; returns 503 `starting` before that.",
		tag: "health",
		transport: "loopback",
	},

	// WebSocket upgrade ──────────────────────────────────────────────────
	{
		method: "WS",
		pathTemplate: "/ws/session/{sessionId}",
		operationId: "upgradeSessionWebSocket",
		request: null,
		response: null,
		summary:
			"WebSocket upgrade for a session. Client and server envelopes are defined in schemas/websocket.ts.",
		tag: "websocket",
		transport: "loopback",
	},
] as const

/** Look up the per-route body cap for a given method + path template. */
export function routeBodyLimit(
	method: RouteSpec["method"],
	pathTemplate: string,
): number {
	const entry = routes.find(
		(r) => r.method === method && r.pathTemplate === pathTemplate,
	)
	return entry?.maxBodyBytes ?? DEFAULT_BODY_MAX_BYTES
}

/** Return every route that has both a request and a response schema. Used by
 *  the OpenAPI emitter to collect schemas for `components.schemas`. */
export function routesWithSchemas(): readonly RouteSpec[] {
	return routes.filter((r) => r.request !== null || r.response !== null)
}
