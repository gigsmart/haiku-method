---
title: CRUD companion tools
type: implementation
depends_on:
  - unit-01-feedback-helpers-and-tool
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DATA-CONTRACTS.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - features/feedback-crud.feature
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-16T15:22:43Z'
hat_started_at: '2026-04-16T15:28:11Z'
outputs:
  - stages/development/artifacts/unit-02-crud-companion-tools.md
completed_at: '2026-04-16T15:30:09Z'
---

# CRUD Companion Tools

Implement Group 3 from IMPLEMENTATION-MAP.md: `haiku_feedback_update`, `haiku_feedback_delete`, `haiku_feedback_reject`, `haiku_feedback_list` MCP tools in `state-tools.ts`.

## Completion Criteria

- `haiku_feedback_update` registered with input schema per DATA-CONTRACTS.md section 1.2, handler enforces author-type guards (agents can't close human-authored), requires at least one mutable field
- `haiku_feedback_delete` registered per section 1.3, blocks deletion of pending items (409), MCP is agent-only so blocks agent deleting human-authored
- `haiku_feedback_reject` registered per section 1.4, agent-authored only, requires `reason`, appends reason to body, transitions status to `rejected`
- `haiku_feedback_list` registered per section 1.5, supports optional `stage` (cross-stage listing) and optional `status` filter
- All tools return correct JSON response shapes per DATA-CONTRACTS.md
- All tools call `gitCommitState` on mutation
- Tests cover: each tool's happy path, each guard violation, invalid inputs, cross-stage listing
- `npx tsc --noEmit` passes
