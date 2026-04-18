---
title: FAB pulse animation has no prefers-reduced-motion guard
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:30:53Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
closed_by: unit-15-state-coverage-and-motion
---

The mobile feedback FAB pulse animation runs for 6 seconds (2s × 3 iterations) on new feedback arrival, with no `@media (prefers-reduced-motion: reduce)` fallback.

- `artifacts/feedback-inline-mobile.html:30-37` — `@keyframes feedback-pulse` and `.feedback-fab-pulse` definitions have no reduced-motion block.
- DESIGN-BRIEF.md §7 also defines the same animation without a reduced-motion guard.

The focus-ring-spec.html correctly implements `prefers-reduced-motion` for the cross-flash animation (line 78-82) — the FAB animation should match that standard.

This violates WCAG 2.3.3 Animation from Interactions (AAA) and is a known accessibility failure for users with vestibular disorders, photosensitive epilepsy, or cognitive impairments who rely on reduced-motion OS settings.

**Fix:** Add to DESIGN-BRIEF.md §7 CSS block:
```css
@media (prefers-reduced-motion: reduce) {
  .feedback-fab-pulse {
    animation: none;
  }
}
```
And audit all other animations in the artifacts (`sheet-up`, `pop-in`, `review-pulse`, `feedback-status-change`) to confirm they all respect the reduced-motion preference.
