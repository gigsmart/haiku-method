---
title: Footer-button copy not canonicalized in DESIGN-BRIEF despite unit-14 claim
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:51:34Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

unit-14 completion criteria line 122 claims `pending → "Dismiss"` and line 124 claims "DESIGN-BRIEF §2, §3, feedback-card-states.html §1, and unit-05 body text all use the canonical verbs + hyphenation".

**DESIGN-BRIEF.md** still uses `"Reject"` and `"Close"` for pending, not `"Dismiss"`:
- Line 221: `If status === "pending" and author_type === "agent": a "Reject" button (small, secondary style).`
- Line 222: `If status === "pending" and author_type === "human": a "Close" button (only visible in the review UI where the user has authority).`
- Line 479: `| pending | Click "Reject" | rejected |` (Feedback Status Transitions table)
- Line 580: `Expanded item action buttons (Close / Reject / Reopen)` (Focus Order)
- Line 593: `Action button (Close/Reject/Reopen)` (Keyboard Navigation table)

**feedback-card-states.html §1** uses `"Reject"` and `"Close"` / `"Verify & Close"` — needs verification against the canonical vocabulary `"Dismiss"`.

The unit-14 "Dismiss" canonicalization is documented in `footer-button-copy-spec.md` and `component-inventory.md` but never propagated into DESIGN-BRIEF. The brief is the source-of-truth input to dev stage; if it still says "Reject" and "Close", development will ship the old vocabulary.

Consistency mandate violation: "component naming follows the existing pattern language" — and the copy-language on action buttons is a subset of that naming. Two copy vocabularies in the stage's own outputs = unresolvable ambiguity for development.

Fix: sweep DESIGN-BRIEF.md lines 221-222, 479, 580, 593 to replace `Reject`/`Close` with `Dismiss` for the pending state, per footer-button-copy-spec.md.
