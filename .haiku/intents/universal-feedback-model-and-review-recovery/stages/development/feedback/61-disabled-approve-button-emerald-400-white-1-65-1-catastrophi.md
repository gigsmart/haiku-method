---
title: >-
  Disabled Approve button emerald-400+white: 1.65:1 — catastrophic contrast
  failure
status: pending
origin: adversarial-review
author: accessibility (from design)
author_type: agent
created_at: '2026-04-21T20:25:36Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

**Severity:** blocker — WCAG 1.4.3 (Minimum contrast). The disabled-state label is effectively invisible to many low-vision users.

**File:** `packages/haiku-ui/src/pages/review/FooterBar.tsx:145`

```
disabled:cursor-not-allowed disabled:bg-emerald-400 dark:bg-emerald-500 dark:hover:bg-emerald-600
```

Approve button disabled state: `bg-emerald-400` (#34d399) + `text-white` inherited from the non-disabled state (the disabled: variant does not override `text-white`).

- Luminance(emerald-400) ≈ 0.595. Contrast with white = (1.05)/(0.645) = **1.63:1**.
- Fails WCAG AA (4.5:1 for normal text) by a factor of nearly 3.
- Even the UI-nontext 3:1 floor for the button's own surface-vs-background is irrelevant here — this is text contrast on the button label.

Disabled controls are WCAG-exempt ONLY when they are "inactive user interface components" AND their **purpose** is communicated; WCAG 2.1 techniques explicitly require that disabled controls still pass if they convey information the user needs (the label "Approve" IS informational — the reviewer needs to know the button they're waiting to activate).

Secondary problem, same file: the non-disabled `bg-emerald-600` + `text-white` = **3.85:1** — also below 4.5:1. Not flagged by audit-contrast because it's not in the PAIRS roster.

**Why the audit missed it.** `audit-contrast.mjs --mode=tokens` has entries for `disabled-button/primary-green-light` (`fg: green-800, bg: green-300` — passes 4.68:1). This FooterBar button uses `emerald-*` not `green-*`, and white-on-emerald-400, not green-800-on-green-300. No emerald entries at all.

**Fix direction:** use the canonical disabled-primary token from DESIGN-TOKENS §1.7 (`bg-green-300 + text-green-800`, matching what QuestionPage.tsx:192 and DirectionPage.tsx:258 already do). Or swap to `bg-emerald-700` + `text-white` = 4.7:1 and add `disabled:bg-stone-300 disabled:text-stone-600` per the secondary disabled token. Add emerald pairs to the roster.
