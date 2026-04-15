---
title: 'End-to-end Cowork validation: /haiku:start through gate approval'
type: validation
model: sonnet
depends_on:
  - unit-05-cowork-open-review-handler
  - unit-06-visual-question-design-direction
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - stages/inception/units/unit-05-cowork-open-review-handler.md
  - stages/inception/units/unit-06-visual-question-design-direction.md
  - knowledge/unit-08-cowork-e2e-validation-research.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-15T04:46:00Z'
hat_started_at: '2026-04-15T04:47:29Z'
outputs:
  - knowledge/unit-08-cowork-e2e-validation-research.md
completed_at: '2026-04-15T04:50:27Z'
---

# End-to-end Cowork validation: /haiku:start through gate approval

## Scope

Verify the full user-facing flow inside Cowork: `/haiku:start` → inception elaboration → `gate_review` → approve → `fsmAdvancePhase` to execute. No mocks, no stubs — real Cowork binary, real MCP Apps host, real iframe, real user click. Mirror the same flow under local Claude Code as a regression baseline.

In scope:
- Produce `knowledge/COWORK-E2E-PLAN.md` as a thin wrapper that references the 15 checkpoints in `knowledge/unit-08-cowork-e2e-validation-research.md` §1 as the canonical test plan — do not duplicate checkpoint text.
- Execute the plan once inside Cowork and once under local Claude Code against the same built binary.
- Capture evidence (screenshots, log grep output, state snapshots) and attach to the PR.

Out of scope:
- Stress / load testing.
- Non-`/haiku:start` entry points (`autopilot`, `pickup`, `revisit`) — tracked as followups.

## Precondition (blocker inheritance)

Unit-02 §5.1 blocking-vs-resumable measurement is still open. If that lands as **resumable**, checkpoints 7–9 in the research artifact shift (submit tool call splits from the next FSM tick resolving `pending_review`). Re-read `knowledge/unit-08-cowork-e2e-validation-research.md §4` before executing and branch the plan accordingly.

## Test fixture (minimum)

- **MCP host:** any host that advertises `experimental.apps` capability during the `initialize` handshake (Cowork is the current target; Claude Desktop / Goose / VS Code Copilot if they ship MCP Apps support). **No env-var setup** — the validator does not set `CLAUDE_CODE_IS_COWORK`.
- **Roots capability** (workspace paths): host MUST advertise `roots` capability with at least one workspace folder. If not, `requestHostWorkspace()` fires first and prompts via `elicitInput`.
- **Binary:** built from `haiku/cowork-mcp-apps-integration/main` at this commit — required for `experimental.apps` server capability and `_meta.ui` envelope.
- **Fixture intent slug:** `mcp-apps-e2e-smoke-<timestamp>` — MUST be distinct from `cowork-mcp-apps-integration` to avoid clobbering the active dev intent. Description: short one-liner that elaborates in a single pass.

## FSM transitions the plan MUST observe

Cite the research artifact for line numbers; the plan observes these transitions on disk and in the session log:

- `stages/inception/state.json`: starts at `phase: "elaborate"`, ends at `phase: "execute"` after `fsmAdvancePhase` (`orchestrator.ts:3017`).
- `intent.md` frontmatter: `intent_reviewed` absent/false → `intent_reviewed: true` written by the `gate_review` path (`orchestrator.ts:3016`).
- Session log (`stFile`) gains `event: "gate_review_opened"` (`orchestrator.ts:2989`) and `event: "gate_decision", decision: "approved"` (`orchestrator.ts:3002`).
- `haiku_cowork_review_submit` resolves with `{decision, feedback, annotations}` per contract at `orchestrator.ts:2846`.

## Genuine-iframe assertion

Fallback detection is the highest-risk failure mode. The plan MUST fail if any of the following is missing:

- Capability negotiation: `server.getClientCapabilities()` returns an object containing `experimental.apps` after the `initialize` handshake completes. Verified by an MCP-level capture of the `initialize` exchange.
- Tool result envelope on the `gate_review` action carries `_meta.ui.resourceUri` (unit-03 helper).
- Iframe console emits the `host-bridge.ts#isMcpAppsHost()` log line reporting `window.parent !== window` **and** successful `new App({...})` construction (unit-04 §Detection probe). This is NOT PR #213's `useReviewSession` heartbeat — that module is not bundled; the load-bearing logger is the new bridge module.

## Regression scope (non-MCP-Apps host)

Run the same fixture against a host that does NOT advertise `experimental.apps` (local Claude Code today, or a stub MCP client without the capability). Assert bit-identical final state on `intent.md` frontmatter and `state.json` `phase`/`gate_outcome`, and identical session-log event names. **Expected divergences** (not failures):

- Non-MCP-Apps host hits `startHttpServer()` at `server.ts:835`, `openTunnel()` at `:840`, and `openBrowser()` at `:846-859`; the MCP Apps host skips all three.
- Non-MCP-Apps tool result lacks `_meta.ui.*`; MCP Apps host carries it.
- `host-bridge.ts` log line reports `isMcpAppsHost() == false` on the regression run.

## Completion Criteria (all runnable)

- File exists: `test -f .haiku/intents/cowork-mcp-apps-integration/knowledge/COWORK-E2E-PLAN.md`.
- Plan references the research artifact: `grep -q 'unit-08-cowork-e2e-validation-research.md' knowledge/COWORK-E2E-PLAN.md`.
- Fixture intent created: `test -f .haiku/intents/mcp-apps-e2e-smoke-*/intent.md`.
- Frontmatter transition: `grep -E '^intent_reviewed:\s*true' .haiku/intents/mcp-apps-e2e-smoke-*/intent.md`.
- State transition: `jq -e '.phase == "execute"' .haiku/intents/mcp-apps-e2e-smoke-*/stages/inception/state.json`.
- Session log events: `grep -c 'gate_review_opened' <stFile>` >= 1 **and** `grep -c '"decision":"approved"' <stFile>` >= 1.
- Capability negotiation captured: `<initialize-capture>.serverCapabilities.experimental.apps` is non-null AND `<initialize-capture>.clientCapabilities.experimental.apps` is non-null.
- MCP Apps envelope: `grep -q '_meta.ui.resourceUri' <captured-tool-result-json>`.
- Host-bridge mode log: `grep -q 'isMcpAppsHost.*true' <iframe-console-log>`.
- Screenshot count: `ls evidence/screenshots/*.png | wc -l` >= 3 (iframe render, decision submit, next FSM tick).
- Regression diff: state-file diff between MCP-Apps host and non-MCP-Apps host runs is empty except for the divergent transport lines above — captured in the PR description.
- **No env-var coupling.** Plan MUST NOT instruct the validator to set `CLAUDE_CODE_IS_COWORK` or any other host-specific env var. Detection is via capability negotiation only.
