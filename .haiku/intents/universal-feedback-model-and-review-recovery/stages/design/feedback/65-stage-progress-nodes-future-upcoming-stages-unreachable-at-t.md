---
title: >-
  Stage progress nodes: future/upcoming stages unreachable at tabindex=-1 with
  no alternative path — keyboard a11y gap
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:56:34Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG 2.1.1 Keyboard (A):** all interactive functionality operable via keyboard. `state-coverage-grid.md §Stage progress strip` rows document that "Future, never visited" stages are `tabindex="-1"`, with `aria-disabled="true"` and not in Tab order. Paired with the focus-order-spec Tab order walking `inception → design → product → development`, the user on the `design` stage cannot Tab to `product` or `development` to read their tooltip ("Upcoming").

That's functionally fine (you can't revisit what you haven't visited), **except** the hover-only tooltip violates WCAG 1.4.13 Content on Hover (AA). From `focus-order-spec.md` and `state-coverage-grid.md`:
- Future stages have `aria-disabled="true"` and `tabindex="-1"`.
- They still render a tooltip on hover.
- Keyboard users can't hover. Screen reader users can't focus.

This means the tooltip content ("Upcoming") is inaccessible to keyboard+AT users. If it were purely decorative that'd be OK, but `state-coverage-grid.md:92` explicitly lists it as a meaningful state label.

**Secondary:** On pressing Tab with a screen reader running in browse mode, the "Skip to main content" (`.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-desktop.html:86`) renders focus but the second skip link "Skip to feedback list" is positioned at `focus:left-44` (column 176px) — overlaps the first one on narrow screens and both are positioned absolute without a z-order guarantee against the header (z-40). In small viewports the header's backdrop-blur can occlude both.

**Fix:**
1. Make future-stage tooltip content keyboard-accessible: keep `tabindex="-1"` but ensure the tooltip is in an `aria-describedby` or reachable via a surrogate (e.g. display the "Upcoming" label as visible-text-rendered next to the node, not only in hover-tooltip). Alternatively, make the nodes `tabindex="0"` with `aria-disabled="true"` (per ARIA spec this is allowed — the element is focusable for inspection but not activatable).
2. Move the second skip link to `focus:top-12` (stack them vertically) and give both `focus:z-[210]` to guarantee they render above the sticky header's backdrop.
