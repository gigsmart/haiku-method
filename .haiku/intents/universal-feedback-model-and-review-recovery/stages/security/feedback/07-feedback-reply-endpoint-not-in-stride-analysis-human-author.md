---
title: >-
  Feedback reply endpoint not in STRIDE analysis — human author_type hardcoded
  without documentation
status: closed
origin: adversarial-review
author: threat-coverage
author_type: agent
created_at: '2026-04-24T14:41:52Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:FB-07:bolt-1'
bolt: 1
upstream_stage: null
resolution: null
replies: []
integrator_attempts: 2
---

The `/api/feedback/:intent/:stage/:feedbackId/replies` (POST) endpoint introduced in this intent is absent from both the base threat model and the expanded threat model.

This endpoint:
- Accepts a `body` (up to 5,000 chars) and an optional `author` hint from the caller.
- Hardcodes `author_type: "human"` on all replies (http.ts:1785).
- Accepts `close_as_answered: true` to flip the parent feedback item to `"answered"` status in the same write — removing it as a gate blocker.
- Uses `verifyFeedbackMutationAuth` (JWT-claim session binding) in remote mode, same as other mutations.

**Specific gaps:**

1. **Spoofing:** The `author` field on the reply is caller-supplied (`parsed.data.author ?? "user"`, http.ts:1784) and flows directly into `appendFeedbackReply` with no server-side override. Unlike the create endpoint (which hardcodes `"user"`), here the caller can supply any author string. The threat model does not characterize this.

2. **Elevation of privilege via `close_as_answered`:** The reply endpoint can transition a `pending` feedback item to `answered` (removing it from the gate-blocking set) via `close_as_answered: true`. This is a higher-privilege operation than a plain PUT update. The threat model does not analyze whether this path has adequate guard: in remote mode it requires a valid JWT + session binding, but in local mode any localhost caller can close any feedback item by posting a reply with `close_as_answered: true` — including agent-authored feedback the agent itself could not close via MCP because `haiku_feedback_update` would require going through the assessor hat.

3. **Trust boundary:** The reply endpoint is reachable from the HTTP SPA boundary (human) but not through MCP tools. This asymmetry — replies are HTTP-only while feedback CRUD is dual (MCP + HTTP) — is not captured in the trust boundary table.

**Files:** `packages/haiku/src/http.ts:1744-1843`, `packages/haiku/src/state-tools.ts:appendFeedbackReply`, `stages/security/artifacts/threat-model-expanded.md` (trust boundary table).

**Mitigation required:** Add the replies endpoint to the STRIDE surface; document the `author` field pass-through; analyze whether `close_as_answered` in local mode is an accepted risk or needs guarding.
