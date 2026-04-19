---
title: >-
  Unit-11 gate FAIL: text-[10px] / text-[9px] metadata text rampant in
  load-bearing mockups (WCAG 1.4.4, 1.4.12)
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:51:32Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG:** 1.4.4 Resize Text (A), 1.4.12 Text Spacing (AA) — 10px/9px is below the effective readability floor, and the unit-11 fix gate explicitly required `grep -rEn 'text-\[(9|10)px\]' stages/design/artifacts/` to return 0. Reality: 1154 matches across 21 files, most on user-facing information text (metadata "FB-NN · Visit N · origin", status labels, filter counts, section labels).

**Sample violations (load-bearing — not documentation prose):**
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-desktop.html:143,167,216,256,272` — metadata lines `text-[10px] text-gray-400 dark:text-gray-500`
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-mobile.html:203,217,230,246,255,270,283` — identical metadata pattern
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-card-states.html:37,77,80,82,85,87,96,101,104,…` — 99 matches, including the canonical "per-status card" demos reviewers will implement verbatim
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/comments-list-with-agent-toggle.html:64,75,79,84,90,92,95,101,…` — 62 matches on user-facing card copy
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/annotation-popover-states.html:137,187,195,197,198,206,210,214,240,248` — popover metadata, button labels, location labels at 10px
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/revisit-modal-spec.html` — 95 matches

**Impact:** Low-vision reviewers cannot read feedback IDs, origin, or visit number. Mobile default min font-size of 12px is violated. The pattern `text-[10px] text-gray-400 dark:text-gray-500` is also a double failure — tiny AND low contrast (FB-10 territory) — and it's the *default* pattern copy-pasted into every artifact, so dev will implement this verbatim.

**Fix:** Sweep `text-[10px]` → `text-xs` (12px) everywhere. `text-[11px]` only when paired with `font-semibold`, per the unit-11 policy. Re-run the audit against reality; update `contrast-and-type-audit.md` to stop claiming "0 matches".
