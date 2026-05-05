// state/schemas/inputs/stages.ts — TypeBox input schemas for the
// haiku_stage_* tool family.

import { type Static, Type } from "@sinclair/typebox"
import { stateAjv } from "../_ajv.js"

const stateFile = Type.Optional(Type.String())

// ── haiku_stage_get ───────────────────────────────────────────────

export const HAIKU_STAGE_GET_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		stage: Type.String({ minLength: 1 }),
		field: Type.String({ minLength: 1 }),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuStageGetInput = Static<typeof HAIKU_STAGE_GET_INPUT_SCHEMA>
export const validateHaikuStageGetInputSchema = stateAjv.compile(
	HAIKU_STAGE_GET_INPUT_SCHEMA,
)

// ── haiku_stage_set ───────────────────────────────────────────────
//
// Engine-internal — every stage state field is workflow-managed.
// Agent calls are rejected with `stage_field_engine_only` after
// the schema gate passes; the schema only enforces the call's
// argument shape, not the field-level deny-list.

export const HAIKU_STAGE_SET_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		stage: Type.String({ minLength: 1 }),
		field: Type.String({ minLength: 1 }),
		value: Type.Unsafe<unknown>({
			type: ["string", "array", "number", "boolean", "null", "object"],
			description: "New value. Must match the field's declared type.",
		}),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuStageSetInput = Static<typeof HAIKU_STAGE_SET_INPUT_SCHEMA>
export const validateHaikuStageSetInputSchema = stateAjv.compile(
	HAIKU_STAGE_SET_INPUT_SCHEMA,
)
