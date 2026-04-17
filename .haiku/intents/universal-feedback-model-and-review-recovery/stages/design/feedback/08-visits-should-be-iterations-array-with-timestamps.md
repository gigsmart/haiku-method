---
title: >-
  Replace stage visits scalar with iterations[] array carrying start/end
  timestamps
status: addressed
origin: user-chat
author: user
author_type: user
created_at: '2026-04-17T05:56:00Z'
visit: 1
source_ref: Jason — dates observation during broken-revisit dogfood session
addressed_by: unit-09-architecture-diagram-updates
---

## Problem

Today's `stage/state.json` tracks revisits with a scalar `visits: N`. That's enough to drive the additive-elaborate branch but loses every piece of useful history — when each revisit started, when it ended, what triggered it, what its outcome was. We already track timestamps for other FSM events (`started_at`, `completed_at`, `gate_entered_at`); stage iteration should be first-class too.

## Proposal

Replace `visits: number` with `iterations: IterationRecord[]` where:

```ts
type IterationRecord = {
  n: number                          // 1-indexed iteration number
  started_at: string                 // ISO-8601 timestamp when this iteration opened
  ended_at: string | null            // ISO-8601 when closed; null while active
  outcome: "advanced" | "revisited" | "abandoned" | null
  triggered_by: "initial" | "revisit" | "feedback_rollback"
  feedback_scope?: string[]          // feedback IDs in play for this iteration (e.g. ["FB-01","FB-03"])
}
```

Invariants:
- `iterations[0]` is always the initial elaboration; `triggered_by: "initial"`.
- `iterations.length - 1` replaces `visits` anywhere it's used (backward-compat helper: derived getter).
- Only one iteration has `ended_at: null` at a time (the active one). New iteration records are pushed when revisit or feedback-rollback fires.
- When the stage closes (user gate approves → advance), the final iteration's `ended_at = timestamp()` and `outcome = "advanced"`.

## Migration (read-side hydration, not hard migration)

When any tool or hook reads a stage's iterations and finds the list is empty or missing, it MUST hydrate from the existing scalar fields rather than error. This is the compatibility guarantee so legacy intents keep working.

**Hydration rule:**

```
if (!stageState.iterations || stageState.iterations.length === 0) {
  const visits = stageState.visits ?? 1
  stageState.iterations = buildFromLegacy({
    visits,
    started_at: stageState.started_at,
    completed_at: stageState.completed_at,
    gate_entered_at: stageState.gate_entered_at,
    gate_outcome: stageState.gate_outcome,
  })
}
```

`buildFromLegacy` synthesizes:
- Record 1: `n:1, started_at: stage.started_at, ended_at: (visits > 1 ? null : stage.completed_at), outcome: (visits > 1 ? "revisited" : stage.gate_outcome ?? null), triggered_by: "initial"`
- Records 2..N (if visits > 1): `started_at: null, ended_at: null, outcome: null, triggered_by: "revisit"` — best-effort placeholders since we don't have per-visit timestamps in legacy state.

**Deprecation path for the scalar fields:**

The stage-level `started_at`, `completed_at`, `gate_entered_at`, `gate_outcome`, and `visits` fields are **deprecated** once `iterations` is live. New writes stop populating them. Readers are directed to the iterations list — `started_at` becomes `iterations[0].started_at`, `completed_at` becomes `iterations.at(-1).ended_at`, etc.

**Do NOT hard-migrate on read.** Hydrating in memory for the current call is sufficient. Don't rewrite state.json back to disk just to upgrade the schema — that churns git history and races with concurrent writers. The next legitimate write (orchestrator transition, revisit, etc.) will persist the iterations list naturally and can drop the legacy fields at that point.

Once every call site reads `iterations` (no remaining access of the scalars), a follow-up intent can do a one-shot sweep to delete the deprecated fields from all state.json files across all intents.

## Rename "visits" → "iterations" (terminology)

Current plugin uses `visits`; the paper and CLAUDE.md terminology map doesn't define either term formally at the stage level. Since we already have `bolt = iteration cycle within a unit`, we should rename the stage-level concept to `iteration` for symmetry:

- Studio > Stage > Unit > Bolt (unit-level iteration)
- Stage also has **Iterations** (stage-level revisit cycles)

Update:
- `stage/state.json` field: `iterations: []`
- `packages/haiku/src/orchestrator.ts`: all reads of `stageState.visits` → `stageState.iterations[last].n` (or helper)
- `website/content/papers/haiku-method.md`: add "stage iteration" to terminology glossary
- `CLAUDE.md`: terminology table — new row for stage iterations

## Impact on tools

- `haiku_revisit` — pushes a new iteration record, sets `triggered_by: "revisit"`, populates `feedback_scope` with the reason IDs it just wrote.
- `haiku_stage_get` — returns `iterations` verbatim so UI can render timeline.
- `haiku_run_next` additive-elaborate check — read `iterations.length > 1` instead of `visits > 0`.
- Review UI — render the iteration timeline on the stage banner (first class: "Iteration 2 of 2 · started 2026-04-16 21:04").

## Tests required

1. Fresh stage completes without revisit: `iterations = [{ n:1, started_at, ended_at, outcome: "advanced", triggered_by: "initial" }]`.
2. Revisit fires: iteration[0] closes with `outcome: "revisited"`, `ended_at: timestamp`; iteration[1] opens with `triggered_by: "revisit"` and `feedback_scope: [...new feedback IDs]`.
3. Feedback-rollback fires (review → elaborate): iteration closes with `outcome: "revisited"`, new iteration opens with `triggered_by: "feedback_rollback"`.
4. Legacy state.json with only `visits: 2` opens: shim synthesizes 2 iteration records with best-effort timestamps; no crash.
5. Stage close with multiple iterations: final `outcome: "advanced"` only set on last record; earlier records keep their `revisited` outcomes.
