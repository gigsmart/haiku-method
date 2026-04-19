---
title: >-
  focus:ring-1 still pervasive on inputs/textareas + no focus-visible:ring-2 on
  desktop mockup (FB-37 regression)
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:53:50Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG 2.4.7 Focus Visible (AA) / 2.4.11 Focus Not Obscured (AA, WCAG 2.2):** focus indicator must be clearly visible. A 1px ring is below the canonical spec unit-13 adopted (2px teal-500) and below the 3:1 non-text contrast floor in many cases. Unit-13 gate required `grep -rEn 'focus:ring-1' stages/design/artifacts/` to return 0 for interactive elements, and every `<input>`, `<textarea>`, `<button>`, `[tabindex="0"]`, `<a>` to carry `focus-visible:ring-2 focus-visible:ring-teal-500`.

**Reality on HEAD:** 16 `focus:ring-1`/`focus-visible:ring-1` matches across 6 files, and zero `focus-visible:ring-2` in the load-bearing desktop mockup.

**Concrete violations:**
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-mobile.html:290` — `<textarea … focus:ring-1 focus:ring-teal-500 …>` on the sheet-footer comment input (primary keyboard input on mobile).
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-desktop.html` — 0 matches for `focus-visible:ring-2`. The sidebar textarea and action buttons inherit browser defaults, which on Chrome's "focus-visible" is a thin 2px outline that cannot be guaranteed to meet 3:1 against the teal bg. No explicit ring = no contract for dev.
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/revisit-modal-spec.html:95` — `focus:ring-1` (where unit-13 explicitly called out Cancel must have `focus-visible:ring-2 focus-visible:ring-teal-500`).
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/stage-progress-strip.html:29` — stage nodes `focus:ring-1` on a 20×20 node. 1px ring on a 20px element is easy to miss.
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/revisit-modal-states.html:114`, `keyboard-shortcut-map.html:8`, `annotation-popover-states.html:35` — also still `focus:ring-1`.

**DESIGN-BRIEF itself enshrines the bad pattern:** `DESIGN-BRIEF.md §Component Patterns` lists Input/Textarea as `… focus:ring-1 focus:ring-teal-500`. This is the canonical spec line dev will copy into implementation, so unless it's changed here the dev stage will ship `focus:ring-1` everywhere.

**Fix:** Sweep `focus:ring-1` → `focus-visible:ring-2` across all artifacts. Update DESIGN-BRIEF.md Input/Textarea pattern to `focus-visible:ring-2 focus-visible:ring-teal-500`. Explicitly add focus styles to the feedback-inline-desktop sidebar controls and the revisit-modal Cancel button. Document the canonical rule in `focus-ring-spec.html`.
