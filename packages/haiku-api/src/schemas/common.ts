/**
 * Shared primitives used across multiple route groups.
 *
 * Ground truth mapping:
 * - `FeedbackOriginSchema`    mirrors `FEEDBACK_ORIGINS`  in packages/haiku/src/state-tools.ts
 * - `FeedbackStatusSchema`    mirrors `FEEDBACK_STATUSES` in packages/haiku/src/state-tools.ts
 * - `PinSchema`               mirrors `ReviewAnnotations.pins[]` in packages/haiku/src/sessions.ts
 * - `InlineCommentSchema`     mirrors `ReviewAnnotations.comments[]` / `QuestionAnnotations.comments[]`
 * - `ReviewAnnotationsSchema` mirrors `ReviewAnnotations` in packages/haiku/src/sessions.ts
 * - `QuestionAnnotationsSchema` mirrors `QuestionAnnotations` in packages/haiku/src/sessions.ts
 */

import { z } from "zod"

/** Origins a feedback item can come from. */
export const FeedbackOriginSchema = z
	.enum([
		"adversarial-review",
		"studio-review",
		"external-pr",
		"external-mr",
		"user-visual",
		"user-chat",
		"agent",
	])
	.describe(
		"Origin of a feedback item. Derives author_type (human|agent) via state-tools.deriveAuthorType.",
	)
export type FeedbackOrigin = z.infer<typeof FeedbackOriginSchema>

/** Lifecycle status of a feedback item. */
export const FeedbackStatusSchema = z
	.enum(["pending", "fixing", "addressed", "closed", "rejected"])
	.describe(
		"Lifecycle: pending -> fixing -> addressed -> closed, or pending -> rejected. Only pending/fixing block the stage gate.",
	)
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>

/** Authorship type derived from origin. */
export const AuthorTypeSchema = z
	.enum(["human", "agent"])
	.describe(
		"Derived from origin. Human-authored feedback cannot be closed/deleted by agents.",
	)
export type AuthorType = z.infer<typeof AuthorTypeSchema>

/** A pin placed on a mockup/screenshot during review. */
export const PinSchema = z
	.object({
		x: z.number().describe("Pin x-coordinate (0..1 relative to canvas width)"),
		y: z.number().describe("Pin y-coordinate (0..1 relative to canvas height)"),
		text: z
			.string()
			.max(1_000)
			.describe("Pin comment body (capped at 1,000 chars)"),
	})
	.describe("Screenshot pin annotation")
export type Pin = z.infer<typeof PinSchema>

/** An inline comment anchored to a span of text in a review artifact. */
export const InlineCommentSchema = z
	.object({
		selectedText: z
			.string()
			.max(2_000)
			.describe("Highlighted text the comment anchors to (capped at 2,000 chars)"),
		comment: z
			.string()
			.max(10_000)
			.describe("Comment body (capped at 10,000 chars)"),
		paragraph: z
			.number()
			.describe("Zero-based paragraph index inside the reviewed artifact"),
	})
	.describe("Inline text-anchored comment annotation")
export type InlineComment = z.infer<typeof InlineCommentSchema>

/** Review-session annotation bundle (POST /review/:id/decide payload field). */
export const ReviewAnnotationsSchema = z
	.object({
		screenshot: z
			.string()
			.max(65_536)
			.optional()
			.describe(
				"Base64-encoded PNG of annotated canvas (capped at 65,536 chars — matches WS frame cap)",
			),
		pins: z.array(PinSchema).optional(),
		comments: z.array(InlineCommentSchema).optional(),
	})
	.describe("Annotations attached to a review decision")
export type ReviewAnnotations = z.infer<typeof ReviewAnnotationsSchema>

/** Question-session annotation bundle. */
export const QuestionAnnotationsSchema = z
	.object({
		comments: z.array(InlineCommentSchema).optional(),
	})
	.describe("Annotations attached to a question answer")
export type QuestionAnnotations = z.infer<typeof QuestionAnnotationsSchema>

/** Session discriminator — which kind of interactive session this is. */
export const SessionTypeSchema = z
	.enum(["review", "question", "design_direction"])
	.describe("Session type discriminator")
export type SessionType = z.infer<typeof SessionTypeSchema>

/** Aggregate session-status union spanning all three session types. */
export const SessionStatusSchema = z
	.enum(["pending", "decided", "answered", "approved", "changes_requested"])
	.describe(
		"Runtime status across review | question | design_direction sessions.",
	)
export type SessionStatus = z.infer<typeof SessionStatusSchema>

// ─── Validation + route metadata ─────────────────────────────────────────

/** Structural ZodIssue shape (kept open-ended — Zod versions tweak subtypes). */
export const ZodIssueWireSchema = z
	.object({
		code: z.string(),
		message: z.string(),
		path: z.array(z.union([z.string(), z.number()])),
	})
	.passthrough()
	.describe(
		"Structural ZodIssue on the wire — we expose code/message/path at minimum; extra keys are preserved via passthrough.",
	)
export type ZodIssueWire = z.infer<typeof ZodIssueWireSchema>

/** Uniform 400 envelope returned whenever a request body fails schema validation
 *  (including malformed JSON, which surfaces as a synthetic `invalid_json` issue). */
export const ValidationErrorSchema = z
	.object({
		error: z.literal("validation_failed"),
		issues: z.array(ZodIssueWireSchema),
	})
	.describe(
		"Uniform 400 response for request-body validation failure (malformed JSON, schema mismatch, oversize)",
	)
export type ValidationError = z.infer<typeof ValidationErrorSchema>

/** Transport label for a route. v1 only allows loopback — this is the
 *  security invariant: every declared route must be reachable only via the
 *  local 127.0.0.1 / ::1 listener (legitimate remote access is muxed via the
 *  tunnel, which itself fronts a loopback bind). */
export const RouteTransportSchema = z.enum(["loopback"]).describe(
	"Transport invariant — routes in haiku-api MUST declare 'loopback'.",
)
export type RouteTransport = z.infer<typeof RouteTransportSchema>

/** Default body-size cap for JSON request bodies (1 MiB). */
export const DEFAULT_BODY_MAX_BYTES = 1_048_576 as const

/** Tighter cap for feedback-bearing endpoints (128 KiB). */
export const FEEDBACK_BODY_MAX_BYTES = 131_072 as const

/** Per-route body-size caps. Routes not listed default to DEFAULT_BODY_MAX_BYTES.
 *  The http.ts bridge enforces the default at the server level; the handler
 *  enforces the per-route cap before schema parse. */
export const ROUTE_BODY_LIMITS = {
	default: DEFAULT_BODY_MAX_BYTES,
	feedback: FEEDBACK_BODY_MAX_BYTES,
} as const
