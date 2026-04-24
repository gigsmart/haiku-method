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

/** Authorship type derived from origin — declared early so
 *  FeedbackReplySchema below can reference it. */
const AuthorTypeSchemaInternal = z
	.enum(["human", "agent"])
	.describe(
		"Derived from origin. Human-authored feedback cannot be closed/deleted by agents.",
	)

/** Origins a feedback item can come from. */
export const FeedbackOriginSchema = z
	.enum([
		"adversarial-review",
		"studio-review",
		"external-pr",
		"external-mr",
		"user-visual",
		"user-chat",
		"user-question",
		"agent",
	])
	.describe(
		"Origin of a feedback item. Derives author_type (human|agent) via state-tools.deriveAuthorType. `user-question` marks a reply-seeking item that the router handles with `feedback_answer` instead of a fix loop.",
	)
export type FeedbackOrigin = z.infer<typeof FeedbackOriginSchema>

/** Lifecycle status of a feedback item. */
export const FeedbackStatusSchema = z
	.enum(["pending", "fixing", "addressed", "answered", "closed", "rejected"])
	.describe(
		"Lifecycle: pending -> fixing -> addressed -> closed, or pending -> answered (question resolved by reply, no code delta), or pending -> rejected. Only pending/fixing block the stage gate.",
	)
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>

/** How the FSM should resolve a feedback item when the revisit flow
 *  picks it up. Default (undefined / null on the wire) behaves as
 *  `stage_revisit` so legacy flows regress cleanly. Authors — human or
 *  agent — set this to steer the router: a question skips the fix
 *  loop entirely, an inline fix runs a single bolt of the stage's
 *  fix_hats against the one finding, a stage revisit re-loops the
 *  whole stage (today's default), an upstream rewind routes the
 *  finding to the agent's `upstream_finding_surfaced` path. */
export const FeedbackResolutionSchema = z
	.enum(["question", "inline_fix", "stage_revisit", "upstream_rewind"])
	.describe(
		"Routing hint for the FSM's feedback resolver. null = caller has no preference, router defaults to stage_revisit.",
	)
export type FeedbackResolution = z.infer<typeof FeedbackResolutionSchema>

/** A reply on a feedback item — used to answer a question, record an
 *  agent's justification for closing/rejecting, or thread a short
 *  discussion without creating a new feedback item. */
export const FeedbackReplySchema = z
	.object({
		author: z
			.string()
			.min(1)
			.max(200)
			.describe("Free-form author handle ('user', agent name)."),
		author_type: AuthorTypeSchemaInternal,
		body: z.string().min(1).max(5_000).describe("Reply body (≤ 5,000 chars)."),
		created_at: z
			.string()
			.max(40)
			.describe("ISO-8601 timestamp the reply was written."),
	})
	.describe("A single reply on a feedback thread")
export type FeedbackReply = z.infer<typeof FeedbackReplySchema>

/** Authorship type derived from origin. */
export const AuthorTypeSchema = AuthorTypeSchemaInternal
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

/** An inline comment anchored to a span of text in a review artifact.
 *  `selectedText` + `location` together are enough for an agent to find
 *  the commented span in the source file: `location` names the file
 *  (e.g. `knowledge/DISCOVERY.md`, `stages/security/THREAT-MODEL.md`),
 *  `selectedText` is the exact string the reviewer highlighted, and
 *  `paragraph` disambiguates when the same text appears multiple times. */
export const InlineCommentSchema = z
	.object({
		selectedText: z
			.string()
			.max(2_000)
			.describe(
				"Highlighted text the comment anchors to (capped at 2,000 chars)",
			),
		comment: z
			.string()
			.max(10_000)
			.describe("Comment body (capped at 10,000 chars)"),
		paragraph: z
			.number()
			.describe("Zero-based paragraph index inside the reviewed artifact"),
		location: z
			.string()
			.max(500)
			.optional()
			.describe(
				"Artifact path (relative to intent root) the comment was made on — e.g. `knowledge/DISCOVERY.md` or `stages/security/THREAT-MODEL.md`. Omitted for unit-spec / in-session contexts where the parent has a single implicit location.",
			),
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

/** Transport label for a route — re-exported from `./auth.ts` where the
 *  transport + session-token schemas are centralized. v1 runtime policy:
 *  every declared route sets `transport: "loopback"` (enforced by the
 *  runtime invariant test in `test/schemas.test.mjs`). The schema itself
 *  permits `"loopback" | "token"` so future non-loopback routes are a
 *  one-line table edit, not a schema migration. */
export {
	type RouteTransport,
	RouteTransportSchema,
	type SessionToken,
	SessionTokenSchema,
	type TransportInvariant,
	TransportInvariantSchema,
} from "./auth.js"

/** Default body-size cap for JSON request bodies (1 MiB). */
export const DEFAULT_BODY_MAX_BYTES = 1_048_576 as const

/** Tighter cap for feedback update/delete endpoints (128 KiB). Text-only
 *  traffic — status flips, closed_by markers — never needs more. */
export const FEEDBACK_BODY_MAX_BYTES = 131_072 as const

/** Larger cap for feedback CREATE, which may carry an annotated
 *  screenshot as a `data:image/png;base64,...` URL. 8 MiB accommodates
 *  a full-resolution wireframe capture (~1-3 MB once base64-encoded)
 *  plus the text fields. Updates/deletes still use the tighter cap. */
export const FEEDBACK_CREATE_MAX_BYTES = 8_388_608 as const

/** Per-route body-size caps. Routes not listed default to DEFAULT_BODY_MAX_BYTES.
 *  The http.ts bridge enforces the default at the server level; the handler
 *  enforces the per-route cap before schema parse. */
export const ROUTE_BODY_LIMITS = {
	default: DEFAULT_BODY_MAX_BYTES,
	feedback: FEEDBACK_BODY_MAX_BYTES,
	feedbackCreate: FEEDBACK_CREATE_MAX_BYTES,
} as const
