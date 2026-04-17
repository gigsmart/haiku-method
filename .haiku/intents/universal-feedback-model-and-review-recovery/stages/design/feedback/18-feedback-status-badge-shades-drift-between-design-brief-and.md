---
title: Feedback status badge shades drift between DESIGN-BRIEF and artifacts
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-17T22:30:43Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

`DESIGN-BRIEF.md` lines 131-143 mandate a specific shade for each status badge:
- `pending`: `bg-amber-100 text-amber-700` (not 800)
- `addressed`: `bg-blue-100 text-blue-700`
- `closed`: `bg-green-100 text-green-700`
- `rejected`: `bg-stone-100 text-stone-500`

The brief even includes a WCAG table (§6, lines 560-569) citing these exact shade pairs with the verified contrast ratios (e.g., "amber-700 on amber-100: 4.9:1").

But the artifacts consistently use `amber-800`, `blue-800`, `green-800`:
- `feedback-card-states.html:46` — `bg-amber-100 text-amber-800` (pending)
- `feedback-card-states.html:51` — `bg-blue-100 text-blue-800` (addressed)
- `feedback-card-states.html:61` — `bg-green-100 text-green-800` (closed)
- `feedback-card-states.html:82, 101, 158, 176` — same pattern throughout
- `assessor-summary-card.html:96, 181` — `bg-green-100 text-green-800`, `bg-amber-100 text-amber-800`
- `annotation-gesture-spec.html:62`, `annotation-popover-states.html:107` — `text-amber-800`

The amber-800 / blue-800 / green-800 shades have higher contrast (they pass WCAG) so this is not an a11y regression, but it violates the "named token must match" check. Two possibilities:
1. Update DESIGN-BRIEF §2 color mapping + §6 WCAG table to `-800` shades (if the designer intended the darker versions).
2. Update all artifacts to the `-700` shades the brief specifies.

Either choice is fine; the design system must pick one and make both docs agree. Right now a developer implementing the `FeedbackStatusBadge` component will produce one set of colors while the mockups render a different set.
