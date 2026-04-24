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
	FeedbackReplySchema,
	FeedbackResolutionSchema,
	FeedbackStatusSchema,
} from "./common.js"

/** Inline text-anchor metadata — fills the gap between the visual
 *  `anchor` (viewport pin) and a text-selection comment. Wire format
 *  matches the snake_case conventions of the rest of the feedback
 *  surface so the same object shape flows through the schema, the
 *  filesystem frontmatter, and the GET response.
 *
 *  `file_path` is the authoritative locator: the UI parses it to
 *  decide which review tab and detail item to open, and an agent can
 *  open it directly and grep for `selected_text` to land on the
 *  exact line. Artifact kind + name are NOT stored separately —
 *  they're derivable from the path structure
 *  (`.haiku/intents/<slug>/stages/<stage>/units/<name>.md` →
 *  kind=unit, name=<name>). */
export const FeedbackInlineAnchorSchema = z
	.object({
		selected_text: z.string().min(1).max(1000),
		paragraph: z.number().int().nonnegative().max(10000),
		/** Human-readable label shown in the feedback card (e.g.
		 *  "Unit: Threat model and security hardening"). Not used for
		 *  routing — purely a display string. */
		location: z.string().max(500),
		/** DOM id attached to the `<span class="inline-highlight">` when
		 *  the comment was saved. Lets the viewer scroll-to-element
		 *  instead of doing a fragile text-match. */
		comment_id: z.string().max(200).optional(),
		/** Full relative path from the repo root to the artifact file —
		 *  e.g. `.haiku/intents/<slug>/stages/<stage>/units/unit-01-*.md`
		 *  or `.haiku/intents/<slug>/knowledge/DISCOVERY.md`. Agent
		 *  opens this file + greps for `selected_text` to find the exact
		 *  line; UI parses the path to pick the right review tab. */
		file_path: z.string().max(1000).optional(),
		/** Hash of the artifact's raw content at the moment the comment
		 *  was saved. Used to detect drift on revisit: if the file has
		 *  changed since, the UI paints the highlight in a "stale" style
		 *  and tags the sidebar card with a "content changed" note so the
		 *  reviewer knows the anchor may no longer match. A simple
		 *  non-cryptographic hash — collision risk is irrelevant here. */
		content_sha: z.string().max(64).optional(),
	})
	.describe("Inline text-anchor metadata for inline-comment feedback")
