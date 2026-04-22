---
title: Status-transition edge cases are missing from FeedbackItem/FeedbackList tests
status: closed
origin: adversarial-review
author: test-quality
author_type: agent
created_at: '2026-04-21T20:26:34Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-66:bolt-3'
bolt: 3
upstream_stage: null
---

**Severity:** Medium — the behavioral spec's key invariants around status transitions are not enumerated in tests.

**Files:**
- `packages/haiku-ui/src/components/feedback/__tests__/FeedbackItem.states.test.tsx`
- `packages/haiku-ui/src/components/feedback/__tests__/FeedbackList.states.test.tsx`

**What is tested (FeedbackItem.states.test.tsx:261-307):**
- pending → rejected (Dismiss)
- addressed → closed (Verify & Close)
- rejected → pending (Reopen)

**What is NOT tested:**
- **pending → closed directly**: is this even allowed? If the API allows it, the UI should either gate or support it. Neither path has a test.
- **addressed → rejected**: can an assessor reject a previously-addressed finding that was auto-progressed to addressed by closing a unit? Unit-01 acceptance criteria suggest this is a real path.
- **closed → pending (Reopen)**: the test only covers `rejected → pending`. Reopen from closed uses the same button label but the status transition is different; closed is typically terminal, so reopening should have a warn/confirm. No test.
- **Race: user clicks Dismiss twice rapidly**: does the second click no-op (already-rejected) or re-POST? Integration boundary with the API is untested.
- **Concurrent mutation: two tabs updating the same feedback item**: the WebSocket session-update path receives a status change while the user is clicking Dismiss. What wins? The `useSessionWebSocket` test mocks rAF and the status-transition tests don't involve WebSocket events — so the collision is not exercised.
- **Feedback with `upstream_stage` set**: the backend supports `upstream_stage: <other-stage>` for cross-stage findings; none of the UI tests render an item with that metadata to check the rendered affordance (e.g. does the item visually flag "originated elsewhere"? does Dismiss behave differently?).

**Why this matters:**
- The mandate says "verify that edge cases from the behavioral spec have corresponding tests." The behavioral spec (`FeedbackItem` status transitions + concurrent-tab sync + upstream-stage surfacing) is partially enumerated.
- Status-transition state machines are historically where subtle bugs live (double-close, reopen-after-reject races). The current tests cover the happy path only.

**Suggested fix:**
Add parameterized tests that iterate over a status-transition matrix:
```ts
const transitions: Array<[FeedbackStatus, string, FeedbackStatus]> = [
  ["pending",   "dismiss",       "rejected"],
  ["pending",   "verify-close",  "closed"], // if allowed
  ["addressed", "verify-close",  "closed"],
  ["addressed", "reopen",        "pending"],
  ["closed",    "reopen",        "pending"],
  ["rejected",  "reopen",        "pending"],
]
for (const [from, action, to] of transitions) { ... }
```
Then add a race-condition test (double Dismiss → one API call + idempotent UI) and a WebSocket-collision test (dispatch `session-update` with new status while Dismiss is in-flight).

Mandate reference: "edge cases from the behavioral spec have corresponding tests".
