---
title: Per-tick breakdown (by_tick)
model: sonnet
depends_on:
  - unit-01-burn-skill-and-spa
status: pending
inputs:
  - intent.md
  - knowledge/API-SURFACE.md
  - knowledge/DISCOVERY.md
---
# Per-tick breakdown — `by_tick`

Adds a fifth top-level breakdown to the `haiku_token_spend` output: per-tick spend, where a "tick" is one `haiku_run_next` MCP call. Per-tick attribution answers "which tick of this intent burned the most tokens" — load-bearing for engine-side optimization decisions like "should this action's prompt be smaller" or "should we batch ticks".

## Definition of a tick

- A **tick** is exactly one invocation of `haiku_run_next` and the parent-session work that follows it until the next tick. Identified by the orchestrator action returned (`elaborate`, `execute`, `review_fix`, `gate`, `complete`, `feedback_dispatch`, `integrate_fix_chains`, `start_stage`, `advance_phase`, etc. — full taxonomy in `packages/haiku/src/orchestrator/workflow/handlers/`).
- Tick numbering is monotonically increasing across the intent's lifetime. Numbering source: the `tick_counter` field already present on every `action-log.jsonl` entry (see `packages/haiku/src/orchestrator/workflow/action-log.ts`). The analyzer reads this directly; no new on-disk state is introduced.
- One tick may map to many parent-session messages (the agent reads the prompt file, spawns subagents, makes follow-up tool calls). All of those messages are attributed to the tick that opened them — bounded on the upper end by the next `haiku_run_next` call.
- Subagent spend spawned within a tick is attributed to that tick (via the existing `by_subagent.dispatch_id` correlation defined in api-surface).

## Output schema addition

```ts
by_tick: [{
  tick_number: integer,        // monotonically increasing per intent
  action: string,              // orchestrator action returned by haiku_run_next, e.g. "elaborate"
  stage: string | null,        // null when the action is intent-scope (e.g. intent_completion_review)
  started_at: string,          // ISO 8601, from action-log.jsonl
  ended_at: string | null,     // ISO 8601 of the next tick's started_at, or null for the most recent tick
  spend: SpendBucket,          // shared with every other breakdown
}]
```

`by_tick` is a required output field at the same level as `by_stage` / `by_hat` / `by_subagent` / `by_model`. The renderer in unit-01's SPA gains a corresponding section (header table; row click expands to show the per-subagent dispatches that happened within that tick).

## Attribution rule

- Each parent-session jsonl message has a `timestamp`. The analyzer assigns it to the most recent tick whose `started_at <= message.timestamp < next_tick.started_at`.
- Each subagent jsonl message is attributed to the same tick as the parent `Task` tool_use that spawned it — derivable from the existing `dispatch_id` (see api-surface §by_subagent), which is `(parent_session_id, tool_use_id)` and the parent_session_id ties back to the tick via the rule above.
- Messages that arrive **before** the first tick (e.g. the user's `/haiku:start` chatter that preceded any orchestrator call) are attributed to a synthetic tick `tick_number: 0, action: "pre-intent"`. This tick is always present even if its spend is zero.

## Stability tier

- `by_tick` as a top-level required field: **Stable** under the same rules as the other `by_*` fields (api-surface §Semver Policy).
- `tick_number`, `action`, `started_at`, `spend` on `by_tick[]`: **Stable** required fields.
- `stage`, `ended_at`: **Stable** but nullable per the schema; null is a valid value, not a missing field.
- Action enumeration is **not** part of the contract — new orchestrator actions can land without bumping major. Consumers must treat unknown action strings as a fall-through, not a hard error.

## Open questions

- Should the analyzer expose a `by_tick_summary` derived field (count of ticks per action type)? **Proposed default:** no — derivable client-side from `by_tick[]`, and adding it now grows the contract for an aggregation a renderer can do in three lines. Veto-able.
- Should ticks that returned an error (`error` action) be excluded from the report's `totals`? **Proposed default:** include them — totals must reflect actual token spend regardless of outcome, and a separate field `error_ticks: integer` surfaces the diagnostic. Veto-able.

## Completion criteria

- §"Definition of a tick" names the `tick_counter` source-of-truth file and the action taxonomy file path; no `TBD` / `etc.` placeholders.
- §"Output schema addition" specifies every field of `by_tick[]` rows with type and nullability.
- §"Attribution rule" defines the message-to-tick assignment for both parent and subagent messages, including the synthetic `tick_number: 0` for pre-intent messages.
- §"Stability tier" classifies every new field as Stable or unstable with rationale.
- §"Open questions" lists every deferred decision with proposed default or `(needs human escalation)`.
