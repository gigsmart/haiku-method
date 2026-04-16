---
title: Comment to feedback flow design
type: design
depends_on:
  - unit-01-feedback-panel-wireframes
quality_gates: []
inputs:
  - knowledge/DISCOVERY.md
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
status: active
bolt: 1
hat: design-reviewer
started_at: '2026-04-16T13:01:51Z'
hat_started_at: '2026-04-16T13:08:13Z'
outputs:
  - stages/design/artifacts/review-package-structure.html
---

# Comment to Feedback Flow Design

Design the interaction flow showing how existing InlineComments and AnnotationCanvas comments transition to feedback files. Covers the CRUD lifecycle: create (on text selection or pin drop), update (edit comment text), delete (remove before submission), and the status transition from draft → pending on "Request Changes" submission.

## Completion Criteria

- Flow diagram at `stages/design/artifacts/comment-to-feedback-flow.html` showing the user journey from comment creation through feedback file persistence
- **Text selection → inline annotation:** text selection → comment popover → debounced POST to CRUD endpoint → feedback file created with `status: pending`, `origin: user-visual`, `source_ref: {file}#{paragraph}` → annotation card appears inline adjacent to the selected text
- **Visual/design annotation:** AnnotationCanvas pin drop → comment text → same CRUD flow → feedback file with `source_ref` carrying image path + x,y coordinates → annotation card overlays the image at the pin position
- **Edit flow:** click existing annotation card → edit in place → PATCH → feedback file updated → card re-renders
- **Delete flow:** click delete on own annotation → confirm → DELETE → file removed → card disappears
- Status badge updates in real-time (optimistic UI with rollback on error)
- Error states designed: network failure on CRUD, concurrent edit conflict, session expiry
- Shows how pre-existing feedback (from adversarial review, external PR, prior visits) renders as read-only annotation cards alongside user-created ones
- Responsive behavior at all three breakpoints — desktop inline cards, mobile bottom-sheet list
