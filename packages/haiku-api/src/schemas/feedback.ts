/**
 * Feedback CRUD endpoints — /api/feedback/:intent/:stage[/:id]
 *
 * Traversed by: feedback-crud.feature, review-ui-feedback.feature,
 *   external-review-feedback.feature, auto-revisit.feature, enforce-iteration-fix.feature.
 *
 * Ground truth:
 * - `FeedbackItemSchema` mirrors the projected response shape emitted by
 *   handleFeedbackGet (packages/haiku/src/http.ts ~line 974) which adapts
 *   state-tools.FeedbackItem (state-tools.ts ~line 3010) for the wire.
 * - `FeedbackCreateRequestSchema` mirrors the inline `FeedbackCreateSchema`
 *   at http.ts ~line 990.
 * - `FeedbackUpdateRequestSchema` mirrors the inline `FeedbackUpdateSchema`
 *   at http.ts ~line 1074 (with the same `refine` that at least one field
 *   must be present).
 * - Response literals mirror those at http.ts ~lines 1063, 1167, 1233.
 */

import { z } from "zod"
import {
	AuthorTypeSchema,
	FeedbackOriginSchema,
	FeedbackStatusSchema,
} from "./common.js"

/** Canonical on-the-wire feedback item. `feedback_id` is the "FB-NN" identifier
 *  (aliased from the on-disk `id` field by handleFeedbackGet). */
export const FeedbackItemSchema = z
	.object({
		feedback_id: z
			.string()
			.max(32)
			.describe("FB-NN identifier (scoped per stage)"),
		title: z.string().max(200),
		body: z.string().max(10_000),
		status: FeedbackStatusSchema,
		origin: FeedbackOriginSchema,
		author: z
			.string()
			.max(200)
			.describe("Free-form author handle (e.g. 'user', 'agent')"),
		author_type: AuthorTypeSchema,
		created_at: z.string().max(40).describe("ISO-8601 creation timestamp"),
		visit: z
			.number()
			.int()
			.nonnegative()
			.describe("Stage-visit counter at creation time"),
		source_ref: z
			.string()
			.max(1_000)
			.nullable()
			.describe("Back-reference to origin artifact (e.g. review-agent run id)"),
		closed_by: z
			.string()
			.max(200)
			.nullable()
			.describe(
				"Unit slug whose feedback-assessor hat certified closure, or null while open.",
			),
	})
	.describe("Wire shape of a feedback item")
export type FeedbackItem = z.infer<typeof FeedbackItemSchema>

/** GET /api/feedback/:intent/:stage response body. */
export const FeedbackListResponseSchema = z
	.object({
		intent: z.string(),
		stage: z.string(),
		count: z.number().int().nonnegative(),
		items: z.array(FeedbackItemSchema),
	})
	.describe("GET /api/feedback/:intent/:stage response body")
export type FeedbackListResponse = z.infer<typeof FeedbackListResponseSchema>

/** Pin-anchor metadata for visual (pin-drop) annotations. Optional on
 *  `FeedbackCreateRequestSchema` — only `origin: "user-visual"` traffic ships
 *  this block. `x`/`y` are unit-interval fractions of the viewport; `viewport*`
 *  are the pixel extents at the time the pin was dropped so later consumers
 *  can re-project into a different artifact scale. */
export const FeedbackAnchorSchema = z
	.object({
		pageId: z.string().min(1).max(200),
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		viewportWidth: z.number().int().positive().max(10000),
		viewportHeight: z.number().int().positive().max(10000),
	})
	.describe("Pin anchor metadata for visual annotations")
export type FeedbackAnchor = z.infer<typeof FeedbackAnchorSchema>

/** POST /api/feedback/:intent/:stage request body. */
export const FeedbackCreateRequestSchema = z
	.object({
		title: z.string().min(1).max(200),
		body: z.string().min(1).max(10_000),
		origin: FeedbackOriginSchema.optional().default("user-visual"),
		author: z
			.string()
			.max(200)
			.optional()
			.describe(
				"Optional authorship hint. The server currently overwrites this with the authenticated session author; the field is reserved for future use when the handler begins to honor it.",
			),
		source_ref: z.string().max(1_000).nullable().optional(),
		anchor: FeedbackAnchorSchema.optional(),
	})
	.describe("POST /api/feedback/:intent/:stage request body")
export type FeedbackCreateRequest = z.infer<typeof FeedbackCreateRequestSchema>

/** POST /api/feedback/:intent/:stage response body (201 on success). */
export const FeedbackCreateResponseSchema = z
	.object({
		feedback_id: z.string(),
		file: z
			.string()
			.describe(
				"Path to the committed feedback file (relative to .haiku root)",
			),
		status: z.literal("pending"),
		message: z.string(),
	})
	.describe("POST /api/feedback/:intent/:stage response body")
export type FeedbackCreateResponse = z.infer<
	typeof FeedbackCreateResponseSchema
>

/** PUT /api/feedback/:intent/:stage/:id request body.
 *  At least one of `status` / `closed_by` must be provided — enforced by refine. */
export const FeedbackUpdateRequestSchema = z
	.object({
		status: FeedbackStatusSchema.optional(),
		closed_by: z.string().max(200).optional(),
	})
	.refine((data) => data.status !== undefined || data.closed_by !== undefined, {
		message: "At least one of 'status' or 'closed_by' must be provided",
	})
	.describe("PUT /api/feedback/:intent/:stage/:id request body")
export type FeedbackUpdateRequest = z.infer<typeof FeedbackUpdateRequestSchema>

/** PUT /api/feedback/:intent/:stage/:id response body. */
export const FeedbackUpdateResponseSchema = z
	.object({
		feedback_id: z.string(),
		updated_fields: z
			.array(z.string())
			.describe("List of frontmatter fields that were actually changed"),
		message: z.string(),
	})
	.describe("PUT /api/feedback/:intent/:stage/:id response body")
export type FeedbackUpdateResponse = z.infer<
	typeof FeedbackUpdateResponseSchema
>

/** DELETE /api/feedback/:intent/:stage/:id response body. */
export const FeedbackDeleteResponseSchema = z
	.object({
		feedback_id: z.string(),
		deleted: z.literal(true),
		message: z.string(),
	})
	.describe("DELETE /api/feedback/:intent/:stage/:id response body")
export type FeedbackDeleteResponse = z.infer<
	typeof FeedbackDeleteResponseSchema
>
