/**
 * WebSocket envelope schemas — /ws/session/:sessionId
 *
 * Traversed by: review-ui-feedback.feature (decide/answer/select on the wire).
 *
 * Ground truth:
 * - Client -> server messages: `handleWebSocketMessage` in packages/haiku/src/http.ts (~line 724).
 *   Recognized `type` values: "decide" (review sessions), "answer" (question sessions),
 *   "select" (design_direction sessions).
 * - Server -> client messages: `sendToWebSocket` call sites in http.ts.
 *   Recognized envelopes: ack `{ ok: true, decision?, feedback? }`, error `{ error: string }`,
 *   plus session-update broadcasts from orchestrator/session stores.
 *
 * Size contract (unit-01 spec): every string field carries an explicit `.max()`
 * cap and the top-level client + server envelope schemas enforce a total
 * serialized frame size ≤ 64 KB via `.superRefine`. This mirrors the socket-
 * layer close-on-oversize check in `packages/haiku/src/http.ts` so that
 * external OpenAPI consumers derive the same wire contract from the schema.
 */

import { z } from "zod"
import { QuestionAnnotationsSchema, ReviewAnnotationsSchema } from "./common.js"
import { QuestionAnswerItemSchema } from "./question.js"

/** Maximum serialized size of a single WS frame (client or server), in bytes.
 *  MUST match the socket-layer `WS_MAX_FRAME_BYTES` in `packages/haiku/src/http.ts`
 *  (65,536 bytes = 64 KiB). The socket layer closes frames over this with close
 *  code 1009 (Message Too Big); this schema-level refinement is the CONTRACT
 *  enforcement so that external OpenAPI consumers derive their own validators
 *  with the same upper bound. */
export const WS_MAX_FRAME_BYTES = 65_536 as const

// ─── Client -> server ────────────────────────────────────────────────────

export const WsDecideMessageSchema = z
	.object({
		type: z.literal("decide"),
		decision: z.string().max(32),
		feedback: z.string().max(10_000).optional(),
		annotations: ReviewAnnotationsSchema.optional(),
	})
	.describe("Review decision frame (session_type=review)")
export type WsDecideMessage = z.infer<typeof WsDecideMessageSchema>

export const WsAnswerMessageSchema = z
	.object({
		type: z.literal("answer"),
		answers: z.array(QuestionAnswerItemSchema),
		feedback: z.string().max(10_000).optional(),
		annotations: QuestionAnnotationsSchema.optional(),
	})
	.describe("Question answer frame (session_type=question)")
export type WsAnswerMessage = z.infer<typeof WsAnswerMessageSchema>

export const WsSelectMessageSchema = z
	.object({
		type: z.literal("select"),
		archetype: z.string().max(64),
		parameters: z.record(z.number()),
		comments: z.string().max(10_000).optional(),
		annotations: z
			.object({
				screenshot: z.string().max(65_536).optional(),
				pins: z
					.array(
						z.object({
							x: z.number(),
							y: z.number(),
							text: z.string().max(1_000),
						}),
					)
					.optional(),
			})
			.optional(),
	})
	.describe("Design-direction select frame (session_type=design_direction)")
export type WsSelectMessage = z.infer<typeof WsSelectMessageSchema>

/** Shared frame-size refinement. Computed on the parsed value; since every WS
 *  schema uses only primitive zod shapes (no transforms, no defaults), the
 *  parsed representation round-trips to the same JSON size as the raw input,
 *  so this check reflects what the socket layer would see on the wire. */
const refineFrameSize = (value: unknown, ctx: z.RefinementCtx): void => {
	const size = JSON.stringify(value).length
	if (size > WS_MAX_FRAME_BYTES) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `Serialized frame size ${size} exceeds ${WS_MAX_FRAME_BYTES} bytes`,
			path: [],
		})
	}
}

export const WsClientMessageSchema = z
	.discriminatedUnion("type", [
		WsDecideMessageSchema,
		WsAnswerMessageSchema,
		WsSelectMessageSchema,
	])
	.superRefine(refineFrameSize)
	.describe("Any client -> server WebSocket envelope")
export type WsClientMessage = z.infer<typeof WsClientMessageSchema>

// ─── Server -> client ────────────────────────────────────────────────────

export const WsAckMessageSchema = z
	.object({
		type: z.literal("ack"),
		ok: z.literal(true),
		decision: z.string().max(32).optional(),
		feedback: z.string().max(10_000).optional(),
	})
	.describe(
		"Server acknowledgement frame. Shape aligns with the payload sendToWebSocket emits after a successful client message.",
	)
export type WsAckMessage = z.infer<typeof WsAckMessageSchema>

export const WsErrorMessageSchema = z
	.object({
		type: z.literal("error"),
		error: z.string().max(500),
	})
	.describe("Server error frame")
export type WsErrorMessage = z.infer<typeof WsErrorMessageSchema>

export const WsSessionUpdateMessageSchema = z
	.object({
		type: z.literal("session-update"),
		session_id: z.string().max(64),
		status: z.string().max(32),
		decision: z.string().max(32).optional(),
		feedback: z.string().max(10_000).optional(),
	})
	.describe(
		"Server broadcast when a session's durable status changes (review decided, question answered, direction selected).",
	)
export type WsSessionUpdateMessage = z.infer<
	typeof WsSessionUpdateMessageSchema
>

export const WsServerMessageSchema = z
	.discriminatedUnion("type", [
		WsAckMessageSchema,
		WsErrorMessageSchema,
		WsSessionUpdateMessageSchema,
	])
	.superRefine(refineFrameSize)
	.describe("Any server -> client WebSocket envelope")
export type WsServerMessage = z.infer<typeof WsServerMessageSchema>
