---
title: >-
  DESIGN-BRIEF §7 CSS contradicts §2 status rules — sets banned opacity-70/50 on
  closed/rejected cards
status: closed
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-20T20:17:37Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-01:bolt-1'
bolt: 1
upstream_stage: null
---

## Problem

DESIGN-BRIEF §2 (lines 139–140) explicitly lists `opacity-70` on closed card roots and `opacity-50` on rejected card roots as BANNED text-on-surface pairs, and the `FeedbackItem` spec (lines 275–276) hard-rules: **"Do NOT apply `opacity-70`"** / **"Do NOT apply `opacity-50`"**, with remediation calling for `bg-green-50/60` + glyph + text prefix (closed) and `bg-stone-100` + × + text prefix + full-opacity strikethrough (rejected).

But DESIGN-BRIEF §7 "CSS Additions" (lines 831–844) does exactly what §2 forbids:

```css
.feedback-item-closed {
  border-left: 2px solid #4ade80; /* green-400 */
  opacity: 0.7;               /* <-- BANNED by §2 line 139 / line 275 */
}
.feedback-item-rejected {
  opacity: 0.5;               /* <-- BANNED by §2 line 140 / line 276 */
}
```

DESIGN-TOKENS.md §1.7 (line 170) reinforces: *"`disabled:opacity-50` and any `opacity-50`/`opacity-60`/`opacity-70` on a button, card, or wrapper root is banned repo-wide"*.

## Impact

Implementers will copy §7's CSS verbatim (it's the only concrete CSS block in the brief) and ship the banned-pair rendering that §2/unit-11/unit-18 were written to eliminate. WCAG 1.4.3 violation carries straight through to production.

Also, the left-border width `2px` in §7 contradicts DESIGN-TOKENS §2.3 (line 364, 375–378) which sets the canonical border-left width at `3px` — another internal divergence in the same block.

## Fix

Rewrite §7 to match §2's remediation:
- Remove `opacity: 0.7` and `opacity: 0.5` entirely.
- Drop `.feedback-item-rejected .feedback-title { text-decoration: line-through }` duplication or ensure it runs at full opacity.
- Either delete the CSS block in favor of Tailwind utilities (`bg-green-50/60`, `bg-stone-100`, `border-l-[3px] border-l-green-500`, etc.) or rewrite the CSS to set backgrounds + 3px left borders + glyph::before pseudo-elements, not opacity.

## Files
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/DESIGN-BRIEF.md:831-844` (offending CSS)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/DESIGN-BRIEF.md:139-140, 275-276` (the rules being violated)
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md:170` (repo-wide ban)
