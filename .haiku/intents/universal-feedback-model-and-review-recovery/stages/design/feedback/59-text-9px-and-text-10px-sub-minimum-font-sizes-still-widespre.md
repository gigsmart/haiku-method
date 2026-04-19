---
title: >-
  text-[9px] and text-[10px] sub-minimum font sizes still widespread — unit-11
  gate unfulfilled
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:54:45Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

unit-11 completion criteria line 42 (marked `[x]`) requires: `grep -rEn 'text-\[(9|10)px\]' stages/design/artifacts/` returns 0 matches, with `text-xs` (12px) as the hard minimum and `text-[11px]` only permitted when paired with `font-semibold` and documented.

Actual:
- `text-[10px]`: **1,049 occurrences** across design artifacts
- `text-[9px]`: **112 occurrences**
- `text-[11px]`: 198 occurrences
- `text-[8px]`: 7 occurrences
- `text-[12px]`: 3 occurrences (redundant — should be `text-xs`)

Top 3 status breaks:
1. `text-[10px]` is documented in DESIGN-TOKENS.md §2.4 (visit counter, line 328), §2.5 (section header, line 383), and a third composite reference at line 564 — three narrowly-scoped use-cases. But the artifacts use it 1,049 times including on metadata lines, badge text, help copy, dimmed chips, etc. The narrow token has bled everywhere.
2. `text-[9px]` is not documented anywhere as a token yet appears 112 times. Pure magic number.
3. `text-[8px]` (7 occurrences) is below WCAG readability floors.

Note: the unit-11 gate line 42 explicitly says "9px and 10px user-facing text eliminated." DESIGN-TOKENS.md §2.4 contradicts this by sanctioning `text-[10px]` for the visit counter — these specs disagree, which is itself a consistency violation.

Consistency mandate violation: "all spacing, typography, and color values reference named tokens — no raw hex, px, or magic numbers." `text-[8/9/10/11/12px]` values are magic numbers unless each is declared as a named token in DESIGN-TOKENS.md with a single documented use-case.

Fix options (pick one):
1. **Strict typography floor (unit-11 stance):** sweep 10px → 12px (`text-xs`), 9px → 12px, 8px → 12px, 11px → stay if `font-semibold`. Remove 10px from DESIGN-TOKENS.md §2.4/§2.5 or bump to 11px font-semibold per gate.
2. **Documented exceptions:** leave the 10px visit-counter badge but sweep every OTHER 10px to `text-xs`. Document the exception in DESIGN-TOKENS with a whitelist: "text-[10px] is permitted ONLY in: visit-counter badge, section-divider headers." Sweep 9px and 8px to zero.

Gate command to prove fix: `grep -rEn 'text-\[(8|9|10)px\]' stages/design/artifacts/ | wc -l` must be ≤ whitelisted-count from DESIGN-TOKENS §2.
