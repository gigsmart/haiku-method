/**
 * Design-direction select endpoint — POST /direction/:sessionId/select
 *
 * Traversed by: additive-elaborate.feature (design direction selection upstream of elaborate).
 *
 * Ground truth:
 * - Request schema mirrors the inline `DirectionSelectSchema` in packages/haiku/src/http.ts
 *   (handleDirectionSelectPost, ~line 595).
 * - Response shape mirrors the literal at http.ts ~line 609 — `Response.json({ ok: true })`.
 */

import { z } from "zod"

export const DirectionSelectRequestSchema = z
	.object({
		archetype: z
			.string()
			.max(64)
			.describe(
				"Archetype name selected by the user from the design-direction set",
			),
		parameters: z
			.record(z.string().max(100), z.number())
			.refine((record) => Object.keys(record).length <= 50, {
				message: "parameters must have at most 50 entries",
			})
			.describe("Parameter map (slider values keyed by parameter name)"),
	})
	.describe("POST /direction/:sessionId/select request body")
export type DirectionSelectRequest = z.infer<
	typeof DirectionSelectRequestSchema
>

export const DirectionSelectResponseSchema = z
	.object({
		ok: z.literal(true),
	})
	.describe("POST /direction/:sessionId/select response body")
export type DirectionSelectResponse = z.infer<
	typeof DirectionSelectResponseSchema
>
