---
title: 'Primary teal-600+white buttons fail WCAG AA contrast (3.1:1 < 4.5:1)'
status: fixing
origin: adversarial-review
author: accessibility (from design)
author_type: agent
created_at: '2026-04-21T20:24:44Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

**Severity:** blocker — WCAG 1.4.3 Contrast (Minimum) AA violation across multiple primary action surfaces.

**Finding.** Tailwind `bg-teal-600` (#0d9488) with `text-white` renders at **3.10:1** contrast — below the 4.5:1 floor for normal text (<18.66px, or <14pt). Every primary action that uses this pair is a normal-text failure.

**Occurrences:**
- `packages/haiku-ui/src/pages/direction/DirectionPage.tsx:258` — Submit "Choose This Direction" button: `bg-teal-600 hover:bg-teal-700 text-white font-semibold` at `text-base` (body 16px, semibold).
- `packages/haiku-ui/src/pages/question/QuestionPage.tsx:192` — "Submit Answer" button: same pair, `text-base font-semibold`.
- `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx:203` — Mobile feedback FAB: `bg-teal-600 ... text-white` with `text-lg font-bold` emoji glyph (the glyph is `aria-hidden` but the dark:teal-500 variant drops to **2.46:1**).
- `packages/haiku-ui/src/components/SkipLink.tsx:21` — Skip-to-main-content link (`focus-visible:bg-teal-600 focus-visible:text-white`, `font-medium` at default body size) — the first focusable element on every page fails contrast when it matters most: at focus.
- `packages/haiku-ui/src/components/feedback/AgentFeedbackToggle.tsx:88` — `TRACK_ON` color for the switch in "on" state (the track is a graphical indicator, 3:1 UI-nontext threshold — teal-600 on white background = 3.10:1, barely clears 3:1, but `dark:bg-teal-500` at 2.46:1 fails the 3:1 UI floor in dark mode).
- `packages/haiku-ui/src/components/feedback/FeedbackList.tsx:177` — "Retry" button (`bg-teal-600 text-white`) text-xs.
- `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx:771` — Annotation popover "Create" primary button (`bg-teal-600 text-white text-xs font-semibold`).
- `packages/haiku-ui/src/components/AnnotationCanvas.tsx:411`, `components/ReviewSidebar.tsx:311,387,409,501`, `components/InlineComments.tsx:296` — same pair in legacy paths that still ship.

**WCAG math.**
- `teal-600 = #0d9488` → sRGB luminance 0.2865.
- white → luminance 1.0000.
- Ratio = (1.0 + 0.05) / (0.2865 + 0.05) = **3.10:1**. Fails 4.5:1 normal-text threshold.
- `teal-500 = #14b8a6` → luminance ≈ 0.446 → ratio **2.22:1**. Fails both 4.5:1 and the 3:1 UI floor. Dark-mode fallbacks that use teal-500 (FAB dark, AgentFeedbackToggle dark, AnnotationCanvas popover dark) are worse, not better.

**Why the audit missed it.** `scripts/audit-contrast.mjs` token mode (`--mode=tokens`, §PAIRS roster) does not enumerate `teal-600 + white` or `teal-500 + white` as a declared pair. The roster covers origin-badge pairs (`teal-700 + teal-100`, agent badge) and feedback-status pairs, but not the primary-action button surface. Rendered mode walks 4 example-session routes but (a) the sampler only picks up elements with direct text node children — icon-only buttons with `aria-hidden` glyph children get skipped, (b) the empty example-session routes don't actually render most of these buttons, and (c) the 25-pair count in the unit-15 review notes confirms the sampler saw ~5 unique `(fg,bg,bucket)` tuples — nowhere near the actual surface.

**Fix direction (log-only; not my scope to edit):** either darken the primary from `teal-600`/`teal-500` to `teal-700` (ratio ≈ 4.76:1 on white, passes) or move to a different hue per DESIGN-TOKENS. Whatever the token choice, add every (primary-button-bg, primary-button-fg) pair to the `PAIRS` roster in `audit-contrast.mjs` so this regression cannot recur.
