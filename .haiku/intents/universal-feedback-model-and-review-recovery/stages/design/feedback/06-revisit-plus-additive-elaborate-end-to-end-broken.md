---
title: End-to-end revisit → additive-elaborate flow is broken
status: addressed
origin: user-chat
author: user
author_type: user
created_at: '2026-04-17T03:18:00Z'
visit: 1
source_ref: Attempted live pickup of this intent after revisit — multiple failures
addressed_by: unit-09-architecture-diagram-updates
---

## Problem

This intent is supposed to deliver the universal feedback model + review recovery. While **dogfooding it** on this very intent (revisit security→design, add 4 feedback items from the review mockup, pick up again), the flow fell apart in multiple places. We can't ship this feature if its own end-to-end story doesn't hold up.

## Symptoms observed (in order)

1. **`haiku_revisit` leaves intent status=completed** — covered in FB-05, but reiterating because it's the first domino. `haiku_run_next` then returns `{ action: "complete" }` and there's no way forward without manual file editing.
2. **`haiku_revisit` did not reset the target stage's `state.json`** — commit `2119e6d6` shows design's `state.json` going straight from the old `completed_at` to a new `completed_at` during the next `run_next`, with no intermediate `active/elaborate` state. Either the source logic never ran, or a subsequent code path clobbered it. Current `orchestrator.ts` DOES contain that logic (lines ~2605–2628) but the compiled binary didn't execute it. Build drift or code-path short-circuit — design elaborate must diagnose.
3. **`haiku_revisit` did not re-queue target stage's units** — their `status` stayed `completed`. Combined with symptom #2, `run_next` immediately advanced design → product as if no revisit had happened.
4. **`haiku_revisit` re-queuing semantics are also wrong** — even if it HAD re-queued, the additive-elaborate path (lines 1443+) expects **old units to remain `completed` and new units to be added with `closes: [FB-NN]`**. Re-queuing completed units to pending produces the validation error "New units missing `closes:` field" on units that existed *before* the feedback did. So the current design of revisit and the current design of additive-elaborate are out of sync.
5. **`haiku_feedback` MCP tool returns `{ error: "message is required" }`** for valid calls that include `intent`, `stage`, `title`, `body`. Neither the documented schema nor the `state-tools.ts` validator mentions a `message` field — the error is coming from somewhere else in the stack. Had to write the feedback file by hand instead. Blocks the entire `haiku_feedback` surface.
6. **Binary drift** — `plugin/bin/haiku` is out of sync with `packages/haiku/src/*`. Uncertain whether the build pipeline is broken or just wasn't re-run. Need a deterministic, enforced rebuild step so fixes in source actually ship.

## Root invariants to preserve in the new design

- Revisit is atomic: one commit, all side effects applied or none. No half-done states.
- Additive elaborate and revisit share a single model of "what happens to old units" — either always-kept-completed or always-re-queued. Pick one and enforce it in both places.
- Any MCP tool that validates required fields MUST return an error message that names the actual missing field, sourced from the same schema MCP publishes.
- Binary build is part of CI/pre-commit; source changes cannot land without the binary being rebuilt.

## Test harness this intent must add

A single end-to-end test case:

```
seed: completed intent, 6 stages
action: haiku_revisit(stage='stage-N', reasons=[...N items])
asserts:
  - intent.md: status=active, completed_at=null, active_stage=stage-N
  - stages/stage-N/state.json: status=active, phase=elaborate, visits++
  - stages/stage-N/units/*.md: status=completed (kept, per chosen model)
  - stages/stage-N/feedback/NN-*.md: one per reason, status=pending
  - haiku_run_next: returns 'additive_elaborate' with pending_feedback list, NOT 'complete' or 'advance_stage'
  - After elaborating closes:[...] units for every feedback: advance to execute
```

If that test doesn't exist and pass, this intent isn't done.

## Reference — actual commit sequence from today's broken run

```
828ae283  haiku: revisit feedback in design (4 items)     # wrote FB-01..FB-04 + mockup
77d37b24  haiku: revisit from security                    # empty? no state reset visible
7e3bb94f  haiku: increment visits to 1                    # only touched visits field
2119e6d6  haiku: complete stage design                    # run_next re-completed design
```

No commit between these resets design's `state.json` to `active/elaborate` or flips intent `status` to `active`.
