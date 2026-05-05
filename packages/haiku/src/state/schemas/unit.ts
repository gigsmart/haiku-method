// state/schemas/unit.ts — TypeBox-defined schema for unit
// frontmatter shapes. AJV-validated when an agent calls
// haiku_unit_write.
//
// What JSONSchema covers (enforced by AJV):
//   - allow-list of properties + per-field types
//   - `model` enum
//   - `quality_gates` inner shape (`{name, command, dir?}` with required keys)
//   - `title` minLength
//   - `propertyNames.not.enum` forbids workflow-driven fields
//
// What JSONSchema can NOT cover (runtime context required, lives in
// validateUnitFrontmatter as additional steps):
//   - depends_on self-reference (needs the unit's own name)
//   - depends_on resolves to actual siblings (needs sibling list)
//   - depends_on doesn't form a cycle (needs full stage DAG)
//   - body placeholder strings (needs body inspection)
//   - ghost-FB closes references (needs FB list)
//
// SSOT: TypeBox builder → JSONSchema (consumed by AJV at compile,
// referenced from the agent-facing tool defs) AND TypeScript type
// (`Static<typeof UNIT_FRONTMATTER_SCHEMA>`). Same expression, no
// drift between the runtime check and the type the handler reads.

import { type Static, Type } from "@sinclair/typebox"
import { stateAjv } from "./_ajv.js"

// Engine-driven fields the agent must never write directly. Listed as
// a const tuple so it appears in the schema's `propertyNames.not.enum`
// AND is exported as the canonical FSM-DRIVEN list. Any new
// engine-only field is added here in one place.
const FSM_DRIVEN_UNIT_FIELDS_LIST = [
	"status",
	"hat",
	"bolt",
	"iterations",
	"started_at",
	"completed_at",
	"hat_started_at",
	"scope_reject_attempts",
] as const

// Path-shape check: must be a non-empty string with no embedded
// whitespace, must contain a `/` (any path) or `.` (file extension),
// and must NOT contain `:` or `,` or sentence-style punctuation.
// Catches freeform-text entries like "ACCEPTANCE-CRITERIA: must
// define edge cases" that aren't really paths.
const PATH_PATTERN = "^[^\\s:,]+(?:/[^\\s:,]+)*$"

export const UNIT_FRONTMATTER_SCHEMA = Type.Object(
	{
		title: Type.Optional(
			Type.String({
				minLength: 1,
				description:
					"Unit title — non-empty string. Defaults to first H1 in the body, or to the unit name.",
			}),
		),
		depends_on: Type.Optional(
			Type.Array(Type.String(), {
				description:
					"Names of sibling units in the SAME stage that must complete before this one. Each entry must resolve to an actual sibling. No self-reference. No cycles. (Cross-sibling and cycle checks are runtime — they need the full stage DAG, not expressible in this schema.)",
			}),
		),
		inputs: Type.Optional(
			Type.Array(Type.String({ pattern: PATH_PATTERN }), {
				description:
					"Cross-stage inputs this unit reads — paths to artifacts produced by prior stages. Each entry MUST be a file/dir path (no whitespace, no colons or commas, no prose).",
			}),
		),
		outputs: Type.Optional(
			Type.Array(Type.String({ pattern: PATH_PATTERN }), {
				description:
					"Artifacts this unit produces. Each entry MUST be a real file path (no whitespace, no colons or commas, no prose) — the gate verifies the path exists on disk at unit completion. Use `inputs:` if you mean to declare what the unit READS; use the body's `## Completion Criteria` section if you mean to declare prose-style success conditions.",
			}),
		),
		quality_gates: Type.Optional(
			Type.Array(
				Type.Object({
					name: Type.String(),
					command: Type.String(),
					dir: Type.Optional(Type.String()),
				}),
				{
					description:
						"Build-class only: list of `{name, command, dir?}` executable gate objects. Run at advance_hat time; non-zero exit blocks. Prose strings are silently skipped — they give no enforcement.",
				},
			),
		),
		model: Type.Optional(
			Type.String({
				enum: ["haiku", "sonnet", "opus"],
				description:
					"Subagent tier for this unit's hats. `haiku` = mechanical, `sonnet` = standard (default), `opus` = deep reasoning. Cascade: unit > hat > stage > studio.",
			}),
		),
		closes: Type.Optional(
			Type.Array(Type.String(), {
				description:
					"On revisit iterations, list of FB IDs this unit addresses (e.g. `[FB-01, FB-03]`). Every pending FB must be claimed by some unit's `closes:` to allow advancement.",
			}),
		),
		applicable_skills: Type.Optional(
			Type.Array(Type.String(), {
				description:
					"Skill slugs (slash-command names without the leading `/`) identified as relevant for this unit during elaboration. The elaborator populates this from the installed skill registry. Hat subagent prompts surface these automatically so subagents know which skills to reach for.",
			}),
		),
	},
	{
		// workflow-driven fields. Agents MUST NOT set these — the workflow
		// engine owns transitions via haiku_unit_advance_hat /
		// haiku_unit_reject_hat / haiku_unit_increment_bolt (which call
		// setFrontmatterField directly, bypassing the agent-facing tools).
		// AJV's propertyNames check rejects any of these at validate time;
		// strict MCP clients reject at parse time before the call goes
		// out. `hat_started_at` and `scope_reject_attempts` are workflow-
		// internal counters touched only by advance_hat / reject_hat —
		// listed here so haiku_unit_write and haiku_unit_set both refuse
		// to set them.
		propertyNames: { not: { enum: [...FSM_DRIVEN_UNIT_FIELDS_LIST] } },
		// Stage-specific fields are allowed (per-stage
		// `phases/ELABORATION.md` documents them). Schema can't enumerate
		// stage-specific fields without reading every stage def, so we
		// keep additionalProperties: true and rely on propertyNames.not
		// for the deny-list of FSM-driven fields.
		additionalProperties: true,
	},
)

export type UnitFrontmatter = Static<typeof UNIT_FRONTMATTER_SCHEMA>

/** Compiled validator — instantiated once at module load, runs on
 *  every haiku_unit_write call. Returns boolean and populates
 *  `validateUnitFrontmatterSchema.errors` on failure. */
export const validateUnitFrontmatterSchema = stateAjv.compile(
	UNIT_FRONTMATTER_SCHEMA,
)

/** Field names a haiku_unit_write / _set call may legally touch.
 *  Reads directly from the schema — JSONSchema is the SSOT. */
export const AGENT_AUTHORABLE_UNIT_FIELDS = Object.keys(
	UNIT_FRONTMATTER_SCHEMA.properties ?? {},
) as ReadonlyArray<string>

/** Field names the workflow engine owns. Agent-facing tools refuse
 *  to set these. Reads directly from the schema. */
export const FSM_DRIVEN_UNIT_FIELDS = FSM_DRIVEN_UNIT_FIELDS_LIST
