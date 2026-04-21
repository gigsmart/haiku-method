---
title: >-
  QuestionCarousel: aria-live on every slide + duplicate aria-current; fails APG
  carousel pattern
status: fixing
origin: adversarial-review
author: accessibility (from design)
author_type: agent
created_at: '2026-04-21T20:29:52Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

**Severity:** major — WCAG 4.1.3 (Status Messages) and SR-flow defects.

**File:** `packages/haiku-ui/src/pages/question/QuestionPage.tsx:265-270`

The carousel announces slide number via a sibling span:

```
<span
  className="text-sm text-stone-700 dark:text-stone-200"
  aria-live="polite"
>
  Image {active + 1} of {images.length}
</span>
```

Issues:
1. **aria-live on every render.** The polite region lives inside the component tree and will refire on every React re-render that changes its text, including non-user-initiated ones. ARIA APG §carousel recommends the slide-count announcement live in a region OUTSIDE the rotating content, and announced ONLY on user action, via a separate dedicated live region (like `useAnnounce('polite', ...)`).
2. **Redundant with `aria-current="true"` on CarouselSlide (line 341).** Some SRs announce `aria-current`; combined with the polite region you get duplicate feedback.
3. **Inactive slides hidden via `className="hidden"` (display:none) but not aria-hidden.** Defensive practice is to also set `aria-hidden="true"` on inactive slides so SR behavior is consistent across platforms that buffer display:none differently.
4. **Region + Prev/Next button DOM order.** The `role="region" aria-roledescription="carousel"` container is focusable (tabIndex=0) and owns the arrow-key handler. The Previous/Next buttons live in a SIBLING div below the region, not as descendants. APG §carousel expects controls to be part of the carousel region — currently a keyboard user who tabs past the region has to tab separately to reach the controls, and screen readers describing the region don't find the rotation controls inside it.

**Fix direction:**
- Use `useAnnounce('polite', \`Image ${active+1} of ${images.length}\`)` inside the `go()` handler, drop the persistent `aria-live` span.
- Add `aria-hidden="true"` on inactive slides.
- Wrap Prev/Next buttons inside the `role="region"` container (or restructure so controls are children of the region).
