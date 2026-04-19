---
title: >-
  state-coverage-grid.md omits DESIGN-BRIEF §2 component names — components
  without grids
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:54:05Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

DESIGN-BRIEF §2 line 114 declares: "Every new component in this intent — and every new component introduced in downstream stages — **MUST** ship with a six-state grid (default / hover / focus / active / disabled / error) rendered alongside its component spec. Use `stages/design/artifacts/state-coverage-grid.md` as the template."

The template (`state-coverage-grid.md`) does NOT cover the named components in the brief:
- `FeedbackStatusBadge` — 0 grid rows
- `FeedbackOriginIcon` — 0 grid rows
- `FeedbackItem` — grid uses "Feedback card (compact)" / "Feedback card (expanded)" which are unofficial names; no component grid tied to `FeedbackItem`
- `FeedbackList` — 0 grid rows
- `FeedbackSummaryBar` — 0 grid rows
- `SidebarSegmentedControl` — 0 grid rows (but see FB-41: this should be deleted from the brief anyway)
- `MobileFeedbackSheet` — partially covered as "FAB + bottom sheet (mobile)" but not under the PascalCase component name
- `FeedbackFAB` — same — partial coverage under "FAB" nickname, not the spec's name

Consistency mandate violation (point 3 of my mandate): "component naming follows the existing pattern language." The grid and the component inventory disagree on what each element is called. A downstream reader cannot map grid rows to component specs.

Fix options:
1. Update state-coverage-grid.md row labels to PascalCase component names from DESIGN-BRIEF §2 / unit-14 component-inventory.md. E.g., "Feedback card (compact)" → `FeedbackItem` (compact variant).
2. Add missing rows for `FeedbackStatusBadge`, `FeedbackOriginIcon`, `FeedbackList` (container-level states: loading, empty, populated), `FeedbackSummaryBar`.

Preferred: do both — rename existing rows to PascalCase + add missing components. Also cross-reference unit-14's `component-inventory.md` once unit-14 naming-sweep actually lands in the brief (see FB-41).
