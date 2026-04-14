---
title: "Cowork-mode _openReviewAndWait implementation"
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
outputs:
  - knowledge/unit-05-open-review-handler-research.md
---

# Cowork-mode _openReviewAndWait implementation

## Scope

Branch the `setOpenReviewHandler` body (`server.ts:768–927`) on `isCoworkHost()`. The local branch MUST remain byte-for-byte identical to today's implementation. The Cowork branch skips `startHttpServer()` (`server.ts:835`), `openTunnel()` (`server.ts:840`), and `openBrowser()` (`server.ts:859`), and replaces the 3×10 min `waitForSession` retry loop (`server.ts:862–919`) with an MCP Apps delivery path.

### Contract pin (non-negotiable)

`setOpenReviewHandler` at `orchestrator.ts:2827–2833` types the handler as
`(intentDir, reviewType, gateType?) => Promise<{decision: string; feedback: string; annotations?: unknown}>`.
The Cowork branch MUST resolve with **the identical 3-field object** so `gate_review` in `handleOrchestratorTool` at `orchestrator.ts:2995` still branches correctly at `:3008` (`approved`), `:3068` (`external_review`), and the implicit else (`changes_requested`). No other call sites. No shape drift.

### Hard precondition: unit-02 outcome

Unit-02's blocking-vs-resumable decision is **empirically unmeasured** — its spike runs in a later stage. Unit-05 cannot begin implementation until unit-02 reports a measured tool-call ceiling. Until then, this spec carries two branches; unit-02's result picks exactly one at unit-05 kickoff.

- **Branch A — blocking (ceiling ≥ 30 min):** `_openReviewAndWait` keeps a single `await` on the decision promise. The entry tool result carries `_meta.ui.resourceUri` (via `buildUiResourceMeta()` from unit-03). The SPA calls `haiku_cowork_review_submit` via the unit-04 `App.callServerTool` bridge to resolve the in-memory promise. No FSM persistence of the session ID.
- **Branch B — resumable (ceiling < 30 min):** The entry tool returns a `pending_review` action to the orchestrator. The FSM persists `cowork_review_session_id` in state. A subsequent `haiku_cowork_review_submit` call validates the session ID, hydrates `{decision, feedback, annotations?}` into the persisted slot, and the next FSM tick resolves the gate. The handler contract is preserved by the next-tick resolution — the orchestrator still observes the same `Promise<{decision, feedback, annotations?}>` shape.

### In scope

- `isCoworkHost()` branch inside `setOpenReviewHandler` (`server.ts:768`).
- Register `haiku_cowork_review_submit` by **appending one object literal** to the flat array at `server.ts:189` and **one case branch** in the `CallToolRequestSchema` dispatch. No registry refactor. Tool validates session ID and decision shape.
- First consumer of `buildUiResourceMeta()` (from unit-03) — the entry tool result MUST carry `_meta.ui.resourceUri = "ui://haiku/review/<version>"` so Cowork renders the iframe.
- Push session data into the iframe via the unit-04 bridge's `updateModelContext` so the SPA renders without any `/api/session/:id` fetch.
- Unit tests for all three decisions (`approved`, `changes_requested`, `external_review`) asserting handler-resolved payload equals the HTTP-path snapshot.

### Out of scope

- `ask_user_visual_question` and `pick_design_direction` — unit-06.
- HTTP-path behavior — MUST remain byte-identical.
- E2E encryption (irrelevant inside Cowork's MCP channel; the existing `clearE2EKey`/`closeTunnel` cleanup is already gated by `isRemoteReviewEnabled()` and naturally skipped on the Cowork branch).
- Telemetry tag `cowork_transport:true` at `orchestrator.ts:3001` (defer to follow-up).

## Completion Criteria

- **Non-Cowork byte-identity.** `git diff HEAD~1 -- packages/haiku/src/server.ts` shows the pre-intent HTTP branch body unchanged inside the new `if (isCoworkHost())` else-arm. Verify: `node scripts/diff-http-branch.mjs` returns exit 0 (snapshot compare against pre-intent commit).
- **Cowork branch skips local I/O.** Integration test with `CLAUDE_CODE_IS_COWORK=1` spies on `startHttpServer`, `openTunnel`, `openBrowser` via `vi.spyOn` and asserts each `callCount === 0`. Verify: `pnpm -C packages/haiku test cowork-review.test.ts -t "skips local io"`.
- **Entry tool result carries `_meta.ui.resourceUri`.** Assertion: `result._meta.ui.resourceUri === "ui://haiku/review/" + pluginVersion`. Verify: grep-checkable `rg "_meta.ui.resourceUri" packages/haiku/src/server.ts` returns ≥ 1 hit in the Cowork branch.
- **Tool registration is one-append + one-case.** Verify: `rg "haiku_cowork_review_submit" packages/haiku/src/server.ts | wc -l` returns exactly `2` (array entry + dispatch case).
- **Decision shape parity.** Vitest `expect(cowork.result).toEqual(http.result)` for each of `approved`, `changes_requested`, `external_review`. Verify: test names `cowork review · approved | changes_requested | external_review`.
- **Orchestrator branching unchanged.** Integration test drives `handleOrchestratorTool` through `gate_review` and asserts the branch-counter spy hits `:3008` / `:3068` / else exactly once per decision. Verify: spy-based counter test passes.
- **Unit-02 branch recorded.** Commit message contains the literal line `unit-02-outcome: blocking` OR `unit-02-outcome: resumable`. Verify: `git log -1 --format=%B | rg "unit-02-outcome: (blocking|resumable)"` exits 0.
- **`packages/haiku/VALIDATION.md` documents both transports.** Verify: `rg "Cowork review transport" packages/haiku/VALIDATION.md` returns ≥ 1 hit.
