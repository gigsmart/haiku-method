---
title: >-
  StageProgressStrip conveys status via color+shape only; dots are 14-20px (fail
  44px target); no focus indicator
status: pending
origin: adversarial-review
author: accessibility (from design)
author_type: agent
created_at: '2026-04-21T20:26:02Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

**Severity:** blocker — WCAG 1.4.1 (Use of Color), 2.5.5 (Target Size), 2.4.7 (Focus Visible) all violated.

**File:** `packages/haiku-ui/src/components/StageProgressStrip.tsx:43-61`

Three interlinked defects on a shell-level nav element that renders on every page:

**1 — Information by color/shape alone (WCAG 1.4.1).** Stage status (current/completed/future/future-with-visits) is communicated exclusively through:
- Shape: rotated square for current, filled circle for completed, outline circle for future.
- Color: teal-500 fill for current/completed vs. stone-300/400 border for future.
The button has no text label tied to its status, and the adjacent `<span>` label just says `{stage.name}` — never "completed" or "current" or similar. The `title={`${stage.name} (${stage.status})`}` attribute is not a reliable a11y affordance (mouse-hover tooltips are NOT announced by most screen readers and are invisible to keyboard users).

**2 — Touch target 14-20px (WCAG 2.5.5, 2.5.8).** 
- Current: `w-5 h-5` = 20×20 CSS px.
- Completed/clickable: `w-3.5 h-3.5` = 14×14 CSS px.
- No `touchTargetClass`, no `::before` hit-area expansion.
- Floor is 44×44 on mobile, 24×24 on desktop per WCAG 2.5.8. Both sizes fail both floors.

**3 — No visible focus indicator (WCAG 2.4.7).** The button has no `focusRingClass` — it relies on `transition-all` + `hover:scale-125` + `hover:border-teal-400`. Keyboard focus produces no visible ring because the parent ShellLayout has no global `:focus-visible` outline reset. Tabbing through stages leaves no indicator of which stage is focused.

**4 — Bonus: color-dependent connector.** The connector line between stages (`line 34-39`) uses `bg-teal-400` vs `bg-stone-300` — also color-only distinction between progress and not-yet-reached.

**Why the audit missed it.** The touch-target audit (`audit-touch-targets.mjs`) reported 8 interactive elements total across 4 routes — the example sessions evidently do not render a populated StageProgressStrip. The rendered-mode contrast audit doesn't sample `bg-*` on non-text elements. No audit covers WCAG 1.4.1 (color-only conveyance) at all.

**Fix direction:** 
- Add `aria-label={\`Stage ${stage.name}, ${stage.status}\`}` to each button (replaces `title`).
- Add a text-equivalent check-mark icon for completed and a `★` or `•` glyph for current so non-color channels carry the status.
- Add `touchTargetHitAreaClass` so the invisible 44×44 pseudo wraps the tiny visible dot.
- Add `focusRingClass` so keyboard focus is visible.
- Roster entry: "every UI nav control passes non-text-contrast AND has a text-equivalent status channel."
