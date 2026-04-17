---
title: Feedback lifecycle ownership and unified comments surface
type: design
closes: [FB-02]
depends_on: []
inputs:
  - .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/feedback/02-feedback-lifecycle-agent-vs-human-ownership-split.md
  - .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/review-ui-mockup.html
outputs:
  - stages/design/artifacts/feedback-lifecycle-transitions.html
  - stages/design/artifacts/feedback-card-states.html
  - stages/design/artifacts/comments-list-with-agent-toggle.html
---

# Feedback lifecycle ownership and unified comments surface

## Goal

Codify the agent-owned vs human-owned status transitions for feedback items, specify the footer-button contract per card state, and restructure the sidebar away from the "mine vs others" segmented control the earlier mockup implied. The system has no concept of user identity and that is intentional — the primary list is simply **Comments** (every user-origin item, unified), with an **agent-feedback toggle** that overlays agent-origin items inline.

## Quality Gates

- Lifecycle transition matrix spec'd and visualized:
  - Agent-owned: `pending → addressed` when a fix lands, `pending → closed` when quality-gate verification passes structurally (not UI).
  - Human-owned: `pending → rejected` (dismiss), `addressed → closed` (verify), any terminal → `pending` (reopen).
  - Matrix makes explicit which transitions are NEVER user-initiable from the UI.
- Per-status footer button inventory documented with wireframes for each state combination:
  - `pending` → [Reject]
  - `addressed` → [Verify & Close], [Re-open]
  - `rejected` / `closed` → [Re-open]
  - Each button has light + dark mocks, hover / focus / active / disabled states.
- Sidebar layout restructured: one unified **Comments** list (user-origin items: `user-chat`, `user-visual`, `external-pr`, `external-mr`). An **agent-feedback toggle** (default off) reveals agent-origin items (`adversarial-review`, `agent`) inline with a visible origin badge so the reviewer can tell them apart without hiding. No "Mine / Feedback" segmented control.
- Optimistic UI pattern specified: status change updates card immediately; if the tool call fails (author-type guard rejects the transition), the card reverts and a toast shows the reason. Toast copy templated for every guard outcome.
- Origin-badge visual inventory: colors / labels for `adversarial-review`, `external-pr`, `external-mr`, `user-visual`, `user-chat`, `agent`. WCAG AA contrast verified on each badge in light + dark.
- Clear spec note delegating the actual tool-layer author-type guard enforcement to product/development — this unit specifies the *UX contract*, not the enforcement mechanism.

## Completion Signal

Every feedback card's footer renders deterministically from `(status, origin)`. The reviewer never sees a button they cannot successfully press. Agent feedback is never hidden — it's toggled.
