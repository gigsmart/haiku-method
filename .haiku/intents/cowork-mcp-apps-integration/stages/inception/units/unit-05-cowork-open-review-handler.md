---
title: Cowork-mode _openReviewAndWait implementation
type: feature
model: sonnet
depends_on:
  - unit-01-cowork-env-probe
  - unit-02-cowork-timeout-spike
  - unit-03-ui-resource-registration
  - unit-04-spa-host-bridge
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/COWORK-TIMEOUT-SPIKE.md
  - stages/inception/units/unit-01-cowork-env-probe.md
  - stages/inception/units/unit-02-cowork-timeout-spike.md
  - stages/inception/units/unit-03-ui-resource-registration.md
  - stages/inception/units/unit-04-spa-host-bridge.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-15T04:38:10Z'
hat_started_at: '2026-04-15T04:39:57Z'
outputs:
  - knowledge/unit-05-open-review-handler-research.md
completed_at: '2026-04-15T04:40:36Z'
---

# MCP-Apps-mode _openReviewAndWait implementation

## Scope

Branch the `setOpenReviewHandler` body (`server.ts:768–927`) on `hostSupportsMcpApps()` (the unit-01 capability-negotiation accessor). The non-MCP-Apps branch MUST remain byte-for-byte identical to today's HTTP+tunnel+browser implementation. The MCP Apps branch skips `startHttpServer()` (`server.ts:835`), `openTunnel()` (`server.ts:840`), and `openBrowser()` (`server.ts:846/859`), and replaces the 3×10 min `waitForSession` retry loop (`server.ts:862–919`) with an MCP Apps delivery path.

### Contract pin (non-negotiable)

`setOpenReviewHandler` at `orchestrator.ts:2846` types the handler as
`(intentDir, reviewType, gateType?) => Promise<{decision: string; feedback: string; annotations?: unknown}>`.
The MCP Apps branch MUST resolve with **the identical 3-field object** so `gate_review` in `handleOrchestratorTool` at `orchestrator.ts:2980` still branches correctly at the `decision === "approved"` arm (`:3016` writes `intent_reviewed: true`, `:3017` calls `fsmAdvancePhase`), `decision === "external_review"` (`:3032` `fsmAdvancePhase`), and the implicit `changes_requested` else. No other call sites. No shape drift.

### Unit-02 outcome — default and override

Unit-02's blocking-vs-resumable spike has not yet measured a real ceiling against an MCP Apps host. **Default to `blocking`** for the initial implementation: most MCP hosts honor multi-minute tool calls, the implementation is simpler, and reverting to `resumable` is a localized refactor. The unit-02 spike at execute-stage replaces the default if measurement disagrees.

- **Branch A — blocking (default):** `_openReviewAndWait` keeps a single `await` on the decision promise. The entry tool result carries `_meta.ui.resourceUri` (via `buildUiResourceMeta()` from unit-03). The SPA calls `haiku_cowork_review_submit` via the unit-04 `App.callServerTool` bridge to resolve the in-memory promise. No FSM persistence of the session ID.
- **Branch B — resumable (only if unit-02 measures ceiling < 30 min):** The entry tool returns a `pending_review` action to the orchestrator. The FSM persists `cowork_review_session_id` in state. A subsequent `haiku_cowork_review_submit` call validates the session ID and the next FSM tick resolves the gate. The handler contract is preserved by the next-tick resolution.

### In scope

- `hostSupportsMcpApps()` branch inside `setOpenReviewHandler` (`server.ts:768`). **Not** an env-var check — capability-negotiation only.
- Register `haiku_cowork_review_submit` by **appending one object literal** to the flat tool array at `server.ts:189` and **one case branch** in the `CallToolRequestSchema` dispatch. No registry refactor. Tool validates session ID and decision shape.
- First consumer of `buildUiResourceMeta()` (from unit-03) — the entry tool result MUST carry `_meta.ui.resourceUri = "ui://haiku/review/<version>"` so the host renders the iframe.
- Push session data into the iframe via the unit-04 bridge's `updateModelContext` so the SPA renders without any `/api/session/:id` fetch.
- Unit tests for all three decisions (`approved`, `changes_requested`, `external_review`) asserting handler-resolved payload equals the HTTP-path snapshot.

### Out of scope

- `ask_user_visual_question` and `pick_design_direction` — unit-06.
- HTTP-path behavior — MUST remain byte-identical.
- E2E encryption (irrelevant inside the MCP channel; the existing `clearE2EKey`/`closeTunnel` cleanup is already gated by `isRemoteReviewEnabled()` and naturally skipped on the MCP Apps branch).
- Telemetry tagging — defer to follow-up.

## Completion Criteria

- **Non-MCP-Apps byte-identity.** `git diff HEAD~1 -- packages/haiku/src/server.ts` shows the pre-intent HTTP branch body unchanged inside the new `if (hostSupportsMcpApps())` else-arm. Verify: `node scripts/diff-http-branch.mjs` returns exit 0 (snapshot compare against pre-intent commit).
- **MCP Apps branch skips local I/O.** Integration test with a stub client advertising `experimental.apps` capability spies on `startHttpServer`, `openTunnel`, `openBrowser` via `vi.spyOn` and asserts each `callCount === 0`. Verify: `pnpm -C packages/haiku test cowork-review.test.ts -t "skips local io when host supports apps"`.
- **Entry tool result carries `_meta.ui.resourceUri`.** Assertion: `result._meta.ui.resourceUri === "ui://haiku/review/" + REVIEW_APP_VERSION`. Verify: `rg "_meta\\?.ui\\?.resourceUri|_meta\\.ui\\.resourceUri" packages/haiku/src/server.ts` returns ≥ 1 hit in the MCP Apps branch.
- **Tool registration is one-append + one-case.** Verify: `rg "haiku_cowork_review_submit" packages/haiku/src/server.ts | wc -l` returns exactly `2` (array entry + dispatch case).
- **Decision shape parity.** Vitest `expect(mcpApps.result).toEqual(http.result)` for each of `approved`, `changes_requested`, `external_review`. Test names `mcp-apps review · approved | changes_requested | external_review`.
- **Orchestrator branching unchanged.** Integration test drives `handleOrchestratorTool` through `gate_review` and asserts the orchestrator branches at `orchestrator.ts:3016/3017` (approved) and `:3032` (external_review) exactly once per decision via spy on `fsmAdvancePhase` / `setFrontmatterField`. Verify: spy-based counter test passes.
- **Unit-02 outcome recorded in commit.** Commit message contains the literal line `unit-02-outcome: blocking` OR `unit-02-outcome: resumable`. Verify: `git log -1 --format=%B | rg "unit-02-outcome: (blocking|resumable)"` exits 0.
- **No env-var coupling.** `rg "isCoworkHost|CLAUDE_CODE_IS_COWORK" packages/haiku/src/server.ts` returns zero hits in the changes (existing references in unrelated files are not blocking but should be flagged in PR).
- **`packages/haiku/VALIDATION.md` documents both transports.** Verify: `rg "MCP Apps review transport" packages/haiku/VALIDATION.md` returns ≥ 1 hit.
