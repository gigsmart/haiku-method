// state/schemas/inputs/feedback-variants.ts — TypeBox input
// schemas for the haiku_feedback_* tool variants beyond the
// create + update schemas in `state/schemas/feedback.ts`.
//
// Tools covered: delete, move, reject, list, read, write,
// advance_hat, reject_hat. All eight share the same numeric FB id
// shape and (intent, optional stage) targeting; the variant-
// specific knobs land per-schema.
//
// 2026-05-07: feedback_id was widened to accept "FB-NN" / "FB-N" /
// "NN" / "N" string forms via regex. Agents wasted ticks guessing
// which form the engine wanted (panda's session: tried "FB-08", "08",
// "8" in succession before finding the right combo). Tightened to
// `Type.Integer({ minimum: 1, maximum: 9999 })` — one input form, no
// guessing, schema-level rejection of malformed values. Display
// strings ("FB-08") still flow back on the response side; the input
// is just the number.

import { type Static, Type } from "@sinclair/typebox"
import { stateAjv } from "../_ajv.js"

// v4: FEEDBACK_STATUSES no longer exists — closed_at: string | null is
// the only lifecycle witness on FBs.

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
	feedback_id: Type.Integer({
		minimum: 1,
		maximum: 999,
		description:
			"Feedback identifier — the numeric prefix of the FB on disk (e.g. for `008-output-discovery-…md`, pass `8`). Just a number; no `FB-` prefix, no zero-padding, no string form. Range fits the on-disk `NNN-…md` 3-digit padding (max 999, plenty of room). The handler does prefix-match lookup against `<NNN>-*.md` — the agent never needs to know the slug part. Pre-2026-05-07 intents that used 2-digit padding (`08-…md`) still resolve correctly; the lookup parses leading digits regardless of width.",
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
		// v4: open|closed are the only states (derived from `closed_at`).
		// Filter via `closed: true|false` — pre-v4 `status:` filter is
		// gone with the FB status enum.
		closed: Type.Optional(
			Type.Boolean({
				description:
					"If true, list only closed feedback (closed_at != null). If false, list only open feedback (closed_at == null). Omit to list both.",
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

// ── haiku_feedback_set_targets ────────────────────────────────────
//
// Classifier-hat path: a user-authored FB lands without targets
// (target_unit: null, target_invalidates: []). The first hat in the
// fix-hats chain (classifier) reads the FB body, decides which unit
// it targets and which approvals get invalidated on closure, and
// calls this tool to record the decision. The tool refuses to write
// targets that have already been classified — once set, immutable
// per the FB-as-unit architecture (architecture §5).

export const HAIKU_FEEDBACK_SET_TARGETS_INPUT_SCHEMA = Type.Object(
	{
		...fbTargeting,
		target_unit: Type.Unsafe<string | null>({
			type: ["string", "null"],
			description:
				"Unit slug this FB targets (e.g. 'unit-03-business-context'), or null for intent-scope. Set once; subsequent calls are rejected.",
		}),
		target_invalidates: Type.Array(Type.String(), {
			description:
				"Approval/review role keys to clear on the targeted unit when this FB closes. e.g. ['user'] for user-recoverable findings, ['code-reviewer', 'spec'] for cross-role invalidation. Empty array is allowed (informational closure with no rerun).",
		}),
		reasoning: Type.Optional(
			Type.String({
				description:
					"Optional one-paragraph rationale for the classification choice. Stored on `targets.reasoning` and surfaced in the SPA next to the target so reviewers can see WHY the classifier picked this target_unit / target_invalidates combo. Encouraged for non-obvious classifications (e.g. cross-cutting findings routed to intent-scope).",
			}),
		),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuFeedbackSetTargetsInput = Static<
	typeof HAIKU_FEEDBACK_SET_TARGETS_INPUT_SCHEMA
>
export const validateHaikuFeedbackSetTargetsInputSchema = stateAjv.compile(
	HAIKU_FEEDBACK_SET_TARGETS_INPUT_SCHEMA,
)

// ── haiku_feedback_advance_hat ────────────────────────────────────
//
// The `reply` field is optional at the schema layer because mid-chain
// hat advances don't require it — only the terminal advance (the one
// that closes the FB) does. The handler enforces the requirement at
// runtime: when isLast === true, missing `reply` returns the stable
// `reply_required` error code. Schema-only enforcement isn't possible
// because "is this call terminal?" depends on the stored hat state
// the handler reads from disk.

export const HAIKU_FEEDBACK_ADVANCE_HAT_INPUT_SCHEMA = Type.Object(
	{
		...fbTargeting,
		reply: Type.Optional(
			Type.String({
				description:
					"REQUIRED when this advance closes the feedback (terminal hat in fix_hats). A short plain-language explanation of what was changed, written to the requester. Stored on the FB frontmatter as `closure_reply` and surfaced in the SPA review timeline. Mid-chain advances may omit it.",
			}),
		),
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
