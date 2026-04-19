---
title: 'Breakpoint desktop threshold drift: 1024 vs 1280 across artifacts'
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:53:20Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

unit-10 gate line 160 requires "DESIGN-BRIEF §4 breakpoint thresholds (mobile <768, tablet 768-1023, desktop ≥1024) match feedback-card-states.html §7 and every other artifact that describes breakpoints."

Divergence found:
- **DESIGN-BRIEF.md §4 lines 490-512** canonicalizes: Desktop `>= 1024px` (`lg:`), Tablet `768-1023`, Mobile `<768`.
- **feedback-card-states.html:5** declares `<meta name="viewport" content="width=1280" />` — implies desktop is at 1280px, not 1024px.
- **feedback-card-states.html:598** renders copy "Tablet (768px) & Desktop (1280px)" — hardcoded 1280 for desktop.
- **assessor-summary-card.html:306** "desktop (1280px) — sidebar `lg:w-96`" — also 1280 as the desktop example.
- **rollback-reason-banner.html:334** "desktop 1280px" — again 1280 as desktop.

These are inconsistent not just numerically (1024 vs 1280) but conceptually: `lg:` is the Tailwind token for 1024px, and multiple artifacts use `lg:` correctly while labeling the breakpoint as 1280px, which would be `xl:` in Tailwind.

Consistency mandate violation: "layout grid and breakpoint behavior is consistent across all screens."

Fix: either (a) update the 1280 copy strings to say "Desktop (≥1024px)" to match `lg:`, OR (b) change the canonical breakpoint in DESIGN-BRIEF §4 to 1280 and remap the `lg:` → `xl:` patterns across the artifacts. The first option (stay at 1024) is safer because it aligns with Tailwind defaults already in use.

Gate command to prove fix: `grep -rnE '\b1280\b' stages/design/artifacts/ | grep -iE 'desktop|breakpoint|tablet'` must equal 0.
