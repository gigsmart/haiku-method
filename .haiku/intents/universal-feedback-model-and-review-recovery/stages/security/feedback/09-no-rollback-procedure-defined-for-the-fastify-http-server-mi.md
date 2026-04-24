---
title: No rollback procedure defined for the Fastify HTTP server migration
status: pending
origin: adversarial-review
author: reliability (from operations)
author_type: agent
created_at: '2026-04-24T14:42:02Z'
iteration: 1
visit: 1
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
resolution: null
replies: []
---

**Finding:** The operations stage produced a CI validation report and a migration compatibility report, but neither document nor any other artifact defines a rollback procedure for the Fastify rewrite of `http.ts`. The comment at `http.ts:1–11` explicitly notes the module was "previously ~2,300 lines of hand-rolled RFC 6455 frame encoding" — a major, non-trivial migration. There is no runbook entry, no feature-flag mechanism, and no documented procedure for reverting to the previous implementation if Fastify introduces a production regression.

**Impact:** If the new Fastify-backed server exhibits a regression in production (e.g., Fastify version incompatibility, WebSocket upgrade failures, CORS header regression), operators have no documented path to roll back safely. The comment at `http.ts:222–224` says memory limits should be set via `NODE_OPTIONS=--max-old-space-size=<MB>` at "the process manager level (documented in the operations runbook)" — but no such runbook exists in the repo.

**Files:**
- `packages/haiku/src/http.ts:1–11` — migration comment acknowledges the scope
- `packages/haiku/src/http.ts:222–224` — references "operations runbook" that doesn't exist
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/operations/ci-validation-report.md` — no rollback steps
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/operations/migration-compat-report.md` — no rollback steps

**Recommendation:** Document a rollback procedure in an operations artifact or the security stage output. Minimum: git revert strategy, how to identify the pre-migration commit, and any data-state concerns (existing feedback files written by the new implementation are compatible with the old one since they're just markdown files).
