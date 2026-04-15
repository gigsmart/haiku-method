---
title: Extend MCP Apps path to ask_user_visual_question and pick_design_direction
type: feature
depends_on:
  - unit-05-cowork-open-review-handler
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - stages/inception/units/unit-04-spa-host-bridge.md
  - stages/inception/units/unit-05-cowork-open-review-handler.md
status: active
bolt: 1
hat: elaborator
started_at: '2026-04-15T04:41:26Z'
hat_started_at: '2026-04-15T04:43:11Z'
outputs:
  - knowledge/unit-06-visual-question-design-direction-research.md
completed_at: null
---

# Extend MCP Apps path to ask_user_visual_question and pick_design_direction

## Scope

Apply the same pattern established by unit-05 to the other two tools that currently depend on the local HTTP + browser surface: `ask_user_visual_question` (`server.ts:154`) and `pick_design_direction` (`server.ts:201`). Same `ui://` resource, same host bridge, same environment branch.

In scope:
- Branch both tools on `isCoworkHost()`. Local branch is the existing HTTP + browser flow, byte-identical.
- Cowork branch returns a tool result carrying `_meta.ui.resourceUri` pointing at the same `ui://haiku/review/{version}` resource (the SPA bridge already routes visual question / design direction screens by session type).
- Decision submission re-uses `haiku_cowork_review_submit` or introduces parallel `haiku_cowork_visual_question_submit` / `haiku_cowork_design_direction_submit` tools — the spec-owner picks one during design stage.
- Unit tests per tool: Cowork branch renders the iframe, submission resolves the awaiting promise, local branch unchanged.

Out of scope:
- Changes to the SPA component tree (`QuestionPage.tsx`, `DesignPicker.tsx`). The bridge was extended in unit-04 to support all three session types.
- Changes to the local HTTP path.

## Completion Criteria

- `ask_user_visual_question` in Cowork mode returns `_meta.ui.resourceUri` and does not call `openBrowser` or `startHttpServer` — verified by integration test with spies.
- `pick_design_direction` in Cowork mode returns `_meta.ui.resourceUri` and does not call `openBrowser` or `startHttpServer` — verified by integration test with spies.
- Both tools resolve with the same shapes they produce today on the local path (`{ answer }`, `{ selectedDirection }`) — verified by snapshot tests against the HTTP path.
- The local (non-Cowork) path for both tools is byte-identical to the pre-intent implementation — verified by diff check on the non-Cowork branch.
- End-to-end test in Cowork stub: one FSM run that hits a review gate, a visual question, and a design direction all in one intent flow — verified by a scripted integration test.
