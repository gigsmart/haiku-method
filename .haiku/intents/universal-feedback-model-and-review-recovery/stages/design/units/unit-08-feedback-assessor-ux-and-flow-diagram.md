---
title: Feedback-assessor UX and review-phase flow diagram
type: design
closes:
  - FB-07
depends_on: []
inputs:
  - >-
    .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/feedback/07-feedback-gate-enforcement-and-assessor-agent.md
  - >-
    .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/review-flow-with-feedback-assessor.html
  - >-
    .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/review-ui-mockup.html
outputs:
  - stages/design/artifacts/review-flow-with-feedback-assessor.html
  - stages/design/artifacts/assessor-summary-card.html
  - stages/design/artifacts/rollback-reason-banner.html
status: completed
bolt: 1
hat: design-reviewer
started_at: '2026-04-17T16:51:25Z'
hat_started_at: '2026-04-17T16:59:41Z'
completed_at: '2026-04-17T22:13:26Z'
---

# Feedback-assessor UX and review-phase flow diagram

## Goal

Two deliverables that together give the development stage a buildable spec for the feedback-assessor review-agent and its surrounding flow:

1. **The canonical flow diagram** (`review-flow-with-feedback-assessor.html`) showing `execute → quality-gates → review-agents (including the auto-injected feedback-assessor) → feedback frontmatter check → user gate`, with the rollback edge back to `elaborate` (visits++) when any check fails.
2. **The user-facing surfaces** the assessor produces: how its summary renders, how rollback reasons surface to the reviewer, and how "blocked on pending feedback" is communicated before the user gate ever opens.

The existing artifact at `artifacts/review-flow-with-feedback-assessor.html` is a strong draft. This unit ships it as the canonical diagram (iterating only if review uncovers missing nodes or edges) and adds the two UI surfaces.

## Quality Gates

- Flow diagram artifact exists and covers:
  - Every phase node: `execute`, `quality gates`, `review`, `feedback frontmatter check`, `user gate`, `elaborate` (rollback target).
  - The auto-injected `feedback-assessor` distinguished visually from declared review agents (accessibility, consistency, etc.).
  - Rollback edges from `feedback frontmatter check` → `elaborate` for each failure condition (assessor error, still-pending items, write failure), each labeled with the trigger condition.
  - `visits++` annotation on the rollback edge.
- Assessor summary card specified: total feedback count, still-pending count, items updated this pass, per-item outcome bullets. Rendered light + dark, specced for the review UI's surface (sidebar footer or dedicated banner — decide one).
- Rollback reason UX specified: when the FSM rolls back to elaborate, the reviewer sees a banner (or modal) with copy explaining what triggered the rollback (cite assessor output), which feedback items remain `pending`, and what happens next (new additive-elaborate cycle). Copy templates for each trigger condition.
- Blocked-pending-feedback messaging specified: if the reviewer opens the review UI before the gate is reachable (feedback still pending), the user-gate area shows a clear non-interactive state with the list of blockers and the instruction to address them first.
- Architecture-prototype-sync obligations explicitly listed for the development stage: which nodes to add to `website/public/prototype-stage-flow.html`, which `payloadFor(...)` entries to add, and the `node website/_build-prototype-content.mjs` rerun. This unit is the source of truth; unit-09 coordinates the broader diagram update.
- Explicit non-goal: this unit does NOT spec the orchestrator code that spawns the assessor subagent, does NOT spec the structural frontmatter check in TypeScript, and does NOT define the FSM's rollback transition. Those belong to product + development stages.
