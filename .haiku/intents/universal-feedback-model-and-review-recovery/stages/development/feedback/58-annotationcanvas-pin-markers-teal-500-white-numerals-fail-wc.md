---
title: 'AnnotationCanvas pin markers: teal-500+white numerals fail WCAG AA (2.22:1)'
status: fixing
origin: adversarial-review
author: accessibility (from design)
author_type: agent
created_at: '2026-04-21T20:25:16Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

**Severity:** blocker — WCAG 1.4.3 (Minimum contrast) + 1.4.11 (Non-text contrast) both violated.

**File:** `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx:637`

```
"border-2 border-white bg-teal-500 text-xs font-bold text-white",
```

Every annotation pin renders the pin index `{index + 1}` as 12px bold white text on `bg-teal-500` (#14b8a6). Contrast = **2.22:1** — fails:
- WCAG 1.4.3 Contrast (Minimum): 4.5:1 for normal text. 12px bold is NOT "large text" (≥18.66px / 14pt bold).
- WCAG 1.4.11 Non-text Contrast: the pin itself (a UI component) must achieve 3:1 against its surrounding background. The pin sits on the artifact behind it — if that artifact is light (white/stone-50), the pin's outer color (teal-500 on white) gives contrast 2.22:1, below 3:1 for UI components. The 2px white border provides no contrast (white on white = 1:1).

The number inside each pin is the sole identifier that ties a pin to its row in the sidebar (`aria-label={\`Annotation ${index + 1}: ${title}\`}`). Low-vision sighted users who cannot read the number can still rely on the aria-label in SR mode, but visual identification is broken for anyone with mild low vision.

**Why the audit missed it.** The pin's numeral is inside `<span aria-hidden="true">{index + 1}</span>`. The rendered-mode contrast audit walks "every visible text node" but returns `aria-hidden` text too (it doesn't filter). However, example-session routes render ZERO pins at boot (draft pins require user click-to-create), so the sampler never sees one.

**Fix direction:** bump the pin fill to `bg-teal-700` (#0f766e, contrast 5.3:1 with white — passes 4.5:1) or change the numeral to black (teal-500 + stone-900 = 7.6:1 — pass). Add a token-pair roster entry for pin-bg + pin-text so this locks in. Also consider the UI-component contrast against likely light artifact backgrounds — teal-500 on stone-50 = 2.25:1, still below 3:1. Tests should construct a pin over a real artifact and sample.
