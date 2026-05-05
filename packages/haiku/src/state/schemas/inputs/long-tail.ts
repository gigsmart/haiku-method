// state/schemas/inputs/long-tail.ts — TypeBox input schemas for
// the remaining state-tool family beyond unit / intent / stage /
// feedback. Twenty tools total: registry reads, settings, decision
// recording, dashboards / reports, repair / seed / backlog.
//
// Most are read-mostly with one or two args. We keep them in one
// file rather than fragmenting further — the surface is too small
// to justify per-tool files, and grouping them under a common
// `long-tail` heading mirrors the call site in state-tools.ts.
//
// Conditional substance checks (e.g. decision_record's
// no_decisions / decision / options / choice mutual exclusivity)
// stay in the handlers — the AJV gate enforces shape +
// additionalProperties: false, and the handler returns a stable
// named code (`decision_invalid`, etc.) when the conditional rule
// fires.

import { type Static, Type } from "@sinclair/typebox"
import { stateAjv } from "../_ajv.js"

const stateFile = Type.Optional(Type.String())
const empty = Type.Object(
	{ state_file: stateFile },
	{ additionalProperties: false },
)

// ── haiku_reconciliation_acknowledge ──────────────────────────────

export const HAIKU_RECONCILIATION_ACKNOWLEDGE_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		stage: Type.Optional(
			Type.String({
				description:
					"Stage name. Defaults to the intent's active_stage when omitted.",
			}),
		),
		// Handler enforces ≥10 chars with a precise named code; the
		// gate just enforces non-empty so the call shape is sound.
		rationale: Type.String({
			minLength: 1,
			description:
				"Rationale (≥10 chars in handler check) explaining why this divergence is intentional.",
		}),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuReconciliationAcknowledgeInput = Static<
	typeof HAIKU_RECONCILIATION_ACKNOWLEDGE_INPUT_SCHEMA
>
export const validateHaikuReconciliationAcknowledgeInputSchema =
	stateAjv.compile(HAIKU_RECONCILIATION_ACKNOWLEDGE_INPUT_SCHEMA)

// ── haiku_decision_record ─────────────────────────────────────────
//
// Conditional contract — when `no_decisions=true`, `rationale` is
// required and decision/options/choice must be absent. When
// `no_decisions` is false/absent, decision/options/choice are
// required. Enforcing that with if/then/else here would split the
// error shape across two paths; the handler already returns
// stable named codes for each combination.

export const HAIKU_DECISION_RECORD_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		stage: Type.Optional(Type.String()),
		no_decisions: Type.Optional(Type.Boolean()),
		decision: Type.Optional(Type.String()),
		options: Type.Optional(Type.Array(Type.String())),
		choice: Type.Optional(Type.String()),
		source: Type.Optional(
			Type.String({
				enum: ["user", "autonomous-acknowledged"],
				description:
					"Who made the call. user = user picked from agent-presented options. autonomous-acknowledged = agent chose and surfaced for veto-style approval.",
			}),
		),
		rationale: Type.Optional(Type.String()),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuDecisionRecordInput = Static<
	typeof HAIKU_DECISION_RECORD_INPUT_SCHEMA
>
export const validateHaikuDecisionRecordInputSchema = stateAjv.compile(
	HAIKU_DECISION_RECORD_INPUT_SCHEMA,
)

// ── haiku_knowledge_list ──────────────────────────────────────────

export const HAIKU_KNOWLEDGE_LIST_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuKnowledgeListInput = Static<
	typeof HAIKU_KNOWLEDGE_LIST_INPUT_SCHEMA
>
export const validateHaikuKnowledgeListInputSchema = stateAjv.compile(
	HAIKU_KNOWLEDGE_LIST_INPUT_SCHEMA,
)

// ── haiku_knowledge_read ──────────────────────────────────────────

export const HAIKU_KNOWLEDGE_READ_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		name: Type.String({ minLength: 1 }),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuKnowledgeReadInput = Static<
	typeof HAIKU_KNOWLEDGE_READ_INPUT_SCHEMA
>
export const validateHaikuKnowledgeReadInputSchema = stateAjv.compile(
	HAIKU_KNOWLEDGE_READ_INPUT_SCHEMA,
)

// ── haiku_skill_list / haiku_studio_list / haiku_dashboard /
// haiku_version_info — empty inputs ──────────────────────────────
//
// All four are no-arg tools. Sharing one schema keeps the SSOT
// honest (additionalProperties: false rejects accidental garbage
// from any of them).

export const HAIKU_EMPTY_INPUT_SCHEMA = empty
export type HaikuEmptyInput = Static<typeof HAIKU_EMPTY_INPUT_SCHEMA>
export const validateHaikuEmptyInputSchema = stateAjv.compile(empty)

// ── haiku_studio_get ──────────────────────────────────────────────

