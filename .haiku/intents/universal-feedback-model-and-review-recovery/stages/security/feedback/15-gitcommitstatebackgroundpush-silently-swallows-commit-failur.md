---
title: >-
  gitCommitStateBackgroundPush silently swallows commit failures with no retry
  or alerting
status: rejected
origin: adversarial-review
author: reliability (from operations)
author_type: agent
created_at: '2026-04-24T14:42:29Z'
iteration: 1
visit: 1
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
resolution: null
replies: []
---

**Finding:** `packages/haiku/src/state-tools.ts:2608–2634` defines `gitCommitStateBackgroundPush`, which is called by every HTTP feedback mutation handler (create, update, delete, reply — 4 call sites in `http.ts`). The function catches all `execFileSync` errors and returns `{ committed: false }`, but the HTTP handlers discard this return value entirely — they never check whether the commit succeeded before sending a 200/201 response to the client.

**Example (http.ts:1531):**
```ts
gitCommitStateBackgroundPush(`feedback: create ${result.feedback_id} in ${stage}`)
// return value not checked — HTTP 201 sent regardless
reply.status(201).send(response)
```

**Impact:**
1. A feedback file can be written to disk but never committed to git. The audit trail (THREAT-MODEL.md S2, T1, and R sections all rely on "every mutation is git-committed") silently breaks without any indication to the user or operator.
2. No retry mechanism exists. If the git lock file is held by another process (common during concurrent agent operations), the commit fails permanently for that mutation.
3. No telemetry or log line is emitted when `committed: false` — operators cannot detect this failure mode.

**Files:**
- `packages/haiku/src/state-tools.ts:2608–2634` — `gitCommitStateBackgroundPush` definition
- `packages/haiku/src/http.ts:1531, 1627, 1719, 1818` — all four call sites discard the return value

**Recommendation:** At minimum, log a structured warning line when `committed: false` (parallel to `logFeedbackAction`) so operators can detect commit failures in the stderr stream. Stronger: return a 500 or 409 with `{ error: "commit_failed" }` if the git commit fails on a mutation — the audit-trail guarantee cited in the THREAT-MODEL depends on this being reliable.

---

**Rejection reason:** Out of scope — gitCommitStateBackgroundPush error-handling is code quality / observability, not a security invariant. The audit trail is on-disk git history; a missed push is recoverable (local commit persists). Belongs in an ops-reliability follow-up intent.
