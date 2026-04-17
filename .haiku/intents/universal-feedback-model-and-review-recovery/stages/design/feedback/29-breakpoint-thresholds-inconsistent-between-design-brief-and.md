---
title: >-
  Breakpoint thresholds inconsistent between DESIGN-BRIEF and
  feedback-card-states
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-17T22:31:44Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

`DESIGN-BRIEF.md §4` defines breakpoints as:
- Desktop ≥1024px (`lg:`)
- Tablet 768-1023px (`md:`)
- Mobile <768px

`feedback-card-states.html §7 Responsive & Accessibility` (lines 525-540) uses:
- Mobile 375px
- Tablet 768px
- Desktop 1280px

Different widths. The DESIGN-BRIEF aligns with standard Tailwind breakpoints (`md:` = 768, `lg:` = 1024). The feedback-card-states artifact uses "Tablet 768" (ok) and "Desktop 1280" (skips 1024 entirely, implying `xl:` or `2xl:` is the new tablet/desktop split).

Also `feedback-card-states.html §7` describes divergent responsive behavior not in the DESIGN-BRIEF:
- "Footer buttons min-height 44px" on mobile vs "28px" on tablet/desktop — this is unit-05's spec but the DESIGN-BRIEF never documents the 28px desktop height.
- "Buttons stack to full-width below card body" on mobile — not referenced in DESIGN-BRIEF §4's responsive rules.

Fix: pick one breakpoint set (recommend DESIGN-BRIEF's Tailwind-aligned set since it controls implementation). Add the 28px-desktop footer-button rule and the stack-to-full-width mobile rule to DESIGN-BRIEF §4 so there is one source of truth. Review all 20 artifacts to confirm they honor the canonical breakpoints (some use `md:` / `lg:` inconsistently — 116 and 77 occurrences respectively across 20 files).
