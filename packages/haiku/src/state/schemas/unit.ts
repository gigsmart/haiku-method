// state/schemas/unit.ts — v4 unit frontmatter schema.
//
// In v4 a unit's lifecycle position is fully derived from its
// `iterations[]`, `reviews{}`, `approvals{}`, and `discovery{}` records,
// plus whether its branch has merged into the stage branch. There is
// no `status` field. There is no `hat` field. There is no `bolt`
// field. Each was a duplicate-source-of-truth fiction; the cursor
// reads the records directly.
//
// Engine-driven fields the agent must NEVER write:
//   - started_at  : stamped when the first hat is dispatched
//   - discovery   : per-studio-agent record of when discovery ran
//   - iterations  : append-only log of hat dispatches
//   - reviews     : per-reviewer-role record of spec review
//   - approvals   : per-reviewer-role record of output approval
//
// Agent-authorable fields:
//   - title, description
//   - inputs[]   : cross-stage upstream artifact paths this unit reads
//   - outputs[]  : artifact paths this unit produces
//   - depends_on[]: sibling unit names that must complete first (DAG)
//   - quality_gates[]: build-class executable checks at advance time
//   - model      : subagent tier override (haiku|sonnet|opus)
//   - closes[]   : FB IDs this unit addresses on revisit iterations
//   - applicable_skills[]: slash-command slugs surfaced to hat subagents
//
// Tool-level invalidation contract (enforced in haiku_unit_write and
// haiku_unit_set, not in this schema): any write that mutates a unit's
// spec body or any agent-authorable FM field MUST clear `reviews.*`
// and `approvals.*` on the same unit. Spec change → all sigs reset →
// cursor reroutes through reviews and approvals on the next tick.
// This is the primary protection; the drift sweep is the secondary
// catch for direct-edit bypasses.
//
// What JSONSchema covers (enforced by AJV):
//   - allow-list of properties + per-field types
//   - `model` enum
//   - `quality_gates` inner shape (`{name, command, dir?}`)
//   - `title` minLength
//   - `propertyNames.not.enum` forbids workflow-driven fields
//
// What lives in validateUnitFrontmatter (runtime context):
//   - depends_on self-reference, sibling resolution, cycle detection
//   - body placeholder strings
//   - ghost-FB closes references

import { type Static, Type } from "@sinclair/typebox"
import { stateAjv } from "./_ajv.js"

const FSM_DRIVEN_UNIT_FIELDS_LIST = [
	"started_at",
	"discovery",
	"iterations",
	"reviews",
	"approvals",
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
		description: Type.Optional(
			Type.String({
				description: "Optional unit description.",
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
						"Build-class only: list of `{name, command, dir?}` executable gate objects. Run at terminal advance_hat time; non-zero exit blocks. Prose strings are silently skipped — they give no enforcement.",
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
					"On revisit iterations, list of FB IDs this unit addresses (e.g. `[FB-01, FB-03]`). Informational — feedback closure happens via the FB's own iterations + targets.invalidates, not via this field.",
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
		// FSM-driven fields. Agents MUST NOT set these — the workflow
		// engine owns transitions via haiku_unit_advance_hat /
		// haiku_unit_reject_hat / haiku_unit_start (terminal advance does
		// the merge into stage branch, which is the un-fakable completion
		// witness). AJV's propertyNames check rejects any of these at
		// validate time; strict MCP clients reject at parse time.
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

export const validateUnitFrontmatterSchema = stateAjv.compile(
	UNIT_FRONTMATTER_SCHEMA,
)

export const AGENT_AUTHORABLE_UNIT_FIELDS = Object.keys(
	UNIT_FRONTMATTER_SCHEMA.properties ?? {},
) as ReadonlyArray<string>

export const FSM_DRIVEN_UNIT_FIELDS = FSM_DRIVEN_UNIT_FIELDS_LIST
