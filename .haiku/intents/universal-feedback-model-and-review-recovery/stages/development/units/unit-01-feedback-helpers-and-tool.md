---
title: Feedback file helpers and haiku_feedback tool
type: implementation
depends_on: []
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DISCOVERY.md
  - knowledge/DATA-CONTRACTS.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - features/feedback-crud.feature
status: active
bolt: 1
hat: reviewer
started_at: '2026-04-16T15:08:25Z'
hat_started_at: '2026-04-16T15:14:12Z'
outputs:
  - stages/development/artifacts/unit-03-rename-notes.md
---

# Feedback File Helpers and haiku_feedback Tool

Implement the feedback file foundation (Groups 1+2 from IMPLEMENTATION-MAP.md): the `writeFeedbackFile`, `readFeedbackFiles`, `countPendingFeedback`, `updateFeedbackFile`, `deleteFeedbackFile` helpers in `state-tools.ts`, plus the `haiku_feedback` MCP tool registration and handler.

## Completion Criteria

- `writeFeedbackFile(slug, stage, {title, body, origin, author, source_ref})` creates `.haiku/intents/{slug}/stages/{stage}/feedback/NN-{slug}.md` with correct frontmatter and auto-incrementing NN
- `readFeedbackFiles(slug, stage)` returns parsed feedback items with frontmatter + body + id
- `countPendingFeedback(slug, stage)` returns count of `status: pending` items
- `updateFeedbackFile(slug, stage, id, fields)` patches frontmatter with author-type guards
- `deleteFeedbackFile(slug, stage, id)` deletes with guards: no delete on pending, agent can't delete human-authored
- `haiku_feedback` MCP tool registered in `stateToolDefs` with full input schema per DATA-CONTRACTS.md section 1.1
- Tool handler validates inputs, calls `writeFeedbackFile`, returns JSON response with `feedback_id`, `file`, `status`
- All file writes call `gitCommitState`
- Feedback directory auto-created when absent
- `npm test` passes with new tests covering: create, read, list, update, delete, sequential numbering, auto-mkdir, guards, default values
- `npx tsc --noEmit` passes
