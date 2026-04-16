---
title: Migration and backward compatibility
type: operations
depends_on:
  - unit-01-ci-validation
quality_gates:
  - test
inputs:
  - knowledge/DISCOVERY.md
  - knowledge/DATA-CONTRACTS.md
status: active
bolt: 1
hat: ops-engineer
started_at: '2026-04-16T16:43:18Z'
hat_started_at: '2026-04-16T16:43:18Z'
---

# Migration and Backward Compatibility

Verify that existing intents, state files, and workflows continue to function after the feedback model changes. No migration scripts needed — the design uses defaults and absent-field handling — but verify those defaults work in practice.

## Completion Criteria

- Existing intents without `feedback/` directories: `haiku_run_next` processes them without errors (countPendingFeedback returns 0)
- Existing `state.json` without `visits` field: treated as `visits: 0` (no additive elaborate mode triggered)
- Existing units without `closes:` field: processed normally when `visits === 0`
- `enforce-iteration` hook with legacy intents (no `stages:` in frontmatter): falls back to studio resolution, does not crash
- `haiku_feedback_list` on stages with no feedback directory: returns empty array, not error
- `haiku_report` (renamed from `haiku_feedback`): existing `/haiku:report` skill works correctly
- Review UI with no feedback: renders normally without feedback panel errors
- The `checkExternalState` return shape change doesn't break existing external gate flows
