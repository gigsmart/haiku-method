// state/schemas/intent.ts — TypeBox-defined schema for intent
// frontmatter shapes. Mirrors plugin/schemas/intent.schema.json.
// AJV-validated when an agent calls haiku_intent_set; the
// `propertyNames.not.enum` list rejects engine-only fields the
// workflow engine owns (status, active_stage, phase,
// completion_review_*, completed_at, etc).
//
// Parallel to UNIT_FRONTMATTER_SCHEMA — same SSOT pattern.

import { type Static, Type } from "@sinclair/typebox"
import { stateAjv } from "./_ajv.js"

const FSM_DRIVEN_INTENT_FIELDS_LIST = [
	// Engine-managed lifecycle fields
	"status",
	"active_stage",
	"phase",
	"started_at",
	"completed_at",
	"created_at",
	// Completion-review state machine
	"completion_review_dispatched",
	"completion_review_skipped",
	"completion_review_entered_at",
	"completion_review_dispatched_at",
	// Engine-derived collections
	"stages",
	"composite",
	"intent_reviewed",
	// Archive lifecycle (toggle via haiku_intent_archive / _unarchive)
	"archived",
	"archived_at",
	// Parent-link (creation-time only)
	"follows",
	// Legacy alias for mode
	"autopilot",
] as const

export const INTENT_FRONTMATTER_SCHEMA = Type.Object(
	{
		title: Type.Optional(Type.String({ minLength: 1 })),
		mode: Type.Optional(
			Type.String({
				enum: ["continuous", "discrete", "autopilot", "discrete-hybrid"],
			}),
		),
		skip_stages: Type.Optional(Type.Array(Type.String())),
		intent_completion_review: Type.Optional(Type.Boolean()),
		// `studio` is set on creation by haiku_select_studio and is
		// immutable thereafter — accepted by AJV (so tests building
		// fixtures don't fail) but rejected by the haiku_intent_set
		// handler with a dedicated `intent_field_immutable` code.
		studio: Type.Optional(Type.String()),
	},
	{
		propertyNames: { not: { enum: [...FSM_DRIVEN_INTENT_FIELDS_LIST] } },
		additionalProperties: true,
	},
)

export type IntentFrontmatter = Static<typeof INTENT_FRONTMATTER_SCHEMA>

export const validateIntentFrontmatterSchema = stateAjv.compile(
	INTENT_FRONTMATTER_SCHEMA,
)

export const AGENT_AUTHORABLE_INTENT_FIELDS = Object.keys(
	INTENT_FRONTMATTER_SCHEMA.properties ?? {},
) as ReadonlyArray<string>

export const FSM_DRIVEN_INTENT_FIELDS = FSM_DRIVEN_INTENT_FIELDS_LIST

/** Fields immutable after intent creation (handler-rejected, not
 *  schema-rejected — AJV accepts them so test fixtures still build). */
export const INTENT_IMMUTABLE_FIELDS: ReadonlyArray<string> = ["studio"]