export const HAIKU_STUDIO_GET_INPUT_SCHEMA = Type.Object(
	{
		studio: Type.String({ minLength: 1 }),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuStudioGetInput = Static<typeof HAIKU_STUDIO_GET_INPUT_SCHEMA>
export const validateHaikuStudioGetInputSchema = stateAjv.compile(
	HAIKU_STUDIO_GET_INPUT_SCHEMA,
)

// ── haiku_studio_stage_get ────────────────────────────────────────

export const HAIKU_STUDIO_STAGE_GET_INPUT_SCHEMA = Type.Object(
	{
		studio: Type.String({ minLength: 1 }),
		stage: Type.String({ minLength: 1 }),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuStudioStageGetInput = Static<
	typeof HAIKU_STUDIO_STAGE_GET_INPUT_SCHEMA
>
export const validateHaikuStudioStageGetInputSchema = stateAjv.compile(
	HAIKU_STUDIO_STAGE_GET_INPUT_SCHEMA,
)

// ── haiku_settings_get ────────────────────────────────────────────

export const HAIKU_SETTINGS_GET_INPUT_SCHEMA = Type.Object(
	{
		field: Type.String({
			minLength: 1,
			description:
				"Dot-separated path (e.g. 'studio', 'stack.compute', 'review_agents')",
		}),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuSettingsGetInput = Static<
	typeof HAIKU_SETTINGS_GET_INPUT_SCHEMA
>
export const validateHaikuSettingsGetInputSchema = stateAjv.compile(
	HAIKU_SETTINGS_GET_INPUT_SCHEMA,
)

// ── haiku_settings_set ────────────────────────────────────────────
//
// `value` is multi-type — same Type.Unsafe escape hatch as
// haiku_unit_set / haiku_intent_set. The handler validates per-
// field against settings.schema.json after the gate.

export const HAIKU_SETTINGS_SET_INPUT_SCHEMA = Type.Object(
	{
		field: Type.String({ minLength: 1 }),
		value: Type.Unsafe<unknown>({
			type: ["string", "array", "number", "boolean", "null", "object"],
			description:
				"New value. Must validate against the field's declared shape in settings.schema.json. Pass null to delete.",
		}),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuSettingsSetInput = Static<
	typeof HAIKU_SETTINGS_SET_INPUT_SCHEMA
>
export const validateHaikuSettingsSetInputSchema = stateAjv.compile(
	HAIKU_SETTINGS_SET_INPUT_SCHEMA,
)

// ── haiku_capacity ────────────────────────────────────────────────

export const HAIKU_CAPACITY_INPUT_SCHEMA = Type.Object(
	{
		studio: Type.Optional(
			Type.String({ description: "Optional: filter to a specific studio" }),
		),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuCapacityInput = Static<typeof HAIKU_CAPACITY_INPUT_SCHEMA>
export const validateHaikuCapacityInputSchema = stateAjv.compile(
	HAIKU_CAPACITY_INPUT_SCHEMA,
)

// ── haiku_reflect ─────────────────────────────────────────────────

export const HAIKU_REFLECT_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuReflectInput = Static<typeof HAIKU_REFLECT_INPUT_SCHEMA>
export const validateHaikuReflectInputSchema = stateAjv.compile(
	HAIKU_REFLECT_INPUT_SCHEMA,
)

// ── haiku_review ──────────────────────────────────────────────────

export const HAIKU_REVIEW_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.Optional(
			Type.String({ description: "Optional: intent slug for context" }),
		),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuReviewInput = Static<typeof HAIKU_REVIEW_INPUT_SCHEMA>
export const validateHaikuReviewInputSchema = stateAjv.compile(
	HAIKU_REVIEW_INPUT_SCHEMA,
)

// ── haiku_review_open ─────────────────────────────────────────────

export const HAIKU_REVIEW_OPEN_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.Optional(
			Type.String({
				description:
					"Optional intent slug. Defaults to the sole active intent.",
			}),
		),
		stage: Type.Optional(
			Type.String({
				description:
					"Optional stage name. Defaults to the intent's active_stage.",
			}),
		),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuReviewOpenInput = Static<typeof HAIKU_REVIEW_OPEN_INPUT_SCHEMA>
export const validateHaikuReviewOpenInputSchema = stateAjv.compile(
	HAIKU_REVIEW_OPEN_INPUT_SCHEMA,
)

// ── haiku_backlog ─────────────────────────────────────────────────

export const HAIKU_BACKLOG_INPUT_SCHEMA = Type.Object(
	{
		action: Type.Optional(
			Type.String({
				enum: ["list", "add", "review", "promote"],
				description: "Defaults to `list`.",
			}),
		),
		description: Type.Optional(
			Type.String({
				description:
					"Description for the new backlog item (used with action=add).",
			}),
		),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuBacklogInput = Static<typeof HAIKU_BACKLOG_INPUT_SCHEMA>
export const validateHaikuBacklogInputSchema = stateAjv.compile(
	HAIKU_BACKLOG_INPUT_SCHEMA,
)

// ── haiku_seed ────────────────────────────────────────────────────

export const HAIKU_SEED_INPUT_SCHEMA = Type.Object(
	{
		action: Type.Optional(
			Type.String({
				enum: ["list", "plant", "check"],
				description: "Defaults to `list`.",
			}),
		),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuSeedInput = Static<typeof HAIKU_SEED_INPUT_SCHEMA>
export const validateHaikuSeedInputSchema = stateAjv.compile(
	HAIKU_SEED_INPUT_SCHEMA,
)

// ── haiku_release_notes ───────────────────────────────────────────

export const HAIKU_RELEASE_NOTES_INPUT_SCHEMA = Type.Object(
	{
		version: Type.Optional(
			Type.String({
				description: "Optional: specific version to extract (e.g. '1.2.0')",
			}),
		),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuReleaseNotesInput = Static<
	typeof HAIKU_RELEASE_NOTES_INPUT_SCHEMA
>
export const validateHaikuReleaseNotesInputSchema = stateAjv.compile(
	HAIKU_RELEASE_NOTES_INPUT_SCHEMA,
)

// ── haiku_repair ──────────────────────────────────────────────────

export const HAIKU_REPAIR_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.Optional(
			Type.String({
				description:
					"Specific intent slug to scan in cwd (skips multi-branch mode)",
			}),
		),
		apply: Type.Optional(Type.Boolean()),
		skip_branches: Type.Optional(Type.Boolean()),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuRepairInput = Static<typeof HAIKU_REPAIR_INPUT_SCHEMA>
export const validateHaikuRepairInputSchema = stateAjv.compile(
	HAIKU_REPAIR_INPUT_SCHEMA,
)
