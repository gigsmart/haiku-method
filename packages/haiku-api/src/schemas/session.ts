/**
 * Session + review-current endpoints.
 *
 * Traversed by: additive-elaborate.feature, auto-revisit.feature,
 *   review-ui-feedback.feature, revisit-with-reasons.feature, feedback-crud.feature.
 *
 * Ground truth:
 * - `ReviewSessionPayloadSchema`    — handleSessionApi session_type === "review" branch
 *                                     in packages/haiku/src/http.ts (~lines 71-104).
 * - `QuestionSessionPayloadSchema`  — handleSessionApi session_type === "question" branch
 *                                     (~lines 106-116).
 * - `DirectionSessionPayloadSchema` — handleSessionApi session_type === "design_direction" branch
 *                                     (~lines 118-124).
 * - `ReviewCurrentPayloadSchema`    — handleReviewCurrent (~lines 1242-1374).
 * - `HeartbeatResponseSchema`       — HEAD /api/session/:id/heartbeat (~line 1401), no body.
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

export const ReviewTypeSchema = z.enum(["intent", "unit"])
export type ReviewType = z.infer<typeof ReviewTypeSchema>

export const StageStateInfoSchema = z
	.object({
		stage: z.string(),
		status: z.string(),
		phase: z.string(),
		started_at: z.string().optional(),
		completed_at: z.string().nullable().optional(),
		gate_entered_at: z.string().nullable().optional(),
		gate_outcome: z.string().nullable().optional(),
	})
	.describe("Per-stage status snapshot")
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
	type: z.enum(["markdown", "html", "image"]),
	content: z.string().optional(),
	relativePath: z.string().optional(),
})
export type OutputArtifact = z.infer<typeof OutputArtifactSchema>

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

export const ReviewSessionPayloadSchema = z
	.object({
		session_id: z.string(),
		session_type: z.literal("review"),
		status: SessionStatusSchema,
		intent_slug: z.string().optional(),
		intent_dir: z.string().optional(),
		review_type: ReviewTypeSchema.optional(),
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
		knowledge_files: z.array(KnowledgeFileSchema).optional(),
		stage_artifacts: z.array(StageArtifactSchema).optional(),
		output_artifacts: z.array(OutputArtifactSchema).optional(),
		previous_review: PreviousReviewSnapshotSchema.optional(),
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
	default_parameters: z.record(z.number()),
})
export type DesignArchetypeData = z.infer<typeof DesignArchetypeDataSchema>

export const DesignParameterDataSchema = z.object({
	name: z.string(),
	label: z.string(),
	description: z.string(),
	min: z.number(),
	max: z.number(),
	step: z.number(),
	default: z.number(),
	labels: z.object({ low: z.string(), high: z.string() }),
})
export type DesignParameterData = z.infer<typeof DesignParameterDataSchema>

export const DirectionSelectionSchema = z
	.object({
		archetype: z.string(),
		parameters: z.record(z.number()),
		comments: z.string().optional(),
		annotations: z
			.object({
				screenshot: z.string().optional(),
				pins: z
					.array(
						z.object({
							x: z.number(),
							y: z.number(),
							text: z.string(),
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
		parameters: z.array(DesignParameterDataSchema).optional(),
		selection: DirectionSelectionSchema.nullable().optional(),
	})
	.describe(
		"Design-direction session payload (GET /api/session/:id, session_type=design_direction)",
	)
export type DirectionSessionPayload = z.infer<
	typeof DirectionSessionPayloadSchema
>

// ─── Discriminated-union session payload ─────────────────────────────────

export const SessionPayloadSchema = z
	.discriminatedUnion("session_type", [
		ReviewSessionPayloadSchema,
		QuestionSessionPayloadSchema,
		DirectionSessionPayloadSchema,
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
