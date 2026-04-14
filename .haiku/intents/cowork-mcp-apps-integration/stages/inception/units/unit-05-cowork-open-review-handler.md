---
title: Cowork-mode _openReviewAndWait implementation
type: feature
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
status: active
bolt: 1
hat: elaborator
started_at: '2026-04-14T22:20:29Z'
hat_started_at: '2026-04-14T22:24:13Z'
outputs:
  - knowledge/unit-05-open-review-handler-research.md
---

# Cowork-mode _openReviewAndWait implementation

## Scope

Inside `packages/haiku/src/server.ts`, branch `_openReviewAndWait` on `isCoworkHost()`. The local branch is the existing implementation byte-for-byte. The Cowork branch skips `startHttpServer`, `openTunnel`, and `openBrowser`, and instead delivers the review via the `ui://` resource plus a decision callback tool. The same resolved-promise shape `{ decision, feedback, annotations? }` is returned to the orchestrator so `orchestrator.ts:2091` is unchanged.

The blocking-vs-resumable decision recorded by unit-02 drives the exact shape:

- If `blocking`: the tool call holding `_openReviewAndWait` stays open with a single `await` on the decision promise, exactly like today.
- If `resumable`: the tool returns a `pending_review` action to the orchestrator, the FSM persists a `cowork_review_session_id`, and a new tool `haiku_cowork_review_submit` (exposed to the iframe via `App.callServerTool`) resolves the session on the next FSM tick.

In scope:
- Environment-gated branch inside `_openReviewAndWait` (server.ts:589).
- Register `haiku_cowork_review_submit` tool so the SPA bridge can submit decisions. Tool validates session ID, decision shape, and resolves the pending promise (or the persisted FSM slot in `resumable` mode).
- Ensure the tool result from `_openReviewAndWait`'s **entry** tool call carries `_meta.ui.resourceUri` (via the helper from unit-03) so Cowork renders the iframe.
- Pass session ID and session data into the iframe via the bridge's `updateModelContext` push so the SPA can render without needing an `/api/session/:id` fetch.
- Unit tests: Cowork path approves, requests changes, external_review; verifies the orchestrator receives the identical `{decision, feedback, annotations?}` payload as the HTTP path.

Out of scope:
- `ask_user_visual_question` and `pick_design_direction` — unit-06.
- Changes to the HTTP path — must remain byte-identical.
- E2E encryption (irrelevant inside Cowork's MCP channel).

## Completion Criteria

- `_openReviewAndWait` branches on `isCoworkHost()`. The non-Cowork branch is behaviorally and byte-wise identical to the pre-intent implementation (diff-checkable) — verified by snapshot test and git diff review.
- With `CLAUDE_CODE_IS_COWORK=1` set, calling the entry tool from an integration test (with an in-process MCP Apps stub) returns a tool result containing `_meta.ui.resourceUri: "ui://haiku/review/<version>"` and does NOT invoke `startHttpServer`, `openTunnel`, or `openBrowser` — verified by spying on those functions.
- The stub SPA calling `haiku_cowork_review_submit` with a valid `{decision, feedback}` resolves `_openReviewAndWait` with the same object shape the HTTP path produces — verified by integration test asserting `.toEqual` against the HTTP snapshot.
- All three review decisions (`approved`, `changes_requested`, `external_review`) flow correctly through the Cowork path into `orchestrator.ts:2091` branching — verified by tests per decision.
- The blocking-vs-resumable choice from unit-02 is documented in the commit message and matches the implementation — verified by commit message lint or manual diff review.
- `packages/haiku/VALIDATION.md` documents both review transports — verified by file diff.
