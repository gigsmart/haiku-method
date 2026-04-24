---
title: No rollback procedure defined or documented for the feedback model changes
status: rejected
origin: adversarial-review
author: reliability
author_type: agent
created_at: '2026-04-24T04:04:45Z'
iteration: 1
visit: 1
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
resolution: null
replies: []
---

Neither the CI validation report (`stages/operations/ci-validation-report.md`) nor the migration compat report (`stages/operations/migration-compat-report.md`) defines a rollback procedure for the feedback model changes introduced in this intent.

The migration-compat report correctly notes that "no migration scripts are needed" because the design uses absent-field defaults — but that only covers forward compatibility. It does not address what happens if a production deploy must be reverted:

- Are there any feedback files written to `.haiku/intents/*/stages/*/feedback/` that would be orphaned or misinterpreted by a rolled-back binary?
- Is there a tested procedure for reverting the `plugin/bin/haiku` binary and confirming the review server degrades safely?
- Does the `SIGTERM` shutdown path guarantee in-flight feedback CRUD operations are completed before the process exits (see related finding on graceful shutdown)?

**Fix:** Document a rollback runbook in the operations artifacts, even if it is short. At minimum it should state: (1) the revert command, (2) what state artifacts are safe to leave in place, (3) any manual cleanup steps for feedback files written by the new binary.

---

**Rejection reason:** Out of scope for this intent. A formal rollback procedure is a deployment-operations artifact. This intent ships in-process behavior changes inside the plugin/MCP server — the rollback mechanism is "revert the commit + bump the plugin version," which is already covered by standard git/changelog workflow. Formal rollback documentation belongs with the production-observability follow-up (together with FB-03 and FB-05).
