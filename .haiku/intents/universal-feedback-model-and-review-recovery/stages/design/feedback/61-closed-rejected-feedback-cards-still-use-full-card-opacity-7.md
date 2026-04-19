---
title: >-
  Closed/rejected feedback cards still use full-card opacity-70/opacity-50 —
  fails state coverage
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:55:15Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

unit-11 completion criteria lines 47-51 (marked `[x]`) require: "Closed/rejected cards DO NOT apply `opacity-70` or `opacity-50` to the entire card; state is conveyed by border color + badge + muted background only; `grep -rEn 'opacity-(50|70)' stages/design/artifacts/` on closed/rejected card selectors returns 0 matches; rejected title uses `text-stone-500 line-through decoration-stone-500` at full opacity."

Violations found on card-level selectors (not button disabled states, which legitimately use opacity-50):
- `feedback-inline-desktop.html:321` — closed card wrapper `...transition-all cursor-pointer opacity-70` on the `<div>` containing the feedback card. Entire card is 70% opacity.
- `feedback-inline-desktop.html:337` — rejected card wrapper `...cursor-pointer opacity-50` on the `<div>`. Entire card is 50% opacity — this is exactly what the gate forbids.
- `feedback-inline-desktop.html:466` — closed card in feedback list is `opacity-70` on the wrapper.
- `feedback-inline-mobile.html:274` — closed list item `touch-target opacity-70` on the whole listitem.

These are card-level opacities, not focus/disabled-button transitions. They reduce contrast on title + body + metadata + status badge simultaneously, which pushes WCAG contrast below AA (the whole reason unit-11 FB-13 flagged this originally).

Also: DESIGN-BRIEF.md §2 line 229-231 still documents these opacity values as canonical:
```
Status: closed: entire row is slightly faded (opacity-70) with green left border.
Status: rejected: faded (opacity-50) with strikethrough on title.
```
So the brief ITSELF authorizes the violation. unit-11's gate is inconsistent with the brief it depends on.

Consistency mandate violation: "interactive elements have consistent state coverage (default, hover, focus, active, disabled, error)" — closed/rejected cards are supposed to be distinguishable by border color + muted background, not by blanket opacity that breaks contrast for every descendent.

Fix:
1. Remove `opacity-70` / `opacity-50` from closed/rejected card wrappers in feedback-inline-desktop.html:321, 337, 466 and feedback-inline-mobile.html:274.
2. Rewrite DESIGN-BRIEF.md §2 lines 229-231 to match unit-11's gate: closed = green-left-border + full-opacity title + faded metadata; rejected = strikethrough title (stone-500) at full opacity + subtle stone background.
3. Verify rejected title uses `text-stone-500 line-through decoration-stone-500` — currently I don't see `decoration-stone-500` declared anywhere.
