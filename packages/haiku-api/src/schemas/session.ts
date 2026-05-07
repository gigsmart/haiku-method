/**
 * Session + review-current endpoints.
 *
 * Traversed by: additive-elaborate.feature, auto-revisit.feature,
 *   review-ui-feedback.feature, revisit-with-reasons.feature, feedback-crud.feature.
 *
 * Ground truth (after #245 god-file breakup, route handlers moved out of
 * packages/haiku/src/http.ts into packages/haiku/src/http/*.ts):
 * - `ReviewSessionPayloadSchema`    — respondSessionApi session_type === "review" branch
 *                                     in packages/haiku/src/http/session-api.ts.
 * - `QuestionSessionPayloadSchema`  — respondSessionApi session_type === "question" branch
 *                                     in packages/haiku/src/http/session-api.ts.
 * - `DirectionSessionPayloadSchema` — respondSessionApi session_type === "design_direction" branch
 *                                     in packages/haiku/src/http/session-api.ts.
 * - `HeartbeatResponseSchema`       — HEAD /api/session/:id/heartbeat (no body).
 * - Underlying session TS shapes live in packages/haiku/src/sessions.ts.
 *
 * Note: handleSessionApi builds the response imperatively and the field set
 * varies by session_type. We use a discriminated union keyed on
 * `session_type` to mirror exactly what the SPA sees on the wire.
 */

import { z } from "zod"
import {
	FeedbackStatusSchema,
	ReviewAnnotationsSchema,
	SessionStatusSchema,
} from "./common.js"

// ─── Structural parsed artifacts (loose-by-design) ───────────────────────
//
// handleSessionApi echoes parsed intent/unit/criteria structures built from
// markdown on disk. These are not schematized at unit-01 scope (they're
// internal parser output, not the wire contract being extracted). Treat them
// as opaque JSON so the discriminator still validates.

const LooseRecord = z
	.record(z.unknown())
	.describe(
		"Opaque parsed artifact (ParsedIntent / ParsedUnit / CriterionItem / etc.)",
	)

// ─── Review session payload ──────────────────────────────────────────────

export const GateTypeSchema = z
	.enum(["auto", "ask", "external", "await"])
	.describe("Review-gate type declared in STAGE.md")
export type GateType = z.infer<typeof GateTypeSchema>

export const StageStateInfoSchema = z
	.object({
		stage: z.string(),
		// v4: stage state is fully derived. `mergedIntoMain` is the only
		// load-bearing predicate — true when the stage branch is an
		// ancestor of intent main (git --is-ancestor). Everything else
		// the SPA used to render (phase, status, gate_outcome) is
		// re-derived from per-unit + per-feedback frontmatter on the
		// stage branch.
		mergedIntoMain: z.boolean(),
		// Compat shims — v3 SPA consumers read these fields. The API
		// response sets them to derived values until M6's SPA-consumer
		// rewrite lands. Optional + nullable so newer clients can ignore.
		status: z.string().optional().describe("Deprecated v3 shim — derived"),
		phase: z.string().optional().describe("Deprecated v3 shim — derived"),
		started_at: z.string().optional(),
		completed_at: z.string().nullable().optional(),
		gate_entered_at: z.string().nullable().optional(),
		gate_outcome: z.string().nullable().optional(),
	})
	.describe(
		"Per-stage status snapshot. v4: only `stage` and `mergedIntoMain` are authoritative; other fields are deprecated v3 shims pending SPA rewrite.",
	)
export type StageStateInfo = z.infer<typeof StageStateInfoSchema>

export const KnowledgeFileSchema = z.object({
	name: z.string(),
	content: z.string(),
})
export type KnowledgeFile = z.infer<typeof KnowledgeFileSchema>

export const StageArtifactSchema = z.object({
	stage: z.string(),
	name: z.string(),
	content: z.string(),
})
export type StageArtifact = z.infer<typeof StageArtifactSchema>

