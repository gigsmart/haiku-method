---
title: 'Orchestrator integration — review-UI, subagent prompts, additive elaborate'
type: implementation
depends_on:
  - unit-01-feedback-helpers-and-tool
  - unit-04-gate-feedback-check
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DATA-CONTRACTS.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - features/review-ui-feedback.feature
  - features/additive-elaborate.feature
  - stages/design/DESIGN-BRIEF.md
status: active
bolt: 1
hat: reviewer
started_at: '2026-04-16T15:47:57Z'
hat_started_at: '2026-04-16T16:03:10Z'
outputs:
  - stages/development/artifacts/unit-05-orchestrator-integration.md
---

# Orchestrator Integration

Implement Groups 6+7+8 from IMPLEMENTATION-MAP.md: the review-UI `changes_requested` handler writing feedback files, the review subagent prompt update for direct `haiku_feedback` calls, and the additive elaborate mode when `visits > 0`.

## Completion Criteria

### Group 6: Review-UI changes_requested → feedback writes
- [x] `orchestrator.ts:~3783` changes_requested handler walks `reviewResult.annotations` and `reviewResult.feedback` text
- [x] Each annotation becomes a feedback file via `writeFeedbackFile` (origin: user-visual, author: user)
- [x] Free-text feedback without annotation becomes a separate feedback file
- [x] Phase rolls back to elaborate via the existing changes_requested path
- [x] Tests cover: annotations → individual files, free-text → file, empty submission (approve path unchanged)

### Group 7: Review subagent prompt update
- [x] `orchestrator.ts:~3130` `<subagent>` block template instructs each subagent to call `haiku_feedback({intent, stage, title, body, origin: "adversarial-review", author: agentName})` for each finding
- [x] Subagents return only a count summary, not inline findings
- [x] Parent instructions simplified: "spawn review subagents, wait for completion, call haiku_run_next"
- [x] Drop the "up to 3 cycles" soft-loop instruction — structural gate handles it
- [x] Tests: verify the generated prompt text contains `haiku_feedback` instructions

### Group 8: Additive elaborate mode
- [x] Elaborate phase handler detects `visits > 0` with pre-existing completed units
- [x] Preamble lists completed units (read-only) and pending feedback items with full bodies
- [x] New units MUST declare `closes: [FB-NN]` — validation rejects new units without `closes:` when `visits > 0`
- [x] Validation rejects `closes:` references to non-existent feedback IDs
- [x] When owning unit completes, orchestrator transitions feedback to `addressed` status
- [x] At elaborate exit: if any pending feedback has no owning unit, block the specs gate with error listing orphaned items
- [x] Tests cover: additive-elaborate scenarios (15 tests in orchestrator-integration.test.mjs)
- [x] `npx tsc --noEmit` passes
