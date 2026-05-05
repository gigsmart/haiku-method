// state/schemas/feedback.ts — TypeBox-defined schemas for the
// feedback MCP tool surface.
//
// TypeBox is the SSOT: each schema below is a TypeBox builder
// expression. The builder produces:
//
//   1. A JSONSchema-compatible object the MCP runtime + AJV both
//      consume (via the schema constant itself).
//   2. A TypeScript type via `Static<typeof Schema>` — derived from
//      the same expression, so the type and the runtime check can
//      never drift.
//
// Pattern every state-tool follows:
//
//   import { Type, type Static } from "@sinclair/typebox"
//   export const HAIKU_<TOOL>_INPUT_SCHEMA = Type.Object({...},
//     { additionalProperties: false })
//   export type Haiku<Tool>Input = Static<typeof HAIKU_<TOOL>_INPUT_SCHEMA>
//   export const validateHaiku<Tool>InputSchema = stateAjv.compile(
//     HAIKU_<TOOL>_INPUT_SCHEMA,
//   )
//
// The handler then does:
//
//   const validation = validateToolInput(args, validateHaiku<Tool>InputSchema, "haiku_<tool>")
//   if (validation) return validation
//   const typed = args as Haiku<Tool>Input
//
// `additionalProperties: false` is the strict-typespec contract: any
// field the agent sends that the schema didn't declare is rejected
// by AJV with a stable named code.

import { type Static, Type } from "@sinclair/typebox"
import { stateAjv } from "./_ajv.js"

// ── Source-of-truth enum constants ───────────────────────────────────
//
// Duplicated from state-tools.ts to avoid an import cycle. Both
// lists are short and tightly versioned; the test suite asserts
// they match the state-tools.ts exports so drift gets caught at
// build time.

const FEEDBACK_ORIGINS = [
	"adversarial-review",
	"studio-review",
	"external-pr",
	"external-mr",
	"user-visual",
	"user-chat",
	"user-question",
	"user-revisit",
	"agent",
] as const

export const FEEDBACK_STATUSES = [
	"pending",
	"fixing",
	"addressed",
	"answered",
	"closed",
	"rejected",
] as const

const FEEDBACK_RESOLUTIONS = [
	"question",
	"inline_fix",
	"stage_revisit",
] as const

// FB-NN identifier shape — `FB-` followed by one or more digits, OR
// just digits (the handler accepts either).
export const FB_ID_PATTERN = "^(?:FB-)?\\d+$"

// ── HAIKU_FEEDBACK_INPUT_SCHEMA ──────────────────────────────────────
//
// Args shape for `haiku_feedback` (create).

export const HAIKU_FEEDBACK_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({
			minLength: 1,
			description: "Intent slug",
		}),
		stage: Type.Optional(
			Type.String({
				description:
					"Stage name. Omit (or pass empty) to log an intent-scope finding from the studio-level review layer.",
			}),
		),
		title: Type.String({
			minLength: 1,
			maxLength: 120,
			description: "Short title for the feedback item (max 120 chars)",
		}),
		body: Type.String({
			minLength: 1,
			description: "Markdown body describing the finding",
		}),
		// `origin` is a string with an explicit enum constraint —
		// produces a JSONSchema `enum` keyword AJV reports cleanly
		// (single error, keyword: "enum"). `Type.Union(Literals)`
		// would compile to an anyOf-of-consts which AJV reports as
		// N+1 errors per failure, so we keep these as plain string
		// + enum. Type-side, use `as const` on the enum array so
		// `Static<>` still infers the literal-union type.
		origin: Type.Optional(
			Type.String({
				enum: [...FEEDBACK_ORIGINS],
				description: `Source of the feedback. One of: ${FEEDBACK_ORIGINS.join(" | ")} (default: agent).`,
			}),
		),
		source_ref: Type.Optional(
			Type.String({
				description:
					"Optional reference — PR URL, review agent name, annotation ID",
			}),
		),
		author: Type.Optional(
			Type.String({
				description: "Who created it (default: agent)",
			}),
		),
		resolution: Type.Optional(
			Type.String({
				enum: [...FEEDBACK_RESOLUTIONS],
				description: `Optional routing hint set at creation time. One of: ${FEEDBACK_RESOLUTIONS.join(" | ")}. Agent-authored stage_revisit FBs are how the agent expresses 'I need to go back' — write the FB at the target stage, set resolution=stage_revisit, call haiku_run_next.`,
			}),
		),
		state_file: Type.Optional(
			Type.String({
				description:
					"Internal: session-state file path injected by the inject-state-file hook. Optional, ignored if absent.",
			}),
		),
	},
	{ additionalProperties: false },
)

export type HaikuFeedbackInput = Static<typeof HAIKU_FEEDBACK_INPUT_SCHEMA>

export const validateHaikuFeedbackInputSchema = stateAjv.compile(
	HAIKU_FEEDBACK_INPUT_SCHEMA,
)

// ── HAIKU_FEEDBACK_UPDATE_INPUT_SCHEMA ───────────────────────────────
//
// Args shape for `haiku_feedback_update`. Mutable fields only.
// FSM-driven fields (hat, bolt, iterations, integrator_attempts,
// replies, triaged_at) are NEVER agent-mutable and are not in the
// properties list, so `additionalProperties: false` rejects them at
// the gate.

export const HAIKU_FEEDBACK_UPDATE_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({ minLength: 1 }),
		stage: Type.Optional(
			Type.String({
				description: "Stage name. Omit for intent-scope feedback.",
			}),
		),
		feedback_id: Type.String({
			pattern: FB_ID_PATTERN,
			description: "FB-NN identifier (with or without the FB- prefix).",
		}),
		status: Type.Optional(
			Type.String({
				enum: [...FEEDBACK_STATUSES],
				description: `New status. One of: ${FEEDBACK_STATUSES.join(" | ")}.`,
			}),
		),
		resolution: Type.Optional(Type.String({ enum: [...FEEDBACK_RESOLUTIONS] })),
		closed_by: Type.Optional(
			Type.String({
				description:
					"Slug of the unit / hat / agent that closed the finding. Set by the engine on assessor pass; agents may set it manually only on rare manual-close paths.",
			}),
		),
		// `source_ref` and `author` were previously declared here but the
		// handler never read them — only `status`, `closed_by`, and
		// `resolution` flow into updateFeedbackFile. Listing them in the
		// schema let agents pass values that got silently dropped.
		// Removed: schema must match the handler's actual mutation surface.
		state_file: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
)

export type HaikuFeedbackUpdateInput = Static<
	typeof HAIKU_FEEDBACK_UPDATE_INPUT_SCHEMA
>

export const validateHaikuFeedbackUpdateInputSchema = stateAjv.compile(
	HAIKU_FEEDBACK_UPDATE_INPUT_SCHEMA,
)

// ── Field-name reference constants ────────────────────────────────────
//
// haiku_feedback_write is body-only — there is no AJV input schema
// for FB frontmatter writes (it accepts only `body`). These constants
// are pure documentation, consumed by the fix-loop dispatch contract
// so fix-mode hats know what FM fields they'll see when reading FB
// context.

export const FSM_DRIVEN_FB_FIELDS = [
	"status",
	"hat",
	"bolt",
	"iterations",
	"closed_by",
	"integrator_attempts",
	"replies",
	"triaged_at",
] as const

export const CREATE_TIME_FB_FIELDS = [
	"title",
	"origin",
	"author",
	"author_type",
	"created_at",
	"iteration",
	"visit",
	"source_ref",
	"resolution",
	"attachment",
	"inline_anchor",
] as const