export const OutputArtifactSchema = z.object({
	stage: z.string(),
	name: z.string(),
	type: z.enum(["markdown", "html", "image", "file"]),
	content: z.string().optional(),
	/** URL the SPA fetches via the `/stage-artifacts/:sessionId/*`
	 *  route — already includes the route prefix and session id. */
	relativePath: z.string().optional(),
	/** Original intent-dir-relative path (e.g. `stages/design/artifacts/foo.md`,
	 *  `product/ACCEPTANCE-CRITERIA.md`). Used to look the artifact up in
	 *  `output_declared_by` so the SPA can render a "Declared by"
	 *  banner pointing at the unit(s) that own each deliverable. */
	intentRelativePath: z.string().optional(),
})
export type OutputArtifact = z.infer<typeof OutputArtifactSchema>

/** Per-unit output preview entry — one per path declared in the
 *  unit's `outputs:` frontmatter. The SPA's Units tab renders each
 *  entry as a click-out link with a hover popover that shows
 *  `previewBody` (markdown source via DOMPurify, or raw HTML via
 *  sandboxed iframe) or a thumbnail keyed off `url` (image) or a
 *  name+size summary (file). `exists: false` flags a
 *  declared-but-missing output; the UI still surfaces it but warns.
 *
 *  `previewBody` is intentionally NOT named `previewHtml` — for
 *  markdown entries it contains markdown source, not HTML, and
 *  injecting it as HTML without sanitization would silently XSS. The
 *  `markdown` / `html` discriminator on `type` tells the caller which
 *  rendering pipeline to apply. */
export const UnitOutputPreviewSchema = z.object({
	path: z.string(),
	name: z.string(),
	type: z.enum(["markdown", "html", "image", "file"]),
	url: z.string(),
	previewBody: z.string().optional(),
	sizeBytes: z.number().int().nonnegative().optional(),
	exists: z.boolean(),
})
export type UnitOutputPreview = z.infer<typeof UnitOutputPreviewSchema>

export const PreviousReviewSnapshotSchema = z
	.object({
		feedback: z.string(),
		reviewedAt: z.string(),
		intentRawContent: z.string(),
		unitRawContents: z.record(z.string()),
	})
	.describe(
		"Snapshot of the prior review attached when the current review follows a changes_requested decision.",
	)
export type PreviousReviewSnapshot = z.infer<
	typeof PreviousReviewSnapshotSchema
>

export const IntentCurrentStateSchema = z
	.object({
		studio: z.string(),
		stage: z.string(),
		phase: z.enum(["elaborate", "execute", "review", "gate", ""]),
		step: z.string().optional(),
		nextState: z
			.object({
				stage: z.string().optional(),
				phase: z.enum(["elaborate", "execute", "review", "gate"]).optional(),
				step: z.string().optional(),
				blockedOn: z
					.enum(["user-gate", "external-review", "feedback-fix"])
					.nullable()
					.optional(),
			})
			.nullable()
			.optional(),
	})
	.describe(
		"Unified current-state snapshot — derived fresh per request from per-stage state.json. The single source of truth for 'where is this intent right now?'.",
	)
export type IntentCurrentState = z.infer<typeof IntentCurrentStateSchema>

export const ApproveActionKindSchema = z.enum([
	"ad_hoc_done",
	"open_pr",
	"submit_external",
	"start_intent",
	"start_execution",
	"complete_stage",
	"submit_intent_review",
	"complete_intent",
	"approve",
])
export type ApproveActionKind = z.infer<typeof ApproveActionKindSchema>

export const ApproveActionSchema = z
	.object({
		label: z.string(),
		kind: ApproveActionKindSchema,
	})
	.describe(
		"Server-computed Approve button label + kind. The SPA renders `label` verbatim so the button reflects the next consequence (e.g. 'Complete Development Stage', 'Open Development Pull Request', 'Mark Intent Done').",
	)
export type ApproveAction = z.infer<typeof ApproveActionSchema>

