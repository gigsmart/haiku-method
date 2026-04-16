---
title: Rename haiku_feedback Sentry tool to haiku_report
type: implementation
depends_on: []
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DISCOVERY.md
  - knowledge/IMPLEMENTATION-MAP.md
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-16T15:07:31Z'
hat_started_at: '2026-04-16T15:11:52Z'
outputs:
  - stages/development/artifacts/unit-03-rename-notes.md
completed_at: '2026-04-16T15:13:46Z'
---

# Rename Sentry Tool

Implement Group 4 from IMPLEMENTATION-MAP.md: rename the existing `haiku_feedback` Sentry bug-report tool at `server.ts:349` to `haiku_report`. Update the tool name in the routing handler at `server.ts:416` and in the `/haiku:report` skill reference.

## Completion Criteria

- `server.ts:349` tool name changed from `haiku_feedback` to `haiku_report`
- `server.ts:416` routing handler references `haiku_report`
- The `/haiku:report` skill (if it references the tool name) is updated
- `plugin/skills/report/SKILL.md` references `haiku_report` (not `haiku_feedback`)
- No remaining references to the old `haiku_feedback` Sentry tool name (grep confirms)
- Existing Sentry bug-report functionality works via the new name
- `npx tsc --noEmit` passes
- `npm test` passes (no regressions)
