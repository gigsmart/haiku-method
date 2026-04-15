# Unit 07: Doc Scrub + VALIDATION.md + End-to-End Smoke

## Implementation summary

### Task 1 — stale review-tool doc scrub

The `get_review_status` polling tool was already removed in prior units. Running the
criterion rg command returns zero hits across all doc sources (excluding CHANGELOG.md
and unit-07 files). No rewrite was needed.

### Task 2 — VALIDATION.md created

`packages/haiku/VALIDATION.md` created with two sections:

**MCP Apps capability negotiation:**
- `hostSupportsMcpApps()` in `src/state-tools.ts` — reads `experimental.apps` from
  the MCP client's initialize handshake capabilities; cached per connection.
- Server must declare both `resources: {}` and `experimental: { apps: {} }` in its
  capabilities for the MCP Apps path to be available.

**Cowork review transport:**
- Branching point in `server.ts` `setOpenReviewHandler` — checks `hostSupportsMcpApps()`
  and routes to `openReviewMcpApps` (MCP Apps path) or HTTP+tunnel+browser.
- V5-10 timeout fallback: signal abort → synthetic `changes_requested` +
  `blocking_timeout_observed: true` written to intent frontmatter.
- `haiku_cowork_review_submit` tool wakes `waitForSession()` via `updateSession()`.

### Task 3 — Smoke test

`packages/haiku/scripts/smoke-mcp-apps-review.ts`:
- Creates a temp fixture dir outside git repo (no git commits during test).
- Wires the REAL `openReviewMcpApps` as the `_openReviewAndWait` handler.
- Calls `handleOrchestratorTool("haiku_run_next")` → elaborate phase → gate_review →
  `openReviewMcpApps` blocks on session.
- Concurrently approves via `updateSession()`.
- Reads `stages/inception/state.json` and asserts `phase === "execute"`.
- Exits 0 with PASS on stdout.

All 308 tests pass. Build clean.
