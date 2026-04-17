---
title: Pin annotation buttons are 28px — below 44px touch target on mobile
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:30:00Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

The visual pin markers that anchor annotations on spatial artifacts render at `w-7 h-7` (28px × 28px). The mandate requires touch targets ≥ 44px on mobile; the DESIGN-BRIEF §6 and unit-04 both explicitly call this out ("Touch targets ≥ 44px on mobile", "Touch targets on the popover footer are ≥ 44px").

Affected:
- `artifacts/feedback-inline-desktop.html:164, 180, 183` — pin buttons at 28px
- `artifacts/annotation-gesture-spec.html:195` — existing pin at `w-7 h-7`
- `artifacts/annotation-popover-states.html:55-63` — `.pin` CSS declares `width: 28px; height: 28px`
- `artifacts/feedback-inline-mobile.html` — mobile has no pins (correctly falls back to list) but the desktop/tablet pattern still fails when the viewport is a touch tablet

On touch tablets (≥ 768px, the tablet breakpoint), pins remain tappable and must meet the 44px target. The 28px marker is a WCAG 2.5.5 Target Size (AAA) violation and, more critically, WCAG 2.5.8 Target Size Minimum (AA in 2.2) requires 24px at minimum but recommends 44px for primary actions.

**Fix:** Make the pin marker a 44px invisible hit area with a 28px visual marker centered inside, or lift the pin visual to `w-11 h-11` (44px). The annotation-gesture-spec already accepts a hover "ghost pin" pattern — apply the same sizing to the real pin hit target.
