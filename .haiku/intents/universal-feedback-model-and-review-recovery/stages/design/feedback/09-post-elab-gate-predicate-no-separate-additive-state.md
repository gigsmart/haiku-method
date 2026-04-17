---
title: >-
  Post-elab gate is just a predicate — no separate additive_elaborate state
  needed
status: addressed
origin: user-chat
author: user
author_type: user
created_at: '2026-04-17T05:56:30Z'
visit: 1
source_ref: Jason — schema simplification after FB-06/FB-07 review
addressed_by: unit-09-architecture-diagram-updates
---

## Insight

We've been designing two things — a normal elaborate phase and a separate `additive_elaborate` action — where one will do. The elaborate phase is always the same phase. What changes is whether it can graduate to execute. That's a **gate predicate**, not a state.

## Rule (supersedes the `additive_elaborate` special-case)

Before advancing from `elaborate` to `execute`, the orchestrator MUST block if:

```
unaddressed_feedback_count > 0  AND  uncompleted_units_count == 0
```

In plain English: "you have open feedback and no new work to address it." The only way forward is to write new units whose `closes:` fields reference the outstanding feedback.

Corollaries:
- **First elaboration** (no revisit yet, no feedback): feedback=0, so predicate never blocks. Works like today.
- **Revisit with new feedback, no new units**: the user's scenario. feedback > 0 and uncompleted_units == 0 → blocked. Agent is told: "write units with `closes: [FB-NN]`."
- **Revisit after new units are written**: feedback > 0 but uncompleted_units > 0 → predicate doesn't block (the other validations — `closes:` presence, orphan check — still apply).
- **No revisit, all units completed** (shouldn't happen in elaborate, but safe): feedback=0, predicate allows.

## What this means for the FSM

Delete the `additive_elaborate` action entirely. Elaborate phase returns only:
- `elaborate` (agent works)
- `elaboration_insufficient` (turns < minimum in collaborative mode)
- `unresolved_dependencies` / `dag_cycle_detected` (DAG validation)
- `design_direction_required`
- `gate_review` / `advance_phase` (gate allowed to open)
- **NEW**: `elaborate_blocked_pending_feedback` — single predicate failure with the list of feedback IDs and the "write units with closes: [FB-NN]" instruction

The last case is what replaces `additive_elaborate`. It's semantically the same signal (you have work to do) but without inventing a new FSM state. Cleaner.

## Why this is better

1. **One predicate, one source of truth.** The gate check is literally `unaddressed_feedback > 0 && uncompleted_units == 0`. No branching state machine.
2. **Infer from existing data.** We don't need a new field on state.json. Feedback status lives in `feedback/*.md`, unit status lives in `units/*.md`. The predicate is composed at read time.
3. **Revisit becomes dumb.** `haiku_revisit` just writes feedback files + resets state to elaborate + re-queues / keeps units (per FB-06 resolution). It doesn't need to know about `additive_elaborate` mode — the next `haiku_run_next` call evaluates the predicate and routes appropriately.
4. **The existing validation on `closes:` still applies.** Once the agent writes new pending units, the closes-presence + orphan-check validations (already in the elaborate code path) enforce correctness. Those aren't removed — they complement this predicate.

## Relationship to FB-06, FB-07

- **FB-06** identified that the revisit flow was broken; keep that as the bug report.
- **FB-07** specified the review-phase feedback-assessor + frontmatter check before the user gate. That's still correct — it's a separate gate (post-review), not the post-elab one.
- **This FB-09** clarifies the post-elab side: it's a predicate, not a new state.

Combined: two gate predicates, both composed from feedback status + unit status, placed at the two transition points.

| Gate                 | Blocks when                                                              |
|----------------------|--------------------------------------------------------------------------|
| post-elab → execute  | `pending_feedback > 0 && uncompleted_units == 0`                         |
| post-review → gate   | `pending_feedback > 0` (after assessor has run — see FB-07)              |

## Tests

1. Fresh stage, no feedback, no units written yet → elaborate action returned (existing behavior).
2. Fresh stage, no feedback, units written, DAG valid → advance to execute.
3. Revisit writes 3 feedback items, no new units written → `elaborate_blocked_pending_feedback` with FB-01, FB-02, FB-03 listed.
4. Revisit writes 3 feedback items, agent writes 1 unit closing FB-01 and FB-02 but not FB-03 → orphan-check fires (FB-03 orphaned).
5. Revisit writes 3 feedback items, agent writes 3 units each closing one → predicate passes + closes-check passes → advance to execute.
6. Stage with zero feedback and no units → elaborate action (not elaborate_blocked).
