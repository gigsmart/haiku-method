---
title: >-
  Disabled buttons: bg-stone-200/text-stone-500 at 2.9:1 + disabled:opacity-50
  on text — WCAG 1.4.11 fail
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:52:48Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG 2.2 SC 1.4.11 Non-Text Contrast (AA)** requires ≥ 3:1 for UI components; where disabled controls show text, text contrast still needs ≥ 4.5:1. Unit-11's gate required (1) removing `bg-green-600/50 text-white/80`-style composites, (2) no `disabled:opacity-50` on text-bearing buttons, (3) `aria-disabled="true"` on every disabled control.

**Violations still present on HEAD:**
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/annotation-popover-states.html:198` — `bg-stone-200 dark:bg-stone-700 text-stone-500 dark:text-stone-400` on disabled Create button. Stone-500 on stone-200 = 2.87:1 — FAIL body-text AA. No `aria-disabled="true"` accompanying the `disabled` attribute.
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/annotation-popover-states.html:306,450` — identical pair on two more disabled Create buttons.
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/annotation-popover-states.html:394` — `bg-teal-600 text-white opacity-50 cursor-not-allowed` (composed opacity on a text-bearing button; no `aria-disabled`).
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-desktop.html:487,490` — `disabled:opacity-50 disabled:cursor-not-allowed` composed onto `bg-green-600 text-white` / `bg-amber-600 text-white` Approve/Request-Changes buttons; no `aria-disabled`.
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-mobile.html:294,295` — same `disabled:opacity-50` pattern on mobile Approve/Request-Changes.
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/revisit-modal-states.html:18` — same pattern.
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-card-states.html:15` — `.state-disabled button { opacity: 0.5 }` CSS rule universally applied across the canonical card-states inventory, so every disabled button inherits the bad pattern.

**aria-disabled coverage:** Only 21 `aria-disabled` occurrences across the entire artifacts tree; dozens of `disabled` attributes lack the paired ARIA. AT treats these as interactive-but-broken.

**Fix:** Replace every `disabled:opacity-50` on text-bearing buttons with opaque token pairs that hit ≥ 4.5:1 text AND ≥ 3:1 container. Add `aria-disabled="true"` everywhere `disabled` appears. Replace the `.state-disabled button { opacity: 0.5 }` CSS rule in `feedback-card-states.html` with token-based muted styling.