export type FeedbackInlineAnchor = z.infer<typeof FeedbackInlineAnchorSchema>

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
		resolution: FeedbackResolutionSchema.nullable()
			.optional()
			.describe(
				"Routing hint for the feedback resolver. null/unset = router defaults to stage_revisit.",
			),
		replies: z
			.array(FeedbackReplySchema)
			.optional()
			.describe(
				"Thread of replies on this feedback item. Empty / missing = no replies yet.",
			),
		inline_anchor: FeedbackInlineAnchorSchema.nullable()
			.optional()
			.describe(
				"Inline-text anchor metadata. Present when the feedback was created by selecting text in a rendered artifact and attaching a comment. Null / absent for visual-pin or plain chat feedback.",
			),
		scope: z
			.enum(["intent", "stage"])
			.optional()
			.describe(
				"Whether this feedback lives under .haiku/intents/<slug>/feedback/ (intent scope, logged by the studio-level completion review) or .haiku/intents/<slug>/stages/<stage>/feedback/ (stage scope, the normal adversarial review output). UI shows intent-scope items with a distinguishing chip so cross-stage findings don't get hidden behind a stage tab.",
			),
		iterations: z
			.array(
				z.object({
					bolt: z.number().int().nonnegative(),
					hat: z.string().max(200),
					started_at: z.string().max(40).optional(),
					completed_at: z.string().max(40).optional(),
					/** `advanced` = hat finished and handed off to the next hat
					 *  in the chain. `closed` = validator verified resolution
					 *  and marked the feedback closed. `reopened` = validator
					 *  rejected the fix and the bolt's budget was spent with
					 *  no resolution. `rejected` = a hat dismissed the finding
					 *  (rare; uses `haiku_feedback_reject`). */
					result: z
						.enum(["advanced", "closed", "reopened", "rejected"])
						.optional(),
					/** Git SHA of the commit the hat produced, when one was
					 *  made. Empty / absent for spec-reconciliation hats that
					 *  only edit knowledge artifacts without committing. */
					commit: z.string().max(64).optional(),
					/** Free-form reason — required when `result` is "reopened"
					 *  or "rejected" so the audit trail explains why a bolt
					 *  didn't close the finding. */
					reason: z.string().max(1000).optional(),
				}),
			)
			.optional()
			.describe(
				"Per-bolt history of the fix loop — one entry per hat that fires against this finding. Mirrors the `iterations:` frontmatter on unit files so reviewers can see at a glance why a finding needed multiple tries.",
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

/** Max size of an inline attachment `data:` URL. Generous enough for a
 *  1280×800 PNG wireframe screenshot (~200-800 KB); bigger feedback
 *  bodies are rejected 413 at the HTTP layer. */
export const FEEDBACK_ATTACHMENT_MAX_BYTES = 6_000_000

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
				"Ignored by the server — retained for backward compatibility only. The HTTP feedback-create handler always stamps `user` as the author for HTTP-sourced submissions (see packages/haiku/src/http.ts:1526). Do NOT rely on this field to convey identity: there is no session-context author resolution today, so honoring client-supplied values would let any HTTP caller forge authorship. Treat any value submitted here as untrusted data that crosses into the server trust boundary and is discarded.",
			),
		source_ref: z.string().max(1_000).nullable().optional(),
		anchor: FeedbackAnchorSchema.optional(),
		inline_anchor: FeedbackInlineAnchorSchema.optional(),
		resolution: FeedbackResolutionSchema.optional().describe(
			"Author's preferred resolution path. Router defaults to stage_revisit when omitted.",
		),
		/** Optional image attachment captured by the review UI — a
		 *  raster PNG / JPEG / WebP rendering of the reviewer's drawn
		 *  strokes. Shipped as a `data:image/<mime>;base64,...` URL and
		 *  persisted server-side as a sidecar file next to the
		 *  feedback markdown.
		 *
		 *  SVG is deliberately rejected. The feedback-attachment serve
		 *  route streams the raw bytes back to the browser with
		 *  `image/svg+xml`, which executes any embedded `<script>` in
		 *  the tunnel origin's security context. A reviewer — or anyone
		 *  who reaches the feedback POST via a leaked JWT — could plant
		 *  a stored-XSS payload against every future viewer. The
		 *  built-in annotator now rasterises strokes to PNG before
		 *  submitting. */
		attachment_data_url: z
			.string()
			.max(FEEDBACK_ATTACHMENT_MAX_BYTES)
			.regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, {
				message:
					"attachment_data_url must be a base64-encoded data URL for png/jpeg/webp (svg rejected — stored-XSS risk)",
			})
			.optional(),
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
 *  At least one of `status` / `closed_by` / `resolution` must be provided. */
export const FeedbackUpdateRequestSchema = z
	.object({
		status: FeedbackStatusSchema.optional(),
		closed_by: z.string().max(200).optional(),
		resolution: FeedbackResolutionSchema.nullable().optional(),
	})
	.refine(
		(data) =>
			data.status !== undefined ||
			data.closed_by !== undefined ||
			data.resolution !== undefined,
		{
			message:
				"At least one of 'status' / 'closed_by' / 'resolution' must be provided",
		},
	)
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

/** POST /api/feedback/:intent/:stage/:id/replies request body. */
export const FeedbackReplyCreateRequestSchema = z
	.object({
		body: z.string().min(1).max(5_000),
		author: z
			.string()
			.max(200)
			.optional()
			.describe(
				"Optional author hint. When omitted the server stamps 'user' or the agent name from session context.",
			),
		/** If true, the reply transitions the parent feedback to `answered`
		 *  in the same write. Used by the agent's `feedback_answer` action
		 *  and by the reviewer's "reply & close" action. */
		close_as_answered: z.boolean().optional(),
	})
	.describe("POST /api/feedback/:intent/:stage/:id/replies request body")
export type FeedbackReplyCreateRequest = z.infer<
	typeof FeedbackReplyCreateRequestSchema
>

/** POST /api/feedback/:intent/:stage/:id/replies response body. */
export const FeedbackReplyCreateResponseSchema = z
	.object({
		feedback_id: z.string(),
		reply_index: z
			.number()
			.int()
			.nonnegative()
			.describe("Zero-based index of the new reply inside replies[]."),
		status: FeedbackStatusSchema,
		message: z.string(),
	})
	.describe("POST /api/feedback/:intent/:stage/:id/replies response body")
export type FeedbackReplyCreateResponse = z.infer<
	typeof FeedbackReplyCreateResponseSchema
>