/** Auto-detected delivery PR/MR — populated by `discoverReviewUrl()`
 *  in packages/haiku/src/discover-review-url.ts via raw git plumbing
 *  (`git ls-remote origin 'refs/pull/<n>/head'` for GitHub or
 *  `'refs/merge-requests/<n>/head'` for GitLab) when a published head
 *  ref matches the intent main branch's HEAD SHA. Surfaced
 *  informationally on terminal-intent screens; the engine never gates
 *  on this — `isBranchMerged` against intent main is the only signal. */
export const DiscoveredReviewUrlSchema = z
	.object({
		url: z.string(),
		source: z.enum(["github-pr-ref", "gitlab-mr-ref"]),
		prNumber: z.number().int().positive(),
		matchedSha: z.string(),
	})
	.describe("PR/MR auto-discovered via raw git from a published head ref")
export type DiscoveredReviewUrl = z.infer<typeof DiscoveredReviewUrlSchema>

export const ReviewSessionPayloadSchema = z
	.object({
		session_id: z.string(),
		session_type: z.literal("review"),
		status: SessionStatusSchema,
		intent_slug: z.string().optional(),
		intent_dir: z.string().optional(),
		gate_type: z.string().optional(),
		target: z.string().optional(),
		decision: z.string().optional(),
		feedback: z.string().optional(),
		annotations: ReviewAnnotationsSchema.optional(),
		intent: LooseRecord.optional(),
		units: z.array(LooseRecord).optional(),
		criteria: z.array(LooseRecord).optional(),
		mermaid: z.string().optional(),
		intent_mockups: z.array(LooseRecord).optional(),
		unit_mockups: z.record(z.array(LooseRecord)).optional(),
		stage_states: z.record(StageStateInfoSchema).optional(),
		current_state: IntentCurrentStateSchema.optional(),
		knowledge_files: z.array(KnowledgeFileSchema).optional(),
		stage_artifacts: z.array(StageArtifactSchema).optional(),
		output_artifacts: z.array(OutputArtifactSchema).optional(),
		/** Per-unit output preview entries keyed by unit slug. Built
		 *  server-side at session creation so the SPA doesn't have to
		 *  per-row-fetch each output's bytes. */
		unit_outputs: z.record(z.array(UnitOutputPreviewSchema)).optional(),
		/** Inverse of `unit_outputs`: keyed by intent-dir-relative
		 *  output path, lists the unit slugs that declared the path in
		 *  their `outputs:` frontmatter. The review UI surfaces this
		 *  as a banner above output content so reviewers can jump back
		 *  to the unit that owns each deliverable. */
		output_declared_by: z.record(z.array(z.string())).optional(),
		previous_review: PreviousReviewSnapshotSchema.optional(),
		discovered_review_url: DiscoveredReviewUrlSchema.nullable().optional(),
		/** Ad-hoc sessions are opened on demand via `haiku_review_open`
		 *  (not a gate). The UI hides Approve and shows an "Ad-hoc
		 *  review" badge instead of the session short-id. Feedback left
		 *  here is picked up by the normal fix-loop/revisit path on the
		 *  next `run_next`. */
		ad_hoc: z.boolean().optional(),
		/** The stage the reviewer opened the ad-hoc pane against. Used
		 *  for deep-link routing and for the header breadcrumb when the
		 *  intent has multiple stages. */
		stage: z.string().optional(),
		/** Where in the lifecycle this gate fires: stage_gate (default),
		 *  intent_review (first-stage elaborate), elaborate_to_execute,
		 *  intent_completion. Drives the Approve button label so the user
		 *  sees the actual next action. */
		gate_context: z.string().optional(),
		/** Stage that begins after approval, when one exists; null/omit on
		 *  the final stage gate. */
		next_stage: z.string().nullable().optional(),
		/** Phase that begins after approval (e.g. "execute" after
		 *  elaborate→execute). */
		next_phase: z.string().nullable().optional(),
		approve_action: ApproveActionSchema.optional(),
		/** True while a haiku_await_gate tool call is currently blocked
		 *  on this session. The SPA gates the Approve button on this:
		 *  when false (no engine waiting), Approve is disabled and the
		 *  composer shows "leave feedback to force a decision next
		 *  tick." When true, Approve fires the decision through to the
		 *  blocked await as today. */
		await_active: z.boolean().optional(),
		/** Cumulative number of awaits that have run on this session.
		 *  Useful for the SPA to detect "engine ticked back, new await
		 *  round started." */
		await_count: z.number().int().nonnegative().optional(),
		/** A decision the SPA submitted while no await was open. The
		 *  next haiku_await_gate call drains it on entry. The SPA
		 *  shows "decision queued, waiting for engine" when this is
		 *  set. */
		pending_decision: z
			.object({
				decision: z.string(),
				feedback: z.string(),
				submitted_at: z.string(),
			})
			.optional(),
		last_await_started_at: z.string().optional(),
		last_await_ended_at: z.string().optional(),
	})
	.describe(
		"Review session payload (GET /api/session/:id, session_type=review)",
	)
