---
title: >-
  Focus ring specified but not consistently applied across all interactive
  elements
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:32:44Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
closed_by: unit-13-aria-and-semantic-structure
---

The focus-ring-spec.html establishes a canonical 2px teal-500 outline at 2px offset (1px on feedback cards). The keyboard-shortcut-map says every interactive element must have this ring. In practice, several wireframes drop or downgrade it:

- `artifacts/feedback-inline-desktop.html:59` — theme toggle button uses `focus:ring-2 focus:ring-teal-500` (2px, no offset — matches outline spec)
- `artifacts/feedback-card-states.html:13` — CSS override applies `outline: 2px solid rgb(20 184 166); outline-offset: 2px` to ALL buttons — good
- `artifacts/annotation-popover-states.html:157, 212` — textarea uses `focus:ring-2 focus:ring-teal-500 focus:outline-none` — OK
- `artifacts/annotation-popover-states.html:247, 249` — iframe page/region inputs use `focus:ring-1 focus:ring-teal-500 focus:outline-none` — **downgraded to 1px ring, violates the 2px spec**
- `artifacts/feedback-inline-mobile.html:251` — textarea uses `focus:ring-1 focus:ring-teal-500` — **1px, not 2px**
- `artifacts/revisit-modal-spec.html:167` — Cancel button has no `focus:` classes declared at all — relies on browser default focus ring, which may be suppressed by Tailwind reset
- `artifacts/revisit-modal-spec.html:167` — Confirm button has `focus:ring-2 focus:ring-amber-500 focus:outline-none` — **uses amber-500 not teal-500, inconsistent with focus-ring-spec**

The focus-ring-spec explicitly says "teal-500 for all persistent focus" — but the revisit modal switches to amber for the primary button's focus. This isn't necessarily wrong (the button is amber, focus matches) but it diverges from the canonical spec. Pick one and document it.

**Fix:**
- Enforce 2px focus ring everywhere (no `focus:ring-1`).
- Either update focus-ring-spec.html to allow color-matched focus rings per button variant, OR update revisit-modal-spec.html to use teal-500 for the Confirm button focus.
- Add focus styles to the revisit modal Cancel button.
- Verify every `<input>`, `<textarea>`, `<button>`, `[tabindex="0"]`, and `<a>` in every artifact declares `focus-visible:ring-2 focus-visible:ring-teal-500`.
