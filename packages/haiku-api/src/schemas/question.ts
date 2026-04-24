/**
 * Question answer endpoint — POST /question/:sessionId/answer
 *
 * Traversed by: additive-elaborate.feature, revisit-with-reasons.feature.
 *
 * Ground truth:
 * - Request schema mirrors the inline `QuestionAnswerSchema` in packages/haiku/src/http.ts
 *   (handleQuestionAnswerPost, ~line 527).
 * - Response shape mirrors the literal at http.ts ~line 562 — `Response.json({ ok: true })`.
 */

import { z } from "zod"
import { QuestionAnnotationsSchema } from "./common.js"

export const QuestionAnswerItemSchema = z
	.object({
		question: z
			.string()
			.max(1_000)
			.describe("Question prompt text (echoed back)"),
		selectedOptions: z
			.array(z.string().max(200))
			.max(50)
			.describe("Options the user selected (may contain one or many)"),
		otherText: z
			.string()
			.max(2_000)
			.optional()
			.describe("Free-text 'other' input, when the question allows it"),
	})
	.describe("A single question's answer in a multi-question session")
export type QuestionAnswerItem = z.infer<typeof QuestionAnswerItemSchema>

export const QuestionAnswerRequestSchema = z
	.object({
		answers: z.array(QuestionAnswerItemSchema).max(50),
		feedback: z.string().max(10_000).optional(),
		annotations: QuestionAnnotationsSchema.optional(),
	})
	.describe("POST /question/:sessionId/answer request body")
export type QuestionAnswerRequest = z.infer<typeof QuestionAnswerRequestSchema>

export const QuestionAnswerResponseSchema = z
	.object({
		ok: z.literal(true),
	})
	.describe("POST /question/:sessionId/answer response body")
export type QuestionAnswerResponse = z.infer<
	typeof QuestionAnswerResponseSchema
>
