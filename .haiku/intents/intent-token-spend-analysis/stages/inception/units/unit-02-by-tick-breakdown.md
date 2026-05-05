---
title: Per-tick breakdown (by_tick)
model: sonnet
depends_on:
  - unit-01-burn-skill-and-spa
inputs:
  - intent.md
  - knowledge/API-SURFACE.md
  - knowledge/DISCOVERY.md
status: pending
---
# Per-tick breakdown — `by_tick`

Adds a top-level breakdown to the `haiku_token_spend` output: per-tick spend, where a "tick" is one `haiku_run_next` MCP call. Per-tick attribution answers "which tick of this intent burned the most tokens" — load-bearing for engine-side optimization decisions like "should this action's prompt be smaller" or "should we batch ticks".

## Definition of a tick

- A **tick** is exactly one invocation of `haiku_run_next` and the parent-session work that follows it until the next tick. Identified by the orchestrator action returned (`elaborate`, `execute`, `review_fix`, `gate`, `complete`, `feedback_dispatch`, `integrate_fix_chains`, `start_stage`, `advance_phase`, etc. — taxonomy lives in `packages/haiku/src/orchestrator/workflow/handlers/`).
- Tick numbering is monotonically increasing across the intent's lifetime. Numbering source: the sequential ordering of `event: "run_next"` records in `~/.claude/projects/<project-slug>/haiku.jsonl` filtered for entries whose `intent` field equals this intent's slug. The `haiku.jsonl` file is written by `logSessionEvent` in `packages/haiku/src/session-metadata.ts` and is the canonical per-tick anchor — every `haiku_run_next` call writes one entry with `{ event: "run_next", intent, action, stage, unit, hat, wave, timestamp }`.
- This unit does NOT use `action-log.jsonl`'s `tick_counter` field as the source of truth — that field is stage-scoped (it equals `stageState.iteration` and resets at each new stage), not intent-wide. `action-log.jsonl` records file-write events for drift detection, not orchestrator tick boundaries.
- One tick may map to many parent-session messages (the agent reads the prompt file, spawns subagents, makes follow-up tool calls). All of those messages are attributed to the tick that opened them — bounded on the upper end by the next `event: "run_next"` entry's timestamp for the same intent.
- Subagent spend spawned within a tick is attributed to that tick (via the existing `by_subagent.dispatch_id` correlation defined in api-surface).

## Output schema addition

The schema lives in `knowledge/API-SURFACE.md` §`outputSchema.properties.by_tick` and is reproduced here as the unit's authoritative spec. Required fields per row:

```ts
by_tick: [{
  tick_number: integer,        // sequential, 0-based; tick_number=0 is the synthetic "pre-intent" tick
  action: string,              // orchestrator action; see "Known action values" below
  stage: string | null,        // null when the action is intent-scope (e.g. intent_completion_review)
  started_at: string,          // ISO 8601 from the run_next event's stored timestamp
  ended_at: string | null,     // ISO 8601 of the next tick's started_at, or null for the most recent tick
  spend: SpendBucket,          // shared with every other breakdown
}]
```

`by_tick` IS in the `outputSchema.required` array per api-surface (the array was updated to add `by_tick` and `by_origin`). The renderer in unit-01's SPA gains a corresponding section (header table; row click expands to show the per-subagent dispatches that happened within that tick).

## Known action values (Stable display anchors)

The 13 action strings the SPA renders with friendly labels — the same list pinned in api-surface's schema description for `by_tick[].action`:

`elaborate` · `execute` · `review_fix` · `gate` · `integrate_fix_chains` · `intent_completion_review` · `intent_completion_fix` · `feedback_dispatch` · `feedback_triage` · `start_stage` · `advance_phase` · `complete` · `pre-intent` (synthetic; tick_number=0)

Unknown action strings render under an "other" label in the SPA. Per api-surface §"What is not a breaking change", new orchestrator action names can land in the engine without bumping the major version — consumers MUST treat unknown action strings as fall-through, not as a hard error.

## Attribution rule

- Each parent-session jsonl message has a `timestamp`. The analyzer assigns it to the most recent tick whose `started_at <= message.timestamp < next_tick.started_at`.
- Each subagent jsonl message is attributed to the same tick as the parent `Task` tool_use that spawned it — derivable from the existing `dispatch_id` (see api-surface §by_subagent), which is `(parent_session_id, tool_use_id)`. The parent_session_id ties back to the tick via the rule above.
- Messages that arrive **before** the first `run_next` event (e.g. user `/haiku:start` chatter that preceded any orchestrator call) are attributed to a synthetic tick `tick_number: 0, action: "pre-intent"`. This tick is always present even if its spend is zero.

## Stability tier

- `by_tick` as a top-level required field: **Stable** under the same rules as the other `by_*` fields (api-surface §Semver Policy, where it now appears in the required array).
- `tick_number`, `action`, `started_at`, `spend` on `by_tick[]`: **Stable** required fields per the schema.
- `stage`, `ended_at`: **Stable** but nullable per the schema; null is a valid value, not a missing field.
- The 13 known action strings listed above: **Stable display anchors** — removing or renaming one is breaking; the SPA's labels for them are part of the contract. Adding new action strings beyond that set is non-breaking; the SPA renders them as "other".
- The choice of `haiku.jsonl` `event: "run_next"` records as the tick-boundary source: **Internal** — a different anchor source can land in a future minor release provided `tick_number` ordering and `started_at` values stay stable for the same input.

## Open questions

- Should the analyzer expose a `by_tick_summary` derived field (count of ticks per action type)? **Proposed default:** no — derivable client-side from `by_tick[]`, and adding it now grows the contract for an aggregation a renderer can do in three lines. Veto-able.
- Should ticks that returned an `error` action be excluded from the report's `totals`? **Proposed default:** include them — totals must reflect actual token spend regardless of outcome. A dedicated `error_ticks` count field is **deferred to a follow-on intent — out of scope for v1**, so it is NOT introduced into the response schema by this unit. Veto-able.

## Completion criteria

- §"Definition of a tick" names `haiku.jsonl` and `logSessionEvent` (in `packages/haiku/src/session-metadata.ts`) as the source-of-truth, and explicitly disclaims `action-log.jsonl`'s `tick_counter` as wrong-source.
- §"Output schema addition" specifies every field of `by_tick[]` rows with type and nullability, matching the api-surface knowledge artifact.
- §"Known action values" enumerates the 13 Stable display anchor strings and the unknown-string fall-through rule.
- §"Attribution rule" defines the message-to-tick assignment for both parent and subagent messages, including the synthetic `tick_number: 0` for pre-intent messages.
- §"Stability tier" classifies every new field as Stable or Internal with rationale.
- §"Open questions" lists every deferred decision with proposed default or `(needs human escalation)`; the `error_ticks` open question explicitly defers the field rather than introducing it.
