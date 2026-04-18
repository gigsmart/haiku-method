---
title: >-
  Interactive state coverage incomplete — focus state missing from some
  artifacts, disabled state under-specified
status: closed
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-17T22:31:21Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
closed_by: unit-15-state-coverage-and-motion
---

The mandate requires "interactive elements have consistent state coverage (default, hover, focus, active, disabled, error)."

Coverage audit across artifacts:
- `feedback-card-states.html` — covers default, hover, focus, active, disabled (good). But the "error" state is shown only implicitly via toast copy (§6) — not rendered as a card visual state.
- `annotation-popover-states.html` — states 1-6 cover open/empty, open/filled, iframe two-step, error, small-viewport, dark-parity. Good coverage but missing explicit "disabled popover" (e.g., disabled Create while empty is shown inline in State 1 but never in its own state panel). Unit-04-design-review §5 flagged this (empty-body Create button behavior vs server invariant).
- `revisit-modal-states.html` — coverage exists but no dedicated "error/failure on confirm" state. What happens when `haiku_revisit` fails mid-commit? The feedback-card-states artifact handles error via toast + revert — the modal needs the same treatment.
- `revisit-unit-list.html` — focus ring explicitly documented for "expandable" units but not for the "locked/completed" units that should be keyboard-reachable for inspection only.
- `stage-progress-strip.html` — disabled state ("future stages, not yet visited") mentioned in unit-01 QA but the mockup doesn't clearly distinguish `tabindex="-1"` vs focusable-but-no-action; a dev will not know whether to render them in the tab order.
- `feedback-inline-mobile.html` and `feedback-inline-desktop.html` — FAB hover/focus/active/disabled states not documented individually. The FAB exists as a single rendering.
- `comment-to-feedback-flow.html` — flow/state diagram, no interactive states to cover (N/A, but many artifacts' interactive elements embedded inside are not individually state-mapped).

The mandate check ("consistent state coverage") fails for at least: revisit modal (missing error/failure), stage-progress-strip (ambiguous disabled), FAB (no state breakdown), popover (disabled variant), and revisit-unit-list (focus on locked items).

Fix: add an explicit "state coverage" grid per artifact, the way `feedback-card-states.html §1 Footer Button Inventory` models. Each interactive surface should enumerate default/hover/focus/active/disabled/error explicitly.
