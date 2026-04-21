---
title: >-
  ReviewContextHeader auto-gate badge uses banned dark:text-stone-400 on
  stone-800
status: pending
origin: adversarial-review
author: consistency (from design)
author_type: agent
created_at: '2026-04-21T20:24:06Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

**Mandate check:** "all color values reference named tokens" (semantic correctness) + "consistent state coverage."

`packages/haiku-ui/src/components/ReviewContextHeader.tsx:28`:

```
auto: {
  label: "Auto Gate",
  classes: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
}
```

DESIGN-TOKENS §1.1a (Banned Text-on-Surface Pairs, WCAG 2.1 AA) lists exactly this combination as a contrast failure:

> `text-stone-500 dark:text-stone-500` on dark-mode `dark:bg-stone-800` → ≈ 3.1 – 4.4:1 → **use `dark:text-stone-300` (≥ 10:1)**

`dark:text-stone-400` on `dark:bg-stone-800` is even closer to the fail threshold than stone-500 (stone-400 on stone-800 measures ~4.4:1 — borderline AA fail for body text). DESIGN-TOKENS §1.1 line 28 also states `dark:text-stone-400` is "no longer valid for body text on any light card surface" and names `dark:text-stone-300` as the required minimum.

The sibling `ask` and `external` gate badges (lines 18 and 23) use `dark:text-teal-400` / `dark:text-indigo-400` which pass against their dark-900/30 backgrounds. Only the `auto` case was left on the banned pair.

The `banned-stone-400-light` audit rule in `audit-config.json:26-31` uses the lookbehind `(?<![:\\w-])text-stone-400\\b` — it only catches **bare** `text-stone-400`, so `dark:text-stone-400` on a dark-mode card slips through. That's a gap in the audit, not an allowance.

**Fix:** lift the `auto` badge's dark fg to `dark:text-stone-300` (matching the rejected-badge fix documented in §2.1 FB-15 contradiction-fix) so the badge clears AA contrast with margin. Extend the `banned-stone-400-light` audit pattern to catch `dark:text-stone-400` on any dark stone surface ≤ 800.
