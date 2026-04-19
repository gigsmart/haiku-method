---
title: >-
  Metadata contrast fails WCAG 1.4.3 AA: text-gray-400 / text-stone-400 on white
  used as default across all artifacts
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:51:52Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG 1.4.3 Contrast (Minimum, AA):** body text must be ≥ 4.5:1 against its background. `text-gray-400` (#9ca3af) on white = 2.85:1 — FAIL. `text-stone-400` (#a8a29e) on white = 2.78:1 — FAIL. Unit-11's fix gate required raising metadata to `text-stone-500 dark:text-stone-400` minimum and documenting `stone-400`/`gray-400` as banned on white/stone-50.

**Reality on HEAD artifacts:** 900 total occurrences of `text-gray-400` or `text-stone-400` across 21 files. Many sit directly on white/stone-50 card surfaces as the metadata line.

**Concrete examples:**
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-desktop.html:143` — `<p class="text-[10px] text-gray-400 dark:text-gray-500 …">FB-01 · Visit 1 · adversarial-review</p>` on white card (double failure: tiny + low contrast)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-desktop.html:167,216,246,256,272` — identical pattern (status, origin, visit info)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-mobile.html:217,230,246,270,283` — mobile cards
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-card-states.html:87,127` — `text-[10px] text-gray-400 italic` "agent marks addressed when fix lands" (only non-decorative hint for reviewer; now invisible)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/annotation-popover-states.html:195` — `text-[10px] text-stone-400 dark:text-stone-500` "Esc to cancel"
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/comments-list-with-agent-toggle.html:79` — toggle helper text `text-[10px] text-gray-400`

**Dark-mode pair is also inverted** on several: `text-gray-400 dark:text-gray-500` makes dark mode *darker* — stone-500 (#71717a) on stone-900 (#1c1917) ≈ 3.4:1, and stone-500 on gray-950 is worse. Unit-11 bolt-2 already caught this for stone-600 but `dark:text-gray-500` and `dark:text-stone-500` patterns are still pervasive on dark card surfaces.

**Fix:** Sweep per unit-11's own bolt-2 reject reason: on light, use `text-stone-500` minimum (4.8:1 on white); on dark, use `text-stone-300` (12.6:1 on stone-900) or `text-gray-400` on pure gray. Never `dark:text-gray-500` or `dark:text-stone-500` on a stone-900/gray-950 card.
