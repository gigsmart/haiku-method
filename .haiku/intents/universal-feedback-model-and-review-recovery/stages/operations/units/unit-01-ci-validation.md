---
title: CI pipeline validation
type: operations
depends_on: []
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DISCOVERY.md
status: active
bolt: 1
hat: sre
started_at: '2026-04-16T16:38:35Z'
hat_started_at: '2026-04-16T16:40:43Z'
---

# CI Pipeline Validation

Verify the full CI pipeline passes with all feedback model changes: typecheck, lint, tests, and review-app build. Ensure backward compatibility with existing intents that have no `feedback/` directories or `visits` field.

## Completion Criteria

- `npx tsc --noEmit` passes with zero errors across all packages
- `npm test` passes with all 418+ tests green (zero failures, zero skipped)
- Review app builds: `cd packages/haiku/review-app && npm run build` succeeds
- Backward compatibility verified: existing intent fixtures (no feedback/ dir, no visits field, no closes: field) process without errors
- No lint regressions: `npx biome check --no-errors-on-unmatched packages/haiku/src/` passes
- Plugin binary rebuilt: `plugin/bin/haiku` reflects all source changes
