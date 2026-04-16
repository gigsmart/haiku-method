---
title: Orchestrator integration — review-UI, subagent prompts, additive elaborate
type: implementation
depends_on: [unit-01-feedback-helpers-and-tool, unit-04-gate-feedback-check]
quality_gates: [typecheck, test]
inputs:
  - knowledge/DATA-CONTRACTS.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - features/review-ui-feedback.feature
  - features/additive-elaborate.feature
  - stages/design/DESIGN-BRIEF.md
---

# Orchestrator Integration

Implement Groups 6+7+8 from IMPLEMENTATION-MAP.md: the review-UI `changes_requested` handler writing feedback files, the review subagent prompt update for direct `haiku_feedback` calls, and the additive elaborate mode when `visits > 0`.

## Completion Criteria

### Group 6: Review-UI changes_requested → feedback writes
- `orchestrator.ts:~3783` changes_requested handler walks `reviewResult.annotations` and `reviewResult.feedback` text
- Each annotation becomes a feedback file via `writeFeedbackFile` (origin: user-visual, author: user)
- Free-text feedback without annotation becomes a separate feedback file
- Phase rolls back to elaborate via the existing changes_requested path
- Tests cover: annotations → individual files, free-text → file, empty submission (approve path unchanged)

### Group 7: Review subagent prompt update
- `orchestrator.ts:~3130` `<subagent>` block template instructs each subagent to call `haiku_feedback({intent, stage, title, body, origin: "adversarial-review", author: agentName})` for each finding
- Subagents return only a count summary, not inline findings
- Parent instructions simplified: "spawn review subagents, wait for completion, call haiku_run_next"
- Drop the "up to 3 cycles" soft-loop instruction — structural gate handles it
- Tests: verify the generated prompt text contains `haiku_feedback` instructions

### Group 8: Additive elaborate mode
- Elaborate phase handler detects `visits > 0` with pre-existing completed units
- Preamble lists completed units (read-only) and pending feedback items with full bodies
- New units MUST declare `closes: [FB-NN]` — validation rejects new units without `closes:` when `visits > 0`
- Validation rejects `closes:` references to non-existent feedback IDs
- When owning unit completes, orchestrator transitions feedback from `addressed` → `closed`
- At elaborate exit: if any pending feedback has no owning unit, block the specs gate with error listing orphaned items
- Tests cover: all 13 additive-elaborate.feature scenarios
- `npx tsc --noEmit` passes
