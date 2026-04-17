---
title: haiku_revisit must fully reset target stage and uncomplete intent
status: addressed
origin: user-chat
author: user
author_type: user
created_at: '2026-04-17T03:15:00Z'
visit: 1
source_ref: haiku_revisit broken during 2026-04-16 design revisit
addressed_by: unit-09-architecture-diagram-updates
---

## Bug observed

Fired `haiku_revisit` from `security` → `design` with 4 reasons (captured as FB-01..FB-04). Expected: intent reactivated, design stage reset to `active/elaborate`, units re-queued to `pending`. Observed:

1. **Feedback files wrote correctly** — FB-01..FB-04 landed in `stages/design/feedback/`.
2. **Intent-level state not uncompleted** — `intent.md` kept `status: completed`, `active_stage: security`, and the old `completed_at`. Running `haiku_run_next` returned `{ action: "complete", message: "already completed" }`.
3. **Stage-level state not reset** — `stages/design/state.json` stayed at `status: completed / phase: gate / gate_outcome: advanced`.
4. **Units not re-queued** — all 3 design units kept `status: completed`.

After manually sed-patching `intent.md` (status→active, active_stage→design, drop completed_at), `haiku_run_next` saw the completed stage state and auto-advanced design → product without doing any work. Had to manually reset `stages/design/state.json` to `active/elaborate` and sed the units back to `pending` to actually pick up.

## Required behavior (spec this in elaborate)

When `haiku_revisit` is called — with or without `reasons`, targeting current or earlier stage — it MUST atomically:

1. **Reactivate the intent if completed** — if `intent.status === "completed"`, flip to `active` and clear `completed_at`.
2. **Reset target stage's state.json** — `status: active`, `phase: elaborate`, `completed_at: null`, `gate_entered_at: null`, `gate_outcome: null`. Preserve `visits` (incremented) and direction-selection fields.
3. **Re-queue target stage's units** — every unit file: `status: pending`, `bolt: 0`, `hat: ''`, `started_at: null`, `completed_at: null`, `hat_started_at: null`.
4. **Update `intent.active_stage`** to the target stage — already works.
5. **Commit the full reset in one `gitCommitState`** so the history shows a single atomic revisit commit, not partial state.

## Tests to add

- `revisitEarlierStage` from a completed intent — assert: intent.status=active, intent.completed_at=null, intent.active_stage=target, target stage.json active/elaborate, all target units pending.
- `revisitCurrentStage` from a completed intent — same assertions for current stage.
- Revisit → run_next should produce `advance_phase elaborate→execute` (or prompt for elaboration). NOT `advance_stage` or `complete`.

## Partial fix already in flight

`packages/haiku/src/orchestrator.ts` has been edited to add an `uncompleteIntent()` helper called from both `revisitEarlierStage` and `revisitCurrentStage`. Still TODO:
- Rebuild `plugin/bin/haiku` so the binary picks up the fix.
- Investigate why the running binary didn't reset stage state or re-queue units even though lines ~2605–2628 of `orchestrator.ts` contain that logic. Either the compiled binary is older than the source, or a separate code path short-circuited. Design elaborate must figure out which.
- Add the tests above.

## Source ref

Git log chain on universal-feedback-model-and-review-recovery branch: `828ae283 → 77d37b24 → 7e3bb94f → 2119e6d6`. These four commits show revisit fired but stage state was not actually reset — `2119e6d6 "haiku: complete stage design"` re-completed design during the subsequent `run_next` rather than picking up on pending work.
