---
title: >-
  Stage-progress-strip nodes are 20-22px hit areas — fail 44x44 touch-target
  floor on mobile
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-20T20:19:36Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-07:bolt-1'
bolt: 1
upstream_stage: null
---

**WCAG 2.5.5 Target Size (AAA) / 2.5.8 Target Size Minimum (AA, WCAG 2.2)**

DESIGN-BRIEF §4 "Touch-target rule (hard floor, FB-64)" (lines 688-692) is unambiguous:

> On viewports ≤ 768 px, every button, link, icon, and input **MUST** have a ≥ 44×44 CSS-px effective hit area. The WCAG 2.5.8 inline-text exception applies **ONLY** to text links inside flowing prose... It does NOT apply to ... navigation / stage-progress nodes, or any discrete action target.

`stage-progress-strip.html` renders every stage node as a `w-5 h-5` circle (20×20 px) or `w-[22px] h-[22px]` diamond (line 123). The interactive stage-node `<div>` carries `tabindex="0" role="link"` and `aria-current="step"` — these are discrete activatable navigation targets, not inline prose links. No `.touch-target` wrapper, no `::before` hit-zone extension, no min-height/min-width utilities.

Affected rows (every variant of the strip):
- Desktop variant: lines 91, 105, 123, 137, 151 (all nodes, including the current diamond at 22×22)
- Revisit variant: lines 190, 200, 215 (multi-visit nodes), onward
- Mobile variant at ~line 320-352: `w-5 h-5` circles repeat verbatim with no hit-zone extension

Even the text label below the circle is only `text-xs mt-2` — adding ~16px of vertical stack doesn't create a continuous 44px target because the click handler lives on the circle div, not the whole flex column. The label is just captioning.

**Remediation options (canonical per touch-target spec that's referenced but MISSING from artifacts — see separate finding):**
1. Wrap each stage node in a `min-h-[44px] min-w-[44px]` flex container that owns the click/keydown handler, keeping the 20px circle as a visual-only child.
2. Or extend each circle with a transparent `::before` pseudo-element that enlarges the hit zone to 44×44 centered on the circle.

Bonus a11y concern — line 144 `text-stone-500 dark:text-stone-500` on `bg-white dark:bg-stone-900` for the "Operations" / "Security" upcoming labels sits at ~4.5:1 light and ~4.5:1 dark (borderline); but on the circle token itself at lines 141/155, `text-stone-500 dark:text-stone-500` on `bg-stone-200 dark:bg-stone-700` is ~3.0:1 light and ~1.75:1 dark — fails AA for text. The circle's `○` glyph is aria-hidden, but per WCAG 1.4.11 Non-Text Contrast the graphical indicator for the "upcoming" state still needs ≥ 3:1 against the card bg; stone-200 on stone-900 card = ~11:1 (OK), but the circle's border `border-stone-600` on `bg-stone-700` in dark mode = ~1.8:1 — upcoming-state indicator fails 1.4.11.
