/**
 * Review decide endpoint — POST /review/:sessionId/decide
 *
 * Traversed by: review-ui-feedback.feature, revisit-with-reasons.feature, auto-revisit.feature
 *
 * Ground truth:
 * - Request schema mirrors the inline `DecideSchema` in packages/haiku/src/http.ts (handleDecidePost, ~line 153).
 * - Response shape mirrors the literal at http.ts ~line 197 — `Response.json({ ok: true, decision, feedback })`.
 */

import { z } from "zod"
import { ReviewAnnotationsSchema } from "./common.js"

/** Decision value posted by the review UI. The server canonicalizes anything
 *  that isn't exactly "approved" to "changes_requested". */
export const ReviewDecisionSchema = z
	.enum(["approved", "changes_requested"])
	.describe(
		"Canonical review decision. Anything != approved is coerced to changes_requested server-side.",
	)
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>

export const ReviewDecisionRequestSchema = z
	.object({
		decision: z
			.string()
			.describe(
				"Raw decision string — server canonicalizes to 'approved' or 'changes_requested'.",
			),
		feedback: z
			.string()
			.optional()
			.describe("Reviewer-provided free-text feedback"),
		annotations: ReviewAnnotationsSchema.optional(),
	})
	.describe("POST /review/:sessionId/decide request body")
export type ReviewDecisionRequest = z.infer<typeof ReviewDecisionRequestSchema>

export const ReviewDecisionResponseSchema = z
	.object({
		ok: z.literal(true),
		decision: ReviewDecisionSchema,
		feedback: z.string(),
	})
	.describe("POST /review/:sessionId/decide response body")
export type ReviewDecisionResponse = z.infer<
	typeof ReviewDecisionResponseSchema
>
