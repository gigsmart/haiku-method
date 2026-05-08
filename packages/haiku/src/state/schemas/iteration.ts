// state/schemas/iteration.ts — TypeBox shape for an entry in
// `unit.iterations[]` or `feedback.iterations[]`.
//
// One entry per hat invocation. The array is the source of truth
// for "what hat are we on" and "how many bolts have we run" —
// both are derived from `iterations.length` + `iterations[-1]`.
// There is no separate `hat`, `bolt`, `hat_started_at` field.
//
// Lifecycle of an entry:
//   - appended with `started_at` set, `completed_at: null`, `result: null`
//   - terminal advance/reject of the hat stamps `completed_at` and `result`
//   - never mutated once `result` is set; the next iteration is a new
//     append (next hat for advance, prior hat for reject).
//
// Result semantics:
//   - "advance" → next hat in the configured sequence; on the terminal
//     hat (last in the sequence) advance closes the unit (merge into
//     stage branch) or closes the feedback (stamp closed_at +
//     invalidate targets).
//   - "reject" → previous hat is re-appended as a new iteration. Loops
//     until advance lands on the terminal hat.
//   - null → in flight.
//
// Reason is optional but conventionally required on reject.
//
// Field name `result` (not `decision`) is preserved from the v3 shape
// so the v0→v4 migrator can carry forward existing iterations[] arrays
// without rewriting every entry.

import { type Static, Type } from "@sinclair/typebox"

export const ITERATION_SCHEMA = Type.Object(
	{
		hat: Type.String({
			minLength: 1,
			description:
				"Hat name (e.g. `researcher`, `distiller`, `verifier`, `feedback-assessor`). Must match a hat declared in the studio's stage hat sequence (or `fix_hats:` for feedback iterations).",
		}),
		started_at: Type.String({
			description:
				"ISO 8601 timestamp when this hat dispatch began. Set when the iteration is appended.",
		}),
		completed_at: Type.Union([Type.String(), Type.Null()], {
			description:
				"ISO 8601 timestamp when this hat's terminal advance/reject landed. Null while the hat is in flight.",
		}),
		result: Type.Union(
			[Type.Literal("advance"), Type.Literal("reject"), Type.Null()],
			{
				description:
					"Outcome of this hat. `advance` = move to next hat (or close on terminal hat). `reject` = loop back to previous hat. Null while in flight.",
			},
		),
		reason: Type.Optional(
			Type.Union([Type.String(), Type.Null()], {
				description:
					"Optional reason for the result. Required on `reject` (caller must explain what went wrong) and optional on `advance`.",
			}),
		),
	},
	{ additionalProperties: false },
)

export type Iteration = Static<typeof ITERATION_SCHEMA>
