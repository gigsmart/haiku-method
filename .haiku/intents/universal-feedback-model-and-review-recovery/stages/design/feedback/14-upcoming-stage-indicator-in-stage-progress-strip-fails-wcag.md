---
title: >-
  Upcoming-stage indicator in stage-progress-strip fails WCAG 1.4.11 Non-Text
  Contrast in dark mode
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-20T20:20:47Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-14:bolt-1'
bolt: 1
upstream_stage: null
---

**WCAG 1.4.11 Non-Text Contrast (AA) · 1.4.3 Contrast (Minimum)**

The "upcoming / never-visited" stage circle in `stage-progress-strip.html` renders as:

```
<div class="... bg-stone-200 dark:bg-stone-700 text-stone-500 dark:text-stone-500 border border-stone-300 dark:border-stone-600">
  <span class="text-xs">○</span>
</div>
```

(Lines 141, 155, 243, 246, 293, 303 — desktop + revisit + mobile variants.)

**Contrast measurements against the card surface (`bg-white dark:bg-stone-900`):**

| Role | Light | Dark |
|---|---|---|
| Circle fill (bg-stone-200 / dark:bg-stone-700) vs card (white / stone-900) | ~1.12:1 | ~3.4:1 |
| Circle border (border-stone-300 / dark:border-stone-600) vs card | ~1.27:1 | ~2.22:1 ✗ |
| Label text (text-stone-500 / dark:text-stone-500) vs card | ~4.6:1 (borderline AA) | ~4.52:1 (borderline AA) |

The circle IS the graphical UI component that conveys "upcoming" state. WCAG 1.4.11 requires the boundary of such components to meet ≥ 3:1 against adjacent colors. In dark mode:
- The border (stone-600 on stone-900 card) is ~2.2:1 — FAIL.
- The fill (stone-700 on stone-900) is ~3.4:1 — passes, but relying on fill alone when border is the intended boundary is a spec ambiguity.

In light mode the circle fill (stone-200 on white) = ~1.12:1 — the component is essentially invisible; users with low vision see only the "Operations" / "Security" text label floating below what appears to be empty space. The label text-stone-500 on white = ~4.6:1, right at the WCAG 1.4.3 AA floor — any browser anti-aliasing that reduces effective contrast pushes it below.

Third problem (nested): when the circle contains a `○` character (line 142, 156, …) — that glyph is `text-stone-500 dark:text-stone-500` on `bg-stone-200 dark:bg-stone-700`. That's stone-500 on stone-200 = ~3.0:1 (fails AA for text) and stone-500 on stone-700 = ~1.75:1 (fails 1.4.11 as an icon). The ○ is `aria-hidden="true"` so the text-contrast 4.5:1 rule doesn't strictly apply, BUT the ○ is the visual signal that distinguishes "upcoming" from "in-progress" (diamond) and "completed" (checkmark). If the reviewer can't see the glyph, they can't tell apart the three states by color alone — which is what DESIGN-BRIEF §6 "information is not conveyed by color alone" is intended to prevent.

**Remediation:**
1. Bump the upcoming-circle border to `border-stone-400 dark:border-stone-500` (≥ 3:1 in both modes).
2. Bump the `○` glyph color to `text-stone-600 dark:text-stone-300` so the state glyph is visible at AA.
3. Bump the label text to `text-stone-600 dark:text-stone-300` (same rationale as the brief's "banned pair" remediation for metadata text — brief §2 line 136).
