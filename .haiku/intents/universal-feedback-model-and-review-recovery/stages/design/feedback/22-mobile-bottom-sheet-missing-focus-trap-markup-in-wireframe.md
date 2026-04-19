---
title: Mobile bottom sheet missing focus trap markup in wireframe
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:31:03Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
closed_by: unit-13-aria-and-semantic-structure
---

The DESIGN-BRIEF.md §6 correctly specifies that the mobile feedback sheet should trap focus, return focus to the FAB on close, and move focus to the segmented control on open. The mobile wireframe `artifacts/feedback-inline-mobile.html:116-259` implements none of this in the DOM structure:

- No `role="dialog"` on the sheet container (only on the segmented control's tablist children)
- No `aria-modal="true"`
- No `aria-labelledby` pointing at the "Feedback" header
- No visible documentation of the focus-trap implementation (e.g. a comment naming the library or the inert-attribute strategy)
- The close button (`:122-127`) uses inline `onclick` to hide the sheet but does nothing to restore focus to the FAB

Compare to `artifacts/annotation-popover-states.html:151` which correctly uses `role="dialog" aria-modal="true" aria-labelledby="p1-label"`. The mobile sheet is substantially larger and more disruptive than an annotation popover — if the popover needs these attributes, the sheet definitely does.

**Fix:**
- Add `role="dialog" aria-modal="true" aria-labelledby="sheet-title"` to the sheet container.
- Add `id="sheet-title"` to the "Feedback" h2 on line 120.
- Document the focus-trap strategy in the wireframe comments or in DESIGN-BRIEF §6 — name the specific library (e.g. `focus-trap-react`) or the inert-attribute approach so the development stage doesn't have to invent it.
- Add a comment or wireframe note showing where focus moves on open/close.
- Add `aria-hidden="true"` + `inert` on the main page content while the sheet is open.
