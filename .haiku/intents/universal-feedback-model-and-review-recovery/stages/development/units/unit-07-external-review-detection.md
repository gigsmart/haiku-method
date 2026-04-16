---
title: External PR/MR changes-requested detection
type: implementation
depends_on:
  - unit-01-feedback-helpers-and-tool
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DATA-CONTRACTS.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - features/external-review-feedback.feature
status: active
bolt: 1
hat: builder
started_at: '2026-04-16T15:21:59Z'
hat_started_at: '2026-04-16T15:39:27Z'
---

# External PR/MR Changes-Requested Detection

Implement Group 10 from IMPLEMENTATION-MAP.md: extend the external review polling in `orchestrator.ts` to detect `changes_requested` state and route PR/MR comments for agent synthesis via `haiku_feedback`.

## Completion Criteria

- `checkExternalApproval` (or new `checkExternalState`) returns structured `{status, comments?}` instead of boolean
- Status values: `approved`, `changes_requested`, `pending`, `unknown`
- GitHub path: `gh pr view {url} --json reviews,state` parsed for CHANGES_REQUESTED
- GitLab path: `glab mr view {id} --output json` parsed for unresolved discussions
- When `changes_requested` detected: return `action: external_changes_requested` with raw comment payload and synthesis instructions
- When `approved`: existing advance path unchanged
- When `pending`/`unknown`: existing awaiting path unchanged
- Agent synthesis instructions tell the agent to call `haiku_feedback` for each actionable comment (filter noise)
- No automatic background polling — only fires on `haiku_run_next` ticks and `/haiku:pickup`
- gh/glab CLI not available → return `unknown` status gracefully
- All 14 external-review-feedback.feature scenarios pass
- `npx tsc --noEmit` passes
