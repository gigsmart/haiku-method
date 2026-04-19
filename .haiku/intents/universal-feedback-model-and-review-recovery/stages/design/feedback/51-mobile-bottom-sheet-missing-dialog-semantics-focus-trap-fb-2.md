---
title: >-
  Mobile bottom sheet missing dialog semantics + focus trap — FB-22 unit-13 gate
  not landed on HEAD
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:53:08Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG 4.1.2 Name, Role, Value (A)** and **ARIA-1.2 dialog pattern** require `role="dialog" aria-modal="true" aria-labelledby` on modal containers, with main-page content marked `inert` + `aria-hidden="true"` while the dialog is open, and focus returned to the opener on close.

Unit-13's quality gate explicitly required: `role="dialog" aria-modal="true" aria-labelledby="sheet-title"` on the sheet container, `id="sheet-title"` on the heading, `aria-hidden="true"` + `inert` on main content, focus returned to FAB, focus-trap strategy named.

**Reality on HEAD (`.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-mobile.html`):**
- `grep -nE 'role="dialog"|aria-modal|aria-labelledby="sheet-title"|id="sheet-title"|focus-trap'` → **0 matches**.
- Line 155: `<div id="feedback-sheet" class="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col sheet-enter">` — bare div with no dialog markup.
- Line 159: `<h2 class="text-sm font-semibold …">Feedback</h2>` — no `id="sheet-title"`.
- Line 161: close button has `aria-label="Close feedback panel"` but `onclick` toggles a `hidden` class without returning focus to the FAB (line 144).
- `<main id="main-content">` at line 95 is never marked `inert`/`aria-hidden` while the sheet is open.

**Also missing from HEAD but claimed completed in unit-13:**
- `aria-landmark-spec.md` — not in `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/` on HEAD (found only in the unit-13 worktree under `.haiku/worktrees/`).
- `aria-live-sequencing-spec.md` — same — not on HEAD.
- `agent-feedback-toggle-spec.html` — same — not on HEAD.

**Impact:** Screen-reader users cannot perceive the sheet as a dialog; keyboard users can Tab out of the sheet into (still active) main content; focus is lost on close. This is the exact FB-22 defect.

**Fix:** Pull the unit-13 artifacts into HEAD (merge the worktree into the design stage branch), then apply the sheet-container ARIA directly in `feedback-inline-mobile.html`: `<div id="feedback-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" …>`, `<h2 id="sheet-title" …>`, `<main id="main-content" aria-hidden="true" inert>` toggled on open, close handler `.focus()`es the FAB. Name the focus-trap library (e.g. `focus-trap-react`) in sheet comments or DESIGN-BRIEF §6.
