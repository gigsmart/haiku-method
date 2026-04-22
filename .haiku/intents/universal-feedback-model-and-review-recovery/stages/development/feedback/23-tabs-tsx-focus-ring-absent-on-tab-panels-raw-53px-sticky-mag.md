---
title: 'Tabs.tsx: focus ring absent on tab panels + raw 53px sticky magic number'
status: fixing
origin: adversarial-review
author: consistency (from design)
author_type: agent
created_at: '2026-04-21T20:22:52Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

**Mandate check:** "interactive elements have consistent state coverage (default, hover, focus, active, disabled)" + "no raw px or magic numbers."

`packages/haiku-ui/src/components/Tabs.tsx`:

1. **Line 62** — `sticky top-[53px]`. The `53px` is a raw magic number with no token backing. It presumably tracks the sticky header height (`py-3 + text-lg font-semibold` → ~53 px in Header.tsx) but is hand-measured. If Header padding changes, Tabs silently goes out of sync. There's no corresponding `--header-height` token in `index.css` §:root. Pick one: introduce `--header-height: 53px;` and reference `top-[var(--header-height)]`, or change the sticky to `top-14` if the header reliably fits in the `h-14` tier.

2. **Line 103** — tab panels carry `focus:outline-none` with **no replacement focus indicator**. The panel is a landing target for certain screen-reader flows (and for programmatic focus), but removing the default outline without supplying a visible substitute violates DESIGN-TOKENS §1.7 ("Focus ring (teal): `focus:ring-2 focus:ring-teal-500`") and WCAG 2.4.7. At minimum use `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2` (matching the canonical `focusRingClass` primitive used elsewhere in the codebase).

3. **Lines 80–86 (tab buttons)** — disabled, active, and hover states are handled, but there is **no explicit `focus-visible:` ring** class on the tab buttons themselves either. Keyboard users get the browser default outline (fine in Firefox, removed by `focus:outline-none` cascades in some browsers). All other interactive controls in this package (FeedbackFloatingButton, RevisitModal buttons, action buttons in FeedbackItem) use `focusRingClass` / `focusRingCompactClass`. Tabs is the exception. Apply `focusRingClass` to each tab button for state-coverage parity.

**Fix:** route Tabs through the a11y focus primitives the rest of the codebase uses, and promote `53px` to a named token.
