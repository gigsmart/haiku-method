// state/schemas/inputs/units.ts — TypeBox input schemas for the
// haiku_unit_* tool family.
//
// One schema per tool. All declare `additionalProperties: false`
// so any field the agent sends that the schema didn't list is
// rejected at the AJV gate with a stable named code
// (`<tool>_input_invalid`). Pattern matches `feedback.ts`.
//
// Output schemas stay inline in the tool def for now — they're not
// validated at runtime (MCP doesn't validate server → client
// payloads), so the SSOT win is on inputs.

import { type Static, Type } from "@sinclair/typebox"
import { stateAjv } from "../_ajv.js"

// Re-used shape for tools that take {intent, stage, unit}.
const intentStageUnit = {
	intent: Type.String({ minLength: 1, description: "Intent slug" }),
	stage: Type.String({ minLength: 1, description: "Stage name" }),
	unit: Type.String({
		minLength: 1,
		description:
			"Unit name (no .md extension). Convention: `unit-NNN-slug` (3-digit zero-pad, max 999). Legacy 2-digit names (`unit-01-foo`) still resolve via numeric-prefix matching — pass either width and the engine matches by `(number, slug)` parts.",
	}),
} as const

// Internal session-state hook arg — every tool accepts it but it's
// transport plumbing, not part of the user-facing contract.
const stateFile = Type.Optional(Type.String())

// ── haiku_unit_set ────────────────────────────────────────────────
//
// `value` is a multi-type union — the handler validates per-field
// against the unit FM schema and rejects mismatches (`field_type_mismatch`).
// Schema lists `value` as `Type.Unknown()` because TypeBox doesn't
// have a clean way to express "any JSON value" that AJV will accept
// across all field types (string/array/object/number/boolean/null).

