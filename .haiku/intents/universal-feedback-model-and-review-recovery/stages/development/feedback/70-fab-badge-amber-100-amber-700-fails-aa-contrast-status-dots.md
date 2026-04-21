---
title: >-
  FAB badge amber-100/amber-700 fails AA contrast; status dots fail UI floor on
  card backgrounds
status: pending
origin: adversarial-review
author: accessibility (from design)
author_type: agent
created_at: '2026-04-21T20:28:00Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

**Severity:** major — WCAG 1.4.3 (Minimum contrast for visible numeric data) and 1.4.11 (Non-text contrast for UI state indicators).

**Offender 1 — FAB pending-count badge.** `packages/haiku-ui/src/components/feedback/FeedbackFloatingButton.tsx:70-78`:

```
"bg-amber-100 text-amber-700",
```

with `"text-xs font-bold"` (12 px bold).

- `amber-100 = #fef3c7` → luminance 0.913.
- `amber-700 = #b45309` → luminance 0.163.
- Ratio = (0.963)/(0.213) = **3.68:1**. Fails 4.5:1 normal-text floor. 12 px bold is not "large text" (needs 18.66 px regular or 14 pt = 18.66 px bold).

The badge has `aria-hidden="true"` and the numeric count is encoded in the FAB's `aria-label` ("Open feedback panel, N pending"), so SR users are OK. But sighted low-vision users reading the visible chip cannot rely on SR — they need the 4.5:1 floor. Making the number `aria-hidden` does not exempt it from visual contrast.

**Offender 2 — Status dots on rejected card background (`tokens.ts:39-45`).**

```
statusDotClasses = { rejected: "bg-stone-400 dark:bg-stone-500", ... }
```

With `statusBackground.rejected = "bg-stone-100 dark:bg-stone-800/50"`:
- Light mode: stone-400 (#a8a29e, L≈0.385) on stone-100 (#f5f5f4, L≈0.913). Contrast = (0.963)/(0.435) = **2.21:1**. Fails 3:1 non-text UI floor.
- `bg-amber-500` (pending + fixing dots, L≈0.557) on `bg-amber-50/50` composite (≈ stone-50 tinted, L≈0.947). Contrast = (0.997)/(0.607) = **1.64:1**. Fails catastrophically.
- Only `bg-green-500` and `bg-blue-500` come close to 3:1 on their respective tinted card backgrounds.

These dots are the *status indicator* — a pure UI component conveying state. WCAG 1.4.11 requires 3:1 against the adjacent background (the card the dot sits on).

**Offender 3 — Rejected status-badge bg vs card bg (`tokens.ts:35,62`).** Both resolve to stone-100 in light mode. Visually zero contrast — the "rejected" pill is indistinguishable from the card body, relying entirely on the text label and border to convey state. Low-vision users zooming in see a label floating on indistinguishable bg.

**Why the audit missed it.** `audit-contrast.mjs` PAIRS covers feedback-status badge fg/bg but NOT the dot-vs-card-bg pairing (a cross-component layer-composite check). It also doesn't cover the FAB badge pair. Rendered-mode sampler only picks up text nodes — the colored dot has no text content, and the FAB badge with aria-hidden number either slips past or is present in an empty-session route that doesn't render the FAB.

**Fix direction:**
- Bump FAB badge text to `text-amber-800` (L≈0.084) → 5.77:1, pass.
- Status dots: darken to `bg-amber-600`, `bg-blue-600`, `bg-green-600`, `bg-stone-600` so the dot has 3:1 against its tinted card bg.
- Rejected status-badge bg/body contrast: either darken rejected body text OR switch rejected card background away from stone-100.
- Add dot-vs-card-bg and FAB badge pairs to the PAIRS roster.