export type ReviewSessionPayload = z.infer<typeof ReviewSessionPayloadSchema>

// ─── Question session payload ────────────────────────────────────────────

export const QuestionDefSchema = z
	.object({
		question: z.string(),
		header: z.string().optional(),
		options: z.array(z.string()),
		multiSelect: z.boolean().optional(),
	})
	.describe("A single question in a multi-question session")
export type QuestionDef = z.infer<typeof QuestionDefSchema>

export const QuestionAnswerSchema = z.object({
	question: z.string(),
	selectedOptions: z.array(z.string()),
	otherText: z.string().optional(),
})
export type QuestionAnswer = z.infer<typeof QuestionAnswerSchema>

export const QuestionSessionPayloadSchema = z
	.object({
		session_id: z.string(),
		session_type: z.literal("question"),
		status: SessionStatusSchema,
		title: z.string().optional(),
		context: z.string().optional(),
		questions: z.array(QuestionDefSchema).optional(),
		answers: z.array(QuestionAnswerSchema).optional(),
		image_urls: z.array(z.string()).optional(),
	})
	.describe(
		"Question session payload (GET /api/session/:id, session_type=question)",
	)
export type QuestionSessionPayload = z.infer<
	typeof QuestionSessionPayloadSchema
>

// ─── Design-direction session payload ────────────────────────────────────

export const DesignArchetypeDataSchema = z.object({
	name: z.string(),
	description: z.string(),
	preview_html: z.string(),
})
export type DesignArchetypeData = z.infer<typeof DesignArchetypeDataSchema>

export const DirectionSelectionSchema = z
	.object({
		archetype: z.string(),
		comments: z.string().optional(),
		annotations: z
			.object({
				pins: z
					.array(
						z.object({
							x: z.number(),
							y: z.number(),
							text: z.string(),
						}),
					)
					.optional(),
				screenshots: z
					.array(
						z.object({
							comment: z.string(),
							screenshot_data_url: z.string(),
						}),
					)
					.optional(),
			})
			.optional(),
	})
	.describe("Saved direction selection (nullable on the session)")
export type DirectionSelection = z.infer<typeof DirectionSelectionSchema>

export const DirectionSessionPayloadSchema = z
	.object({
		session_id: z.string(),
		session_type: z.literal("design_direction"),
		status: SessionStatusSchema,
		title: z.string().optional(),
		intent_slug: z.string().optional(),
		archetypes: z.array(DesignArchetypeDataSchema).optional(),
		selection: DirectionSelectionSchema.nullable().optional(),
	})
	.describe(
		"Design-direction session payload (GET /api/session/:id, session_type=design_direction)",
	)
export type DirectionSessionPayload = z.infer<
	typeof DirectionSessionPayloadSchema
>

// ─── Picker session ──────────────────────────────────────────────────────

export const PickerKindSchema = z.enum([
	"studio",
	"mode",
	"stage",
	"confirm",
	"url_input",
])
export type PickerKind = z.infer<typeof PickerKindSchema>

export const PickerOptionSchema = z
	.object({
		id: z.string(),
		label: z.string(),
		description: z.string().optional(),
	})
	.describe(
		"One option in a picker session — id is the canonical value the wire echoes back, label/description are display-only",
	)
