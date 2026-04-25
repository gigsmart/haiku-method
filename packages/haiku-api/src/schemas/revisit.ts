/**
 * Revisit endpoint — POST /api/revisit/:sessionId
 *
 * Traversed by: revisit-with-reasons.feature, auto-revisit.feature.
 *
 * Ground truth:
 * - Request body mirrors the `haiku_revisit` MCP tool input at
 *   packages/haiku/src/orchestrator.ts (~line 6743): `{ intent, stage?, reasons? }`.
 *   The HTTP bridge resolves `intent` from the session (sessionId → intent_slug),
 *   so clients don't send it on the wire.
 * - Response shape mirrors what the orchestrator's revisit handler returns:
 *   an action name, optional target stage, and the list of feedback IDs it
 *   wrote before rolling the FSM back.
 */

import { z } from "zod"

/** A single feedback reason to record before rolling back. */
export const RevisitReasonSchema = z
	.object({
		title: z.string().min(1).max(200).describe("Feedback title"),
		body: z.string().min(1).max(10_000).describe("Feedback body (markdown)"),
	})
	.describe("A single revisit reason — becomes one feedback file")
export type RevisitReason = z.infer<typeof RevisitReasonSchema>

/** POST /api/revisit/:sessionId request body. */
export const RevisitRequestSchema = z
	.object({
		stage: z
			.string()
			.max(200)
			.optional()
			.describe(
				"Target stage to revisit. Omit to let the orchestrator infer the target.",
			),
		reasons: z
			.array(RevisitReasonSchema)
			.max(50)
			.optional()
			.describe(
				"Optional feedback reasons. Each creates a feedback file before the revisit. At most 50 reasons per request.",
			),
	})
	.describe("POST /api/revisit/:sessionId request body")
export type RevisitRequest = z.infer<typeof RevisitRequestSchema>

/** POST /api/revisit/:sessionId response body (200 on success). */
export const RevisitResponseSchema = z
	.object({
		ok: z.literal(true),
		action: z
			.string()
			.describe(
				"The orchestrator action name returned by the revisit (e.g. 'revisit').",
			),
		stage: z.string().optional().describe("Stage the FSM rolled back to."),
		feedback_created: z
			.array(z.string())
			.optional()
			.describe("FB-NN identifiers written before the revisit, in order."),
		message: z.string().describe("Human-readable summary."),
	})
	.describe("POST /api/revisit/:sessionId response body")
export type RevisitResponse = z.infer<typeof RevisitResponseSchema>
