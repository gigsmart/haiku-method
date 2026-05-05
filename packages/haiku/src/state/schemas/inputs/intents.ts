// state/schemas/inputs/intents.ts — TypeBox input schemas for the
// haiku_intent_* tool family.

import { type Static, Type } from "@sinclair/typebox"
import { stateAjv } from "../_ajv.js"

const stateFile = Type.Optional(Type.String())

// ── haiku_intent_get ──────────────────────────────────────────────

export const HAIKU_INTENT_GET_INPUT_SCHEMA = Type.Object(
	{
		slug: Type.String({ minLength: 1, description: "Intent slug" }),
		field: Type.String({
			minLength: 1,
			description: "Frontmatter field name to read",
		}),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuIntentGetInput = Static<typeof HAIKU_INTENT_GET_INPUT_SCHEMA>
export const validateHaikuIntentGetInputSchema = stateAjv.compile(
	HAIKU_INTENT_GET_INPUT_SCHEMA,
)

// ── haiku_intent_list ─────────────────────────────────────────────

export const HAIKU_INTENT_LIST_INPUT_SCHEMA = Type.Object(
	{
		include_archived: Type.Optional(
			Type.Boolean({
				description:
					"When true, include archived intents in the result and add an 'archived' field to each response object. Defaults to false.",
			}),
		),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuIntentListInput = Static<typeof HAIKU_INTENT_LIST_INPUT_SCHEMA>
export const validateHaikuIntentListInputSchema = stateAjv.compile(
	HAIKU_INTENT_LIST_INPUT_SCHEMA,
)

// ── haiku_intent_set ──────────────────────────────────────────────

export const HAIKU_INTENT_SET_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		field: Type.String({ minLength: 1 }),
		// Multi-type — handler validates per-field against
		// INTENT_FRONTMATTER_SCHEMA. See note on haiku_unit_set's
		// `value` for why we use Type.Unsafe with a JSONSchema
		// `type: [...]` array.
		value: Type.Unsafe<unknown>({
			type: ["string", "array", "number", "boolean", "null", "object"],
			description:
				"New value. Must match the field's declared type in INTENT_FRONTMATTER_SCHEMA. Mismatches return `intent_field_type_mismatch`.",
		}),
		state_file: stateFile,
	},
	{ additionalProperties: false },
)
export type HaikuIntentSetInput = Static<typeof HAIKU_INTENT_SET_INPUT_SCHEMA>
export const validateHaikuIntentSetInputSchema = stateAjv.compile(
	HAIKU_INTENT_SET_INPUT_SCHEMA,
)
