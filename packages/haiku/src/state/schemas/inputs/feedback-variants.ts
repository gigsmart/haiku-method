// state/schemas/inputs/feedback-variants.ts — TypeBox input
// schemas for the haiku_feedback_* tool variants beyond the
// create + update schemas in `state/schemas/feedback.ts`.
//
// Tools covered: delete, move, reject, list, read, write,
// advance_hat, reject_hat. All eight share the same FB-NN id
// shape and (intent, optional stage) targeting; the variant-
// specific knobs land per-schema.

import { type Static, Type } from "@sinclair/typebox"
import { stateAjv } from "../_ajv.js"
import { FB_ID_PATTERN, FEEDBACK_STATUSES } from "../feedback.js"

const stateFile = Type.Optional(Type.String())

// (intent, optional stage, fb_id) is the base targeting shape
// every variant uses except `list`.
const fbTargeting = {
	intent: Type.String({ minLength: 1, description: "Intent slug" }),
	stage: Type.Optional(
		Type.String({
			description: "Stage name. Omit for intent-scope feedback.",
		}),
	),
	feedback_id: Type.String({
		pattern: FB_ID_PATTERN,
		description: "FB-NN identifier (with or without the FB- prefix).",
	}),
} as const

// ── haiku_feedback_delete ─────────────────────────────────────────

export const HAIKU_FEEDBACK_DELETE_INPUT_SCHEMA = Type.Object(
	{
		...fbTargeting,
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuFeedbackDeleteInput = Static<
	typeof HAIKU_FEEDBACK_DELETE_INPUT_SCHEMA
>
export const validateHaikuFeedbackDeleteInputSchema = stateAjv.compile(
	HAIKU_FEEDBACK_DELETE_INPUT_SCHEMA,
)

// ── haiku_feedback_move ───────────────────────────────────────────
//
// `to_stage` is required and may be the empty string for intent-
// scope. Same-stage call confirms placement; different-stage call
// relocates the file. Handler enforces the same/different semantics
// and the closed/rejected immutability.

export const HAIKU_FEEDBACK_MOVE_INPUT_SCHEMA = Type.Object(
	{
		...fbTargeting,
		to_stage: Type.String({
			description:
				"Target stage. Empty string for intent-scope. Same as `stage` to confirm placement; different to relocate.",
		}),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuFeedbackMoveInput = Static<
	typeof HAIKU_FEEDBACK_MOVE_INPUT_SCHEMA
>
export const validateHaikuFeedbackMoveInputSchema = stateAjv.compile(
	HAIKU_FEEDBACK_MOVE_INPUT_SCHEMA,
)

// ── haiku_feedback_reject ─────────────────────────────────────────

export const HAIKU_FEEDBACK_REJECT_INPUT_SCHEMA = Type.Object(
	{
		...fbTargeting,
		reason: Type.String({
			minLength: 1,
			description: "Explanation for why this feedback is being rejected",
		}),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuFeedbackRejectInput = Static<
	typeof HAIKU_FEEDBACK_REJECT_INPUT_SCHEMA
>
export const validateHaikuFeedbackRejectInputSchema = stateAjv.compile(
	HAIKU_FEEDBACK_REJECT_INPUT_SCHEMA,
)

// ── haiku_feedback_list ───────────────────────────────────────────
//
// Different shape — no FB id, no required stage. `status` is an
// optional enum filter.

export const HAIKU_FEEDBACK_LIST_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1, description: "Intent slug" }),
		stage: Type.Optional(
			Type.String({
				description: "Stage name. Omit to list across all stages.",
			}),
		),
		status: Type.Optional(
			Type.String({
				enum: [...FEEDBACK_STATUSES],
				description: `Filter by status. One of: ${FEEDBACK_STATUSES.join(" | ")}.`,
			}),
		),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuFeedbackListInput = Static<
	typeof HAIKU_FEEDBACK_LIST_INPUT_SCHEMA
>
export const validateHaikuFeedbackListInputSchema = stateAjv.compile(
	HAIKU_FEEDBACK_LIST_INPUT_SCHEMA,
)

// ── haiku_feedback_read ───────────────────────────────────────────

export const HAIKU_FEEDBACK_READ_INPUT_SCHEMA = Type.Object(
	{
		...fbTargeting,
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuFeedbackReadInput = Static<
	typeof HAIKU_FEEDBACK_READ_INPUT_SCHEMA
>
export const validateHaikuFeedbackReadInputSchema = stateAjv.compile(
	HAIKU_FEEDBACK_READ_INPUT_SCHEMA,
)

// ── haiku_feedback_write ──────────────────────────────────────────
//
// Body-only update. The handler runs a dedicated `empty_body` check
// after trim() — leaving minLength off here so the agent gets the
// precise named code instead of a schema violation. Same pattern as
// haiku_unit_write.

export const HAIKU_FEEDBACK_WRITE_INPUT_SCHEMA = Type.Object(
	{
		...fbTargeting,
		body: Type.String({
			description:
				"Full markdown body to write. Replaces the prior body entirely.",
		}),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuFeedbackWriteInput = Static<
	typeof HAIKU_FEEDBACK_WRITE_INPUT_SCHEMA
>
export const validateHaikuFeedbackWriteInputSchema = stateAjv.compile(
	HAIKU_FEEDBACK_WRITE_INPUT_SCHEMA,
)

// ── haiku_feedback_advance_hat ────────────────────────────────────

export const HAIKU_FEEDBACK_ADVANCE_HAT_INPUT_SCHEMA = Type.Object(
	{
		...fbTargeting,
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuFeedbackAdvanceHatInput = Static<
	typeof HAIKU_FEEDBACK_ADVANCE_HAT_INPUT_SCHEMA
>
export const validateHaikuFeedbackAdvanceHatInputSchema = stateAjv.compile(
	HAIKU_FEEDBACK_ADVANCE_HAT_INPUT_SCHEMA,
)

// ── haiku_feedback_reject_hat ─────────────────────────────────────

export const HAIKU_FEEDBACK_REJECT_HAT_INPUT_SCHEMA = Type.Object(
	{
		...fbTargeting,
		reason: Type.Optional(
			Type.String({
				description:
					"Short explanation of why the current hat's work was rejected (recorded in the FB iteration history).",
			}),
		),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuFeedbackRejectHatInput = Static<
	typeof HAIKU_FEEDBACK_REJECT_HAT_INPUT_SCHEMA
>
export const validateHaikuFeedbackRejectHatInputSchema = stateAjv.compile(
	HAIKU_FEEDBACK_REJECT_HAT_INPUT_SCHEMA,
)
