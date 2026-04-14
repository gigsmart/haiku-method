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
status: active
bolt: 1
hat: elaborator
started_at: '2026-04-14T22:58:14Z'
hat_started_at: '2026-04-14T23:02:37Z'
outputs:
  - knowledge/COWORK-E2E-PLAN.md
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

## Cowork fixture (minimum)

- Env: `CLAUDE_CODE_IS_COWORK=1`, `CLAUDE_CODE_WORKSPACE_HOST_PATHS=<workspace-host-path>` (non-empty; if empty, `request_cowork_directory` fires first).
- Binary: built from `haiku/cowork-mcp-apps-integration/main` at this commit — required for `_meta.ui` envelope.
- Fixture intent slug: `cowork-e2e-smoke-<timestamp>` — MUST be distinct from `cowork-mcp-apps-integration` to avoid clobbering the active dev intent. Description: short one-liner that elaborates in a single pass.

## FSM transitions the plan MUST observe

Cite the research artifact for line numbers; the plan observes these transitions on disk and in the session log:

- `stages/inception/state.json`: starts at `phase: "elaborate"`, ends at `phase: "execute"` after `fsmAdvancePhase` (`orchestrator.ts:3017`).
- `intent.md` frontmatter: `intent_reviewed` absent/false → `intent_reviewed: true` written by the `gate_review` path (`orchestrator.ts:3016`).
- Session log (`stFile`) gains `event: "gate_review_opened"` (`orchestrator.ts:2988`) and `event: "gate_decision", decision: "approved"` (`orchestrator.ts:3001`).
- `haiku_cowork_review_submit` resolves with `{decision, feedback, annotations}` per contract at `orchestrator.ts:2827-2833`.

## Genuine-iframe assertion

Fallback detection is the highest-risk failure mode. The plan MUST fail if either of the following is missing:

- Tool result envelope on the `gate_review` action carries `_meta.ui.resourceUri` (unit-03 helper).
- Iframe console emits the `host-bridge.ts#isMcpAppsHost()` log line reporting `window.parent !== window` **and** successful `new App({...})` construction (unit-04 §Detection probe). This is NOT PR #213's `useReviewSession` heartbeat — that module is not bundled; the load-bearing logger is the new bridge module.

## Regression scope (local Claude Code)

Same fixture description, `CLAUDE_CODE_IS_COWORK` unset, same binary. Assert bit-identical final state on `intent.md` frontmatter and `state.json` `phase`/`gate_outcome`, and identical session-log event names. **Expected divergences** (not failures):

- Local hits `startHttpServer()` at `server.ts:835` and `openBrowser()` at `server.ts:846-859`; Cowork skips both.
- Local tool result lacks `_meta.ui.*`; Cowork carries it.
- `host-bridge.ts` log line reports `isMcpAppsHost() == false` locally.

## Completion Criteria (all runnable)

- File exists: `test -f .haiku/intents/cowork-mcp-apps-integration/knowledge/COWORK-E2E-PLAN.md`.
- Plan references the research artifact: `grep -q 'unit-08-cowork-e2e-validation-research.md' knowledge/COWORK-E2E-PLAN.md`.
- Fixture intent created: `test -f .haiku/intents/cowork-e2e-smoke-*/intent.md`.
- Frontmatter transition: `grep -E '^intent_reviewed:\s*true' .haiku/intents/cowork-e2e-smoke-*/intent.md`.
- State transition: `jq -e '.phase == "execute"' .haiku/intents/cowork-e2e-smoke-*/stages/inception/state.json`.
- Session log events: `grep -c 'gate_review_opened' <stFile>` >= 1 **and** `grep -c '"decision":"approved"' <stFile>` >= 1.
- MCP Apps envelope: `grep -q '_meta.ui.resourceUri' <captured-tool-result-json>`.
- Host-bridge mode log: `grep -q 'isMcpAppsHost.*true' <iframe-console-log>`.
- Screenshot count: `ls evidence/screenshots/*.png | wc -l` >= 3 (iframe render, decision submit, next FSM tick).
- Regression diff: state-file diff between Cowork and local runs is empty except for the divergent transport lines above — captured in the PR description.