export type PickerOption = z.infer<typeof PickerOptionSchema>

export const PickerSelectionSchema = z
	.object({
		id: z.string(),
	})
	.describe("Saved picker selection (nullable on the session)")
export type PickerSelection = z.infer<typeof PickerSelectionSchema>

export const PickerSessionPayloadSchema = z
	.object({
		session_id: z.string(),
		session_type: z.literal("picker"),
		status: SessionStatusSchema,
		intent_slug: z.string().optional(),
		kind: PickerKindSchema,
		title: z.string(),
		prompt: z.string(),
		options: z.array(PickerOptionSchema),
		selection: PickerSelectionSchema.nullable().optional(),
	})
	.describe(
		"Picker session payload (GET /api/session/:id, session_type=picker) — engine-side blocking selection for studio/mode/stage and destructive-confirm",
	)
export type PickerSessionPayload = z.infer<typeof PickerSessionPayloadSchema>

export const PickerSelectRequestSchema = z
	.object({
		id: z.string().min(1).max(256),
	})
	.describe(
		"POST /picker/:sessionId/select request body — id must match one of the session's options",
	)
export type PickerSelectRequest = z.infer<typeof PickerSelectRequestSchema>

export const PickerSelectResponseSchema = z
	.object({
		ok: z.literal(true),
		id: z.string(),
	})
	.describe("Success response from POST /picker/:sessionId/select")
export type PickerSelectResponse = z.infer<typeof PickerSelectResponseSchema>

// ─── Discriminated-union session payload ─────────────────────────────────

export const SessionPayloadSchema = z
	.discriminatedUnion("session_type", [
		ReviewSessionPayloadSchema,
		QuestionSessionPayloadSchema,
		DirectionSessionPayloadSchema,
		PickerSessionPayloadSchema,
	])
	.describe(
		"GET /api/session/:id response body — discriminated on session_type",
	)
export type SessionPayload = z.infer<typeof SessionPayloadSchema>

// ─── /api/review/current ─────────────────────────────────────────────────

export const FeedbackSummarySchema = z
	.object({
		pending: z.number().int().nonnegative(),
		addressed: z.number().int().nonnegative(),
		closed: z.number().int().nonnegative(),
		rejected: z.number().int().nonnegative(),
	})
	.describe("Per-status counts of feedback items for the active stage.")
export type FeedbackSummary = z.infer<typeof FeedbackSummarySchema>

export const ReviewCurrentStageSchema = z.object({
	name: z.string(),
	status: z.string(),
	phase: z.string().optional(),
	iteration: z.number().optional(),
	iterations: z.array(z.unknown()).optional(),
	visits: z.number().optional(),
})
export type ReviewCurrentStage = z.infer<typeof ReviewCurrentStageSchema>

export const ReviewCurrentUnitSchema = z.object({
	slug: z.string(),
	title: z.string(),
	status: z.string(),
})
export type ReviewCurrentUnit = z.infer<typeof ReviewCurrentUnitSchema>

export const ReviewCurrentPayloadSchema = z
	.object({
		intent: z.string(),
		stage: z.string().nullable(),
		phase: z.string().optional(),
		units: z.array(ReviewCurrentUnitSchema),
		feedback_summary: FeedbackSummarySchema,
		stages: z.array(ReviewCurrentStageSchema),
	})
	.describe("GET /api/review/current response body")
export type ReviewCurrentPayload = z.infer<typeof ReviewCurrentPayloadSchema>

// ─── Heartbeat ──────────────────────────────────────────────────────────

/** HEAD /api/session/:id/heartbeat returns 200 (ok) or 404 (no such session).
 *  The response body is always empty; this schema only exists to slot a
 *  response envelope into the route table. */
export const HeartbeatResponseSchema = z
	.object({})
	.describe(
		"HEAD /api/session/:id/heartbeat — no body. 200 if session exists, 404 otherwise.",
	)
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>

// Re-export for convenience
export { FeedbackStatusSchema }
