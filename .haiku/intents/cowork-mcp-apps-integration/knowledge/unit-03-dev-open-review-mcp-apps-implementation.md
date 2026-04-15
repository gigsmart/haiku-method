# Unit 03 Dev: openReviewMcpApps Implementation

## Summary

Extracted the MCP Apps arm of `setOpenReviewHandler` from `server.ts` into a
standalone exported function `openReviewMcpApps()` in
`packages/haiku/src/open-review-mcp-apps.ts`. Rewrote the test suite to call
the real function rather than a reimplemented helper.

## Files Produced

- `packages/haiku/src/open-review-mcp-apps.ts` — extracted MCP Apps arm,
  exported for direct unit testing. Intentionally does NOT import `./http.js`,
  `./tunnel.js`, or `node:child_process` (structural CC-2 guarantee).
- `packages/haiku/test/open-review-mcp-apps.test.mjs` — 30 tests across
  11 groups; calls the real `openReviewMcpApps()` with real AbortSignal,
  real tmp intent dirs, and real session module. No `runMcpAppsArm` helper.

## Key Decisions

- **Extraction over delegation.** The MCP Apps arm body lives in its own
  module so tests can import and exercise the real code path. `server.ts`
  `setOpenReviewHandler` callback now calls `openReviewMcpApps({...})` as a
  single delegating call.
- **Structural import check.** `assertNoHttpImports()` in the test file greps
  the source of `open-review-mcp-apps.ts` for forbidden import patterns —
  satisfies CC-2 structurally, not just behaviorally.
- **`listSessions()` added to sessions.ts** so tests can discover the session
  that `openReviewMcpApps` creates internally (the function never returns
  `session_id` to the caller).
- **unit-02-outcome: blocking** — the default outcome per inception unit-02
  is the blocking/waiting path (promise-race with AbortSignal), not polling.

## Quality Gates

All green: `npm run prebuild && npm run typecheck && npx biome check src && npm test`
Total: 290 passed, 0 failed across 9 test files.
`open-review-mcp-apps.test.mjs`: 30 passed.
