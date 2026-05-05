// state/schemas/stage-state.ts — TypeBox-defined schema for
// per-stage state.json shapes. Mirrors plugin/schemas/stage.schema.json.
// Stage state is entirely engine-managed — there are no
// agent-authorable fields. The schema exists so haiku_stage_set can
// reject every call with a clear `stage_field_engine_only` code
// instead of silently accepting writes that bypass workflow lifecycle
// invariants.

import { type Static, Type } from "@sinclair/typebox"

export const STAGE_STATE_SCHEMA = Type.Object(
	{
		stage: Type.Optional(Type.String()),
		status: Type.Optional(
			Type.String({ enum: ["pending", "active", "completed", "blocked"] }),
		),
		phase: Type.Optional(
			Type.String({
				enum: ["", "elaborate", "execute", "review", "gate"],
			}),
		),
		started_at: Type.Optional(Type.Union([Type.String(), Type.Null()])),
		completed_at: Type.Optional(Type.Union([Type.String(), Type.Null()])),
		gate_entered_at: Type.Optional(Type.Union([Type.String(), Type.Null()])),
		gate_outcome: Type.Optional(Type.Union([Type.String(), Type.Null()])),
		visits: Type.Optional(Type.Integer({ minimum: 0 })),
		iterations: Type.Optional(Type.Array(Type.Unknown())),
		elaboration_turns: Type.Optional(Type.Integer({ minimum: 0 })),
		decision_log: Type.Optional(Type.Array(Type.Unknown())),
	},
	{ additionalProperties: true },
)

export type StageState = Static<typeof STAGE_STATE_SCHEMA>

export const STAGE_STATE_FIELDS = Object.keys(
	STAGE_STATE_SCHEMA.properties ?? {},
) as ReadonlyArray<string>
