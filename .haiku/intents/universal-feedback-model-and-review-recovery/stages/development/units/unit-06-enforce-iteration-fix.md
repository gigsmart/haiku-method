---
title: Enforce-iteration auto-completion fix
type: implementation
depends_on: []
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DISCOVERY.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - features/enforce-iteration-fix.feature
status: active
bolt: 1
hat: reviewer
started_at: '2026-04-16T15:08:41Z'
hat_started_at: '2026-04-16T15:17:51Z'
---

# Enforce-Iteration Auto-Completion Fix

Implement Group 9 from IMPLEMENTATION-MAP.md: rewrite the completion check in `hooks/enforce-iteration.ts` to key off per-stage `state.json` status instead of globbing unit files.

## Completion Criteria

- `enforce-iteration.ts:119-131` replaced: reads `intent.md` frontmatter `stages:` array, iterates each stage's `state.json`, checks `status === "completed"` for all
- Intent flips to `completed` ONLY when every declared stage has `state.json.status === "completed"`
- Missing `state.json` for a declared stage → treated as not-completed (not an error)
- Missing `stages:` frontmatter → falls back to resolving from studio (existing `readFrontmatterField` pattern)
- Regression test: intent with stages [inception, design, development, security] where only inception units are complete → intent does NOT flip to completed
- Existing behavior preserved: session-exhausted message still fires when work remains
- `findUnitFiles` usage in enforce-iteration.ts for the completion check is removed (the function may still be used elsewhere for active-unit lookup)
- All 13 enforce-iteration-fix.feature scenarios pass
- `npm test` passes with no regressions
- `npx tsc --noEmit` passes