export const HAIKU_UNIT_SET_INPUT_SCHEMA = Type.Object(
	{
		...intentStageUnit,
		field: Type.String({
			minLength: 1,
			description:
				"Frontmatter field name. Must be agent-authorable per UNIT_FRONTMATTER_SCHEMA.",
		}),
		// Multi-type union expressed as a raw JSONSchema property
		// (TypeBox's `Type.Unknown` would emit `{}` — no `type`
		// field — which trips the server-tools assertion that every
		// inputSchema property carries a type. JSONSchema's
		// `type: [...]` array form is exactly the right shape for
		// "any of these primitive kinds"; the handler validates per-
		// field against UNIT_FRONTMATTER_SCHEMA and rejects
		// mismatches with `field_type_mismatch`).
		value: Type.Unsafe<unknown>({
			type: ["string", "array", "number", "boolean", "null", "object"],
			description:
				"The field's new value. MUST match the field's declared type in UNIT_FRONTMATTER_SCHEMA — pass an array for array-typed fields, a string for string-typed, etc. Native types only; stringified JSON is rejected.",
		}),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuUnitSetInput = Static<typeof HAIKU_UNIT_SET_INPUT_SCHEMA>
export const validateHaikuUnitSetInputSchema = stateAjv.compile(
	HAIKU_UNIT_SET_INPUT_SCHEMA,
)

// ── haiku_unit_list ───────────────────────────────────────────────

export const HAIKU_UNIT_LIST_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		stage: Type.String({ minLength: 1 }),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuUnitListInput = Static<typeof HAIKU_UNIT_LIST_INPUT_SCHEMA>
export const validateHaikuUnitListInputSchema = stateAjv.compile(
	HAIKU_UNIT_LIST_INPUT_SCHEMA,
)

// ── haiku_unit_start ──────────────────────────────────────────────
//
// `stage` is intentionally omitted — the handler resolves the unit's
// stage from the intent's frontmatter / on-disk layout.

export const HAIKU_UNIT_START_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		unit: Type.String({ minLength: 1 }),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuUnitStartInput = Static<typeof HAIKU_UNIT_START_INPUT_SCHEMA>
export const validateHaikuUnitStartInputSchema = stateAjv.compile(
	HAIKU_UNIT_START_INPUT_SCHEMA,
)

// ── haiku_unit_advance_hat ────────────────────────────────────────

export const HAIKU_UNIT_ADVANCE_HAT_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		unit: Type.String({ minLength: 1 }),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuUnitAdvanceHatInput = Static<
	typeof HAIKU_UNIT_ADVANCE_HAT_INPUT_SCHEMA
>
export const validateHaikuUnitAdvanceHatInputSchema = stateAjv.compile(
	HAIKU_UNIT_ADVANCE_HAT_INPUT_SCHEMA,
)

// ── haiku_unit_reject_hat ─────────────────────────────────────────

export const HAIKU_UNIT_REJECT_HAT_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		unit: Type.String({ minLength: 1 }),
		reason: Type.Optional(
			Type.String({
				description:
					"Short explanation of why the current hat's output was rejected (e.g. 'touch targets <44px on mobile', 'missing dark-mode tokens'). Recorded in the unit's iterations history.",
			}),
		),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuUnitRejectHatInput = Static<
	typeof HAIKU_UNIT_REJECT_HAT_INPUT_SCHEMA
>
export const validateHaikuUnitRejectHatInputSchema = stateAjv.compile(
	HAIKU_UNIT_REJECT_HAT_INPUT_SCHEMA,
)

// v4: haiku_unit_increment_bolt removed. Bolt is derived from
// iterations.length; agents never increment it directly.

// ── haiku_unit_read ───────────────────────────────────────────────

export const HAIKU_UNIT_READ_INPUT_SCHEMA = Type.Object(
	{
		...intentStageUnit,
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuUnitReadInput = Static<typeof HAIKU_UNIT_READ_INPUT_SCHEMA>
export const validateHaikuUnitReadInputSchema = stateAjv.compile(
	HAIKU_UNIT_READ_INPUT_SCHEMA,
)

// ── haiku_unit_delete ─────────────────────────────────────────────

export const HAIKU_UNIT_DELETE_INPUT_SCHEMA = Type.Object(
	{
		...intentStageUnit,
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuUnitDeleteInput = Static<typeof HAIKU_UNIT_DELETE_INPUT_SCHEMA>
export const validateHaikuUnitDeleteInputSchema = stateAjv.compile(
	HAIKU_UNIT_DELETE_INPUT_SCHEMA,
)

// ── haiku_unit_write ──────────────────────────────────────────────
//
// `frontmatter` is OPTIONAL but, when present, must satisfy
// UNIT_FRONTMATTER_SCHEMA. Inlining the schema rather than referencing
// it keeps the validation in one AJV pass — the alternative ($ref)
// would require schema registration.

export const HAIKU_UNIT_WRITE_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		stage: Type.String({ minLength: 1 }),
		unit: Type.String({
			minLength: 1,
			description:
				"Unit name without `.md` extension, e.g. `unit-001-foo`. Convention: `unit-NNN-slug` with 3-digit zero-padded number (max 999). Legacy 2-digit names (`unit-01-foo`) still resolve via numeric-prefix matching.",
		}),
		// `body` typed as plain string (no minLength here). The handler
		// runs a dedicated `empty_body` check after trim() so the agent
		// gets the precise `empty_body` error code instead of a generic
		// schema violation. Putting minLength here would shift the
		// rejection from a substance check to a syntax check — losing
		// the named code that downstream tests + agents match on.
		body: Type.String({
			description:
				"Full markdown body of the unit. Must be substantive (no placeholders like TBD, TODO, '...').",
		}),
		// `frontmatter` is intentionally untyped at the top-level gate
		// (any object). The substance validation — fsm_field_forbidden,
		// depends_on cycle / self-ref / unresolved, body placeholder
		// detection — runs through `validateUnitFrontmatter` after this
		// gate. That dedicated validator returns rule-by-rule errors
		// agents and tests already match on (`frontmatter_validation_failed`
		// with `errors[]` containing named codes); pre-validating here
		// would either duplicate the contract or shift the error shape
		// in a way that breaks every existing call site.
		frontmatter: Type.Optional(Type.Object({}, { additionalProperties: true })),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuUnitWriteInput = Static<typeof HAIKU_UNIT_WRITE_INPUT_SCHEMA>
export const validateHaikuUnitWriteInputSchema = stateAjv.compile(
	HAIKU_UNIT_WRITE_INPUT_SCHEMA,
)
