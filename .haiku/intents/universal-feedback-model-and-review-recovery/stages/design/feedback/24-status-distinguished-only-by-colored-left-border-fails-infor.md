---
title: >-
  Status distinguished only by colored left border — fails
  information-not-by-color-alone
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:31:16Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

The feedback card design relies on a 3px left border color to convey status (amber=pending, blue=addressed, green=closed, gray=rejected) — DESIGN-BRIEF.md §2 `FeedbackItem` interaction states, and every card artifact.

While each card also carries a status badge with a text label, the list grouping and the "at a glance" visual scan use the border color as the primary distinguishing cue. For users with protanopia, deuteranopia, or tritanopia (3-8% of male population):
- amber and green can be indistinguishable
- blue and gray can be indistinguishable on the left-border accent

The brief claims compliance via "visible text label ('pending', 'addressed', etc.) so it does not rely on color alone" (§2 FeedbackStatusBadge). BUT:
- When scanning a list of 20 cards, users read the visual patterns first (color, shape, position) and only read text on the focused card. Color-only differentiation of states at list-scan level fails the spirit of WCAG 1.4.1.
- In the compact state, the status badge is 11px — too small to read at a glance. The border color IS the state indicator in practice.

**Fix:**
- Add a shape or icon to the left-border area: a small icon glyph (checkmark for closed, X for rejected, clock for pending, arrow for addressed) rendered in the border region so shape + color together convey state.
- Alternatively, add a text prefix to the card title in the compact state ("[Pending] Missing null check...") so screen-scan users get a non-color cue.
- Verify the `rejected` state's strikethrough is visible in the compact state (currently it's only applied to the title text, which is truncated to one line — the strikethrough often clips mid-word).
