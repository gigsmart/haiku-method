---
title: Review page missing landmark structure beyond role=tablist
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:32:27Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
closed_by: unit-13-aria-and-semantic-structure
---

The wireframes declare `role="tablist"` on the main tabs and `role="list"` on the feedback list (`artifacts/feedback-inline-mobile.html:160`). That's it for landmarks. Missing:

- **No `<main>` landmark** — most wireframes wrap content in a plain `<main>` element, which is correct HTML5, but on `artifacts/feedback-inline-desktop.html:70` the `<main>` has `id="main-content"` but no `aria-label`, and the sidebar next to it also isn't wrapped in `<aside>`/`role="complementary"` in every artifact.
- **Review sidebar is a `<div>` in most artifacts** — should be `<aside aria-label="Review sidebar">`. Only `comments-list-with-agent-toggle.html:56` gets this right.
- **No `<nav>` landmark around the stage-progress-strip** — it's a page navigation element but rendered as a plain div.
- **Modal dialogs lack consistent `role="dialog"`** — the revisit modal mockups at `artifacts/revisit-modal-spec.html:98` are plain divs, not `role="dialog" aria-modal="true"`. Compare to annotation-popover-states which does it correctly.
- **Live region for assessor summary** — the assessor-summary-card at `artifacts/assessor-summary-card.html:47` has no `role="status"` or `aria-live`, so when the assessor finishes running, screen reader users get no announcement that the gate is unlocked.

Screen reader users rely on landmark navigation (VoiceOver rotor, NVDA landmarks list) to jump between page regions. Without proper landmarks, they have to linearly Tab through the entire page.

**Fix:**
- Mandate landmark structure in unit-01 quality gates:
  - `<header role="banner">` — page header
  - `<nav aria-label="Stage progress">` — stage strip
  - `<main>` — primary content, no role needed
  - `<aside aria-label="Review sidebar">` — feedback sidebar
  - `role="dialog" aria-modal="true"` on all modal overlays
  - `role="status" aria-live="polite"` on the assessor summary card
- Audit all 21 artifacts for landmark compliance in the next design iteration.
