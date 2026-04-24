---
title: >-
  http-feedback-strict-auth: 3 tests describe stale X-Haiku-Session-Id gate —
  will fail if runner is fixed
status: pending
origin: adversarial-review
author: security-blue-team
author_type: agent
created_at: '2026-04-24T14:20:27Z'
iteration: 1
visit: 1
source_ref: stages/security/artifacts/threat-model-expanded.md#S2
closed_by: null
bolt: 0
upstream_stage: null
resolution: null
replies: []
---

**Severity:** MEDIUM (security test drift — security control is correct, tests are wrong)

**Discovered by:** security stage blue-team review

**File:** `packages/haiku/test/http-feedback-strict-auth.test.mjs`

## Problem

Three tests in `http-feedback-strict-auth.test.mjs` assert a security control that no longer exists:

```
"POST with JWT but no X-Haiku-Session-Id returns 401 (feedback gate: missing_session_header)"
"PUT with JWT but no X-Haiku-Session-Id returns 401"
"DELETE with JWT but no X-Haiku-Session-Id returns 401"
```

These were written when FB-20 introduced an `X-Haiku-Session-Id` header requirement. The implementation settled on JWT-claim-based session binding instead: `verifyFeedbackMutationAuth` (`http.ts:423`) reads the JWT's `sid` claim and checks that the session's `intent_slug` matches the URL's `{intent}` segment. No separate header is required or checked.

**What actually happens:** A POST with a valid JWT (regardless of whether `X-Haiku-Session-Id` is present) returns 201 if the JWT's `sid` maps to a session with matching intent. The tests expect 401, but the server returns 201.

**Why they currently appear to pass:** The test file uses `spawnSync` with `stdio: "inherit"` to re-exec itself with `HAIKU_REMOTE_REVIEW=1`. When invoked from `run-all.mjs` via `execSync` with `stdio: ["pipe", "pipe", "pipe"]`, the subprocess's output goes to the inherited stdio (the outer process's stdout), but `execSync` captures an empty string. The runner parses `0 passed, 0 failed` and records the file as passing. If the re-exec pattern is ever changed to capture subprocess output, the 3 broken tests will surface as failures.

**A fourth test is also affected:**
```
"CORS preflight advertises X-Haiku-Session-Id and Authorization in Allow-Headers"
```
`X-Haiku-Session-Id` is not in `allowedHeaders` (`http.ts:944`). The CORS response only lists `["Authorization", "Content-Type", "bypass-tunnel-reminder"]`.

## Fix Required

Replace the 4 stale tests with accurate ones:

1. `"POST with JWT for wrong session returns 403 (forbidden_cross_session)"` — mint a JWT with `sid: "nonexistent-session-id"`, verify 403 with `error: "forbidden_cross_session"`
2. `"PUT with JWT for wrong session returns 403"` — same pattern
3. `"DELETE with JWT for wrong session returns 403"` — same pattern
4. `"CORS preflight advertises Authorization in Allow-Headers (FB-30 bearer token gate)"` — remove the `X-Haiku-Session-Id` assertion, keep the `Authorization` assertion

The test "POST with matching JWT + X-Haiku-Session-Id proceeds (201)" should become "POST with matching JWT (sid-bound session) proceeds (201)" and drop the `X-Haiku-Session-Id` header from the request.

## Correct Security Model (verified in http.ts:423-464)

```
POST /api/feedback/{intent}/{stage}
  → requireTunnelAuth: JWT bearer required (401 missing_token if absent)
  → verifyFeedbackMutationAuth:
      - extract JWT, verify signature + expiry
      - sessionId = jwt.payload.sid
      - session = getSession(sessionId)
      - if no session → 403 forbidden_cross_session (unknown_session)
      - if session.intent_slug !== intent → 403 forbidden_cross_session (intent_mismatch)
      - else: proceed
```

The security guarantee is equivalent to or stronger than the original header-based design. The JWT is cryptographically signed and contains the session binding — no separate header is needed or could add security.
