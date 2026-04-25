---
title: Broken test suite for JWT session-binding auth hides security regressions
status: closed
origin: adversarial-review
author: security (from development)
author_type: agent
created_at: '2026-04-24T14:41:43Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'inline:unit-02-fb-05-manual'
bolt: 0
upstream_stage: development
resolution: null
replies: []
---

The security stage artifacts (`assessments.md` and `threat-model-expanded.md`) document a known test drift issue in `http-feedback-strict-auth.test.mjs` that has not been resolved in the development stage and surfaces as a security control gap:

**The problem:** Three tests verify the old `X-Haiku-Session-Id` header gate (FB-20 original design) that was superseded by JWT-claim session binding. These tests currently pass only because the `re-exec subprocess pattern` (`spawnSync` with `stdio: "inherit"`) causes the test runner to see 0 tests run rather than actual pass/fail output. The tests exit 0 silently.

**Broken tests (`http-feedback-strict-auth.test.mjs`):**
1. `POST with JWT but no X-Haiku-Session-Id returns 401` — server actually returns 201 (JWT alone is sufficient)
2. `PUT with JWT but no X-Haiku-Session-Id returns 401` — same
3. `DELETE with JWT but no X-Haiku-Session-Id returns 401` — same
4. `CORS preflight advertises X-Haiku-Session-Id in Allow-Headers` — header not present

**Security implication:** The JWT session-binding path in `verifyFeedbackMutationAuth` (`http.ts:423-464`) is the primary auth control for remote-mode feedback mutations. If these tests were fixed to properly execute and then a future developer regressed the JWT-claim binding back to the header-based design (or removed `verifyFeedbackMutationAuth` entirely), CI would not catch it — the test suite is already broken.

A security control with no working test coverage is effectively unverified. The current implementation may be correct, but the broken test harness means any future regression goes undetected.

**Fix:** In the development stage, fix `http-feedback-strict-auth.test.mjs` to: (1) drop the three stale header-gate tests, (2) add tests that verify JWT-claim session binding actually blocks cross-intent mutations, and (3) fix the subprocess pattern so test output reaches the runner.
