# Development Stage Conventions

Decisions locked in with the user during development elaboration on 2026-04-14.

## Test coverage

**Unit tests only.** Each new function, tool handler, and filter predicate gets isolated unit tests. No end-to-end integration test is required for this intent. The existing `orchestrator.test.mjs` and `state-tools-handlers.test.mjs` patterns are the reference — add new tests adjacent to the ones the inception specs already name as guardrails.

Rationale: this is a small additive soft-hide flag. Unit tests cover the real risk (filter predicate, FSM ordering, idempotency, tool registration). An e2e smoke would be nice but is overhead for a reversible view-layer feature.

## Commit granularity

**One commit per unit.** Each dev unit produces exactly one commit in its worktree. The builder squashes intermediate steps — type definitions, helper, wiring, tests — into a single commit before calling `haiku_unit_advance_hat`. Matches the inception merge pattern and keeps the history reviewable per-unit.

Rationale: review cost dominates. One commit per unit means reviewers scan one diff per logical slice, not five.

## Applies to

All five development units:
- `unit-01-implement-archived-flag-and-filter`
- `unit-02-implement-archive-tools-and-fsm-refusal`
- `unit-03-implement-archive-skills`
- `unit-04-implement-prototype-runtime-map-sync`
- `unit-05-implement-docs-sync`

Unit specs should reference this file under their `inputs:` so the builder hat picks up the conventions automatically.
