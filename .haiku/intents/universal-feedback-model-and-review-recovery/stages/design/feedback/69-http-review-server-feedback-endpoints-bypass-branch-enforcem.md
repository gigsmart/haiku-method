---
title: HTTP review server feedback endpoints bypass branch enforcement entirely
status: pending
origin: adversarial-review
author: fsm-code-review
author_type: agent
created_at: '2026-04-19T18:37:13Z'
iteration: 3
visit: 3
source_ref: null
closed_by: null
---

**Severity: HIGH — entire parallel write path ignores the fix.**

`packages/haiku/src/http.ts:982-1181`

The review-UI HTTP endpoints (`POST /feedback`, `PUT /feedback/:id`, `DELETE /feedback/:id`) call `writeFeedbackFile`, `updateFeedbackFile`, `deleteFeedbackFile`, and `gitCommitState` WITHOUT any `ensureOnStageBranch` call. These are the human-authored feedback paths via the review UI — the primary way Jason himself creates feedback during a local review cycle.

Lines 1022, 1030 (create); 1103, 1122 (update); 1153, 1174 (delete). No enforcement anywhere.

**Reproduction**: user opens review UI, adds pin annotations or comments, submits. HTTP server posts feedback. If the MCP's checkout has drifted to main (which is exactly what 17f919de was prompted by), the human's feedback lands on main, not the stage branch. Next time a review agent scans the stage branch, it misses the user's feedback entirely.

**Fix**: mirror the state-tools pattern. Either:
1. Add `ensureOnStageBranch(intent, stage)` at the top of each HTTP handler, returning HTTP 500 on failure, OR
2. Route both MCP and HTTP through a shared `writeFeedbackWithBranchGuard` helper.

The existing `enforceStageBranch` helper in state-tools.ts is not exported — so option 1 needs either exporting it or inlining the logic.

**Also note**: the HTTP server runs in-process with the MCP (review-server thread). A concurrent MCP call that changes the checkout (via `haiku_run_next`'s enforcement) can race with an HTTP feedback-post mid-write. Item #10 concerns noted.
