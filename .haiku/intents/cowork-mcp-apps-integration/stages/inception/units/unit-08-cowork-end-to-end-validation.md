---
title: 'End-to-end Cowork validation: /haiku:start through gate approval'
type: validation
depends_on:
  - unit-05-cowork-open-review-handler
  - unit-06-visual-question-design-direction
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - stages/inception/units/unit-05-cowork-open-review-handler.md
  - stages/inception/units/unit-06-visual-question-design-direction.md
status: active
bolt: 1
hat: researcher
started_at: '2026-04-14T22:58:14Z'
hat_started_at: '2026-04-14T22:58:14Z'
outputs: '["knowledge/unit-08-cowork-e2e-validation-research.md"]'
---

# End-to-end Cowork validation: /haiku:start through gate approval

## Scope

Verify the full user-facing flow inside Cowork: `/haiku:start` → inception elaboration → review gate → approve → advance. No mocks, no stubs — real Cowork environment, real MCP Apps host, real iframe, real user decision.

In scope:
- A written test plan listing the exact steps the validator performs inside Cowork.
- Execution of the plan against a live Cowork session with the built plugin binary.
- Capture evidence: screenshots of the inline iframe, console logs from the iframe showing host-bridge detection hitting the MCP Apps branch, and the orchestrator state transitions persisted to `.haiku/intents/`.
- A regression check against local Claude Code for the same flow to confirm no behavior drift.

Out of scope:
- Stress testing.
- Non-`/haiku:start` flows (`autopilot`, `pickup`, `revisit`) — separate followup.

## Completion Criteria

- Test plan document exists at `knowledge/COWORK-E2E-PLAN.md` with numbered steps and expected evidence per step — verified by file existence.
- Evidence captured: at least 3 screenshots showing (a) iframe rendered in the Cowork conversation, (b) review decision submitted, (c) FSM advanced to the next stage after approval — attached to the PR description.
- Orchestrator state after the flow shows `status: approved` on the reviewed gate — verified by reading `.haiku/intents/<test-intent>/stages/inception/state.json`.
- Local Claude Code regression run produces the same state transitions for the same inputs — verified by side-by-side state diff.
- Console logs from the iframe include a log line confirming the host-bridge detected MCP Apps mode — verified by log capture in the PR.
