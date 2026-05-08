// state/schemas/intent.ts — v4 intent.md frontmatter schema.
//
// In v4 the cursor walks aggregate state across intent.md + every
// unit.md + every feedback.md. There is no `state.json`, no
// `active_stage`, no `phase`. Everything that used to live there is
// derived.
//
// Engine-driven (FSM) fields the agent must NEVER write:
//   - plugin_version  : stamped on creation, immutable
//   - started_at      : stamped on first run_next that produces work
//   - approvals.*     : signed by reviewers, drift-swept against SHA
//   - sealed_at       : terminal write-lock when every approval signed
//
// Agent-authorable fields (creation + select_mode/select_studio):
//   - title, description, slug, mode, studio, granularity
//   - skip_stages (mode config)
//   - intent_completion_review (config flag)
//   - follows (parent-link, creation-time only)
//
// `studio` is immutable post-create — accepted by AJV (so test
// fixtures still build) but rejected by the haiku_intent_set handler
// with a stable named code.
//
// `mode` is engine-managed: set via haiku_select_mode (with elicitation),
// never via haiku_intent_create or haiku_intent_set. /haiku:change-mode
// drives mid-flight changes through the same tool.

import { type Static, Type } from "@sinclair/typebox"
import { stateAjv } from "./_ajv.js"
import { APPROVAL_SCHEMA } from "./approval.js"

const FSM_DRIVEN_INTENT_FIELDS_LIST = [
	"plugin_version",
	"started_at",
	"approvals",
	"sealed_at",
	// Mode is engine-managed: set via haiku_select_mode (with elicitation),
	// never via haiku_intent_create or haiku_intent_set.
	"mode",
	// Engine-derived stage list (set by haiku_select_mode).
	"stages",
	// Archive lifecycle (toggle via haiku_intent_archive / _unarchive).
	"archived",
	"archived_at",
] as const

export const INTENT_MODES = [
	"continuous",
	"discrete",
	"autopilot",
	"discrete-hybrid",
	"quick",
] as const

export type IntentMode = (typeof INTENT_MODES)[number]

// Approvals at intent scope share the same shape as unit-scope approvals.
// Per-key for: spec, continuity, <intent-completion-review-agent-N>, user.
// The cursor walks `Object.entries(approvals)` and routes through any
// null entry. The exact key set is derived from the studio's configured
// intent-completion review-agents at tick time.
const INTENT_APPROVALS_SCHEMA = Type.Record(
	Type.String(),
	Type.Union([APPROVAL_SCHEMA, Type.Null()]),
)

export const INTENT_FRONTMATTER_SCHEMA = Type.Object(
	{
		title: Type.Optional(Type.String({ minLength: 1 })),
		description: Type.Optional(Type.String()),
		// `slug` is intentionally NOT in the frontmatter. The intent
		// directory name IS the slug — `dirname(intent.md)` is the
		// single source of truth. Branches `haiku/<slug>` and
		// `haiku/<slug>/<stage>` derive from the path. Renames are
		// not supported in v4 — start a new intent with `follows:
		// <old-slug>` if you need a different identity.
		// `mode` accepted by AJV (so on-disk reads + tests validate)
		// but engine-only at write time — see FSM list.
		mode: Type.Optional(Type.String({ enum: [...INTENT_MODES] })),
		skip_stages: Type.Optional(Type.Array(Type.String())),
		intent_completion_review: Type.Optional(Type.Boolean()),
		studio: Type.Optional(Type.String()),
		granularity: Type.Optional(Type.String()),
		// Parent-link (creation-time only). Stores a slug reference.
		// If the referenced intent is renamed (unsupported but possible
		// out-of-band), the link breaks gracefully — `follows` is
		// informational, not load-bearing for cursor decisions.
		follows: Type.Optional(Type.String()),
		// Per-stage clarification answers, keyed by stage name.
		// Populated by the agent in response to a `clarify_required`
		// action — each stage's `clarify/*.md` directory drives the
		// questions; the agent records the user's answers here so the
		// cursor knows the gate is satisfied. Shape:
		//   clarifications: { <stage>: { answers: [{id, question, answer}], at } }
		// `Type.Unknown()` because the inner shape is open-ended (each
		// stage may have a different question set) — the engine reads
		// `clarifications[stage]` for a presence check, not validation.
		clarifications: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
	},
	{
		propertyNames: { not: { enum: [...FSM_DRIVEN_INTENT_FIELDS_LIST] } },
		// Other config fields under stage-specific or studio-specific
		// extensions are allowed; AJV permits unknowns. The deny list
		// catches FSM-driven fields at write time.
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

/** Fields immutable after intent creation. AJV accepts them so test
 *  fixtures still build; the haiku_intent_set handler returns a
 *  stable `intent_field_immutable` code on attempt. `slug` is NOT
 *  here — slug isn't a frontmatter field at all (it's the dir name). */
export const INTENT_IMMUTABLE_FIELDS: ReadonlyArray<string> = [
	"studio",
	"plugin_version",
	"follows",
]

// Re-exported approval shape for callers that read intent.approvals.*.
export { INTENT_APPROVALS_SCHEMA }
