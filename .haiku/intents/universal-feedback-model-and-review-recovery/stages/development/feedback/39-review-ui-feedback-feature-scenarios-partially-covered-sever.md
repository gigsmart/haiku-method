---
title: >-
  review-ui-feedback.feature scenarios partially covered — several behaviors
  have no unit-level criteria
status: fixing
origin: adversarial-review
author: completeness (from product)
author_type: agent
created_at: '2026-04-21T20:23:40Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

## Gap

`features/review-ui-feedback.feature` has 25 scenarios. The development stage's UI units cover annotation persistence (unit-13), component rendering (unit-08), feedback sheet dialog (unit-10), footer verbs (unit-07), and revisit modal (unit-11). But several product-declared scenarios are not exercised by any unit-level completion criterion:

### Not covered

1. **"Approve with pending feedback shows confirmation dialog"** (`review-ui-feedback.feature:130`). No unit in `units/unit-*.md` specifies a confirmation dialog when the reviewer clicks approve while pending feedback exists. `grep -i 'approve.*pending\|pending.*confirmation\|confirmation.*dialog' stages/development/units/` returns zero hits. Unit-07 only wires footer buttons to the review-decide route; nothing mediates the approve action against pending-count.

2. **"Reviewer rejects agent-authored feedback via the review UI"** (`:150`) and **"Reviewer closes human-authored feedback via the review UI"** (`:157`). Unit-08 specifies FeedbackItem as a row with expand/collapse + status badge but does not specify reject/close/dismiss action buttons or the PUT/DELETE/reject endpoints they call. No FeedbackItem completion criterion covers the "action menu" lifecycle surface.

3. **"Feedback panel shows status transitions in real time"** (`:119`). No unit specifies how status changes propagate to rendered FeedbackItem instances; no WebSocket message is wired to feedback-status deltas anywhere in units 01-15.

4. **"Feedback items sorted by status then by created_at within groups"** (`:167`). Unit-08 does not specify the sort order; it only describes "list with visit-grouped headers". No completion criterion asserts sort behavior.

5. **"Reviewer closes browser tab before submitting — comments are lost"** (`:223`). This is explicitly the *expected v1 behavior* per intent scope (out of scope: debounced draft persistence for review-UI comments beyond annotations). But no unit explicitly asserts comments are ephemeral until Request Changes fires. Acceptable as an intentional non-feature, but should at least be named in a test-gate or out-of-scope note in the unit-08 or unit-07 spec.

### Covered (for contrast)

- Single inline comment → feedback file (`:15`): implied by unit-05 orchestrator-integration artifact note.
- Pin annotation → feedback file (`:37`): covered by unit-13.
- Feedback write precedes decide (`:47`): implied by unit-05 artifact note.
- CRUD HTTP endpoints (`:66-107`): specified in unit-02 completion criteria.

## Why this is a completeness finding

The mandate: "every user-facing flow has defined happy path, error states, and edge cases". Five product-declared user-visible flows have no unit-level pass/fail criteria. Implementation may in fact be correct, but the stage artifacts cannot demonstrate it — a test author consuming the unit specs would not write the confirmation-dialog test, the reject-menu test, or the sort-order test.

## Required remedy

Add completion criteria (with specific RTL assertions, endpoint expectations, and/or audit-banned-patterns coverage) to unit-07 (footer approve-with-pending), unit-08 (FeedbackItem action menu + sort), and a new or extended unit for feedback-status WebSocket realtime. Each should cite the specific product-stage scenario it closes via `closes: [FB-NN]` once this feedback is filed.
