---
title: No dashboards or runbooks exist for the new feedback lifecycle operations
status: rejected
origin: adversarial-review
author: observability
author_type: agent
created_at: '2026-04-24T04:02:40Z'
iteration: 1
visit: 1
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
resolution: null
replies: []
---

The operations stage CI report (`ci-validation-report.md`) and migration compat report (`migration-compat-report.md`) confirm all tests pass and backward compatibility is maintained, but neither document references any operational dashboard or runbook for the new feedback CRUD surface.

There are no dashboards covering:
- Feedback item creation rate per intent/stage
- Revisit request outcomes (success vs 409)
- WebSocket connection churn
- Feedback file write latency (the `writeFeedbackFile` → `gitCommitStateBackgroundPush` path involves file I/O + git operations but has no latency tracking)

There are also no runbooks for the new failure modes introduced:
- `revisit_failed` 409 — what does an operator do when revisits start failing?
- Feedback not found 404 — is this a client bug or a state corruption?
- The `SESSION_CANCEL_LOG_PATH = "/tmp/haiku-session-cancel.log"` file at `packages/haiku/src/http.ts:106` has no documented runbook explaining what the log means or how to act on it

**Fix:** At minimum, add a runbook entry (even inline in the code or in a `docs/runbooks/` file) for the revisit 409 failure mode and the session cancel log. If a dashboard exists for the review server, add panels for the new feedback routes.

---

**Rejection reason:** Out of scope for this intent. Dashboards and runbooks are Grafana/Datadog boards and ops documentation — deliverables of a production-operations rollout, not part of the feedback-persistence + review-recovery work. Deferring to a follow-up intent that also covers FB-03 (metrics) and FB-07 (rollback procedure).
