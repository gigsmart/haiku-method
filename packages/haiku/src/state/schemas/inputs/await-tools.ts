// state/schemas/inputs/await-tools.ts — TypeBox input schemas for the
// blocking await tools that pair with the non-blocking session-prepare
// tools (haiku_run_next, ask_user_visual_question, pick_design_direction).
//
// All three follow the same shape because they answer the same
// question: "given a session_id you minted earlier, block until the
// user submits — and unwind cleanly on MCP cancel." Schema fields:
//
//   - the session identifier (always required for visual / direction;
//     intent slug for gate, since haiku_await_gate reads the
//     session_id from stage state)
//   - auto_open: skip the local browser launch when the user is
//     reviewing on a different device (headless, mobile, remote)
//   - url / review_url: optional convenience for diagnostics + the
//     browser launch; the await never strictly needs it
//
// Pattern matches `units.ts` and `feedback-variants.ts` —
// `additionalProperties: false`, three exports per tool (schema,
// `Static<>` type, compiled validator). Per the schema-definitions
// rule, every MCP tool input crosses a process boundary and gets a
// real runtime-checked schema; this file is what makes that true for
// the await family.

import { type Static, Type } from "@sinclair/typebox"
import { stateAjv } from "../_ajv.js"

// ── haiku_await_gate ──────────────────────────────────────────────
//
// Pairs with haiku_run_next's `gate_review` action. The agent posts
// the action's `review_url` to the user, then calls this tool to
// block on the user's decision. Reads the persisted session_id from
// stage state by default; pass `session_id` explicitly to override
// (rare — useful when the agent wants to re-await a specific session
// after a connection blip).

export const HAIKU_AWAIT_GATE_INPUT_SCHEMA = Type.Object(
	{
		intent: Type.String({
			minLength: 1,
			description: "Intent slug. Required.",
		}),
		session_id: Type.Optional(
			Type.String({
				description:
					"Override the session ID to await. Defaults to the gate_review_session_id persisted on the stage's state.json by haiku_run_next.",
			}),
		),
		auto_open: Type.Optional(
			Type.Boolean({
				description:
					"Try to open the review URL in the default browser when waiting begins. Defaults to true. Set to false when the user will follow the URL themselves (remote control, headless host, mobile).",
			}),
		),
		review_url: Type.Optional(
			Type.String({
				description:
					"Review URL to open if auto_open is true. Optional — primarily logged.",
			}),
		),
		state_file: Type.Optional(
			Type.String({
				description: "Internal — session state file path for telemetry.",
			}),
		),
	},
	{ additionalProperties: false },
)
export type HaikuAwaitGateInput = Static<typeof HAIKU_AWAIT_GATE_INPUT_SCHEMA>
export const validateHaikuAwaitGateInputSchema = stateAjv.compile(
	HAIKU_AWAIT_GATE_INPUT_SCHEMA,
)

// ── haiku_await_visual_answer ─────────────────────────────────────
//
// Pairs with `ask_user_visual_question`. The session was created by
// the question tool with the questions + reference images already
// attached; this tool blocks until the user submits answers.

export const HAIKU_AWAIT_VISUAL_ANSWER_INPUT_SCHEMA = Type.Object(
	{
		session_id: Type.String({
			minLength: 1,
			description: "Session ID returned by ask_user_visual_question.",
		}),
		url: Type.Optional(
			Type.String({
				description:
					"Question URL. Optional — primarily used for the browser-launch step.",
			}),
		),
		auto_open: Type.Optional(
			Type.Boolean({
				description:
					"Try to open the URL in the default browser when waiting begins (default true). Set to false for remote control / headless / mobile-chat scenarios.",
			}),
		),
	},
	{ additionalProperties: false },
)
export type HaikuAwaitVisualAnswerInput = Static<
	typeof HAIKU_AWAIT_VISUAL_ANSWER_INPUT_SCHEMA
>
export const validateHaikuAwaitVisualAnswerInputSchema = stateAjv.compile(
	HAIKU_AWAIT_VISUAL_ANSWER_INPUT_SCHEMA,
)

// ── haiku_await_design_direction ──────────────────────────────────
//
// Pairs with `pick_design_direction`. `intent_slug` is optional in
// the wire schema because the handler also resolves it from the
// session record (created by pick_design_direction with intent_slug
// already attached). The arg form is kept for backward compat with
// agents that echo the slug back from the prepare response.

export const HAIKU_AWAIT_DESIGN_DIRECTION_INPUT_SCHEMA = Type.Object(
	{
		session_id: Type.String({
			minLength: 1,
			description: "Session ID returned by pick_design_direction.",
		}),
		intent_slug: Type.Optional(
			Type.String({
				description:
					"Intent slug — used for stage-branch reconciliation after the user selects an archetype. Optional: handler also resolves it from the session record. Pass it explicitly to override.",
			}),
		),
		url: Type.Optional(
			Type.String({
				description:
					"Direction URL. Optional — primarily used for the browser-launch step.",
			}),
		),
		auto_open: Type.Optional(
			Type.Boolean({
				description:
					"Try to open the URL in the default browser when waiting begins (default true). Set to false for remote control / headless / mobile-chat scenarios.",
			}),
		),
	},
	{ additionalProperties: false },
)
export type HaikuAwaitDesignDirectionInput = Static<
	typeof HAIKU_AWAIT_DESIGN_DIRECTION_INPUT_SCHEMA
>
export const validateHaikuAwaitDesignDirectionInputSchema = stateAjv.compile(
	HAIKU_AWAIT_DESIGN_DIRECTION_INPUT_SCHEMA,
)
