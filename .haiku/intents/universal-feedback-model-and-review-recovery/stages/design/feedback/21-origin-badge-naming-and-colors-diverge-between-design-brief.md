---
title: >-
  Origin-badge naming and colors diverge between DESIGN-BRIEF and unit-05
  artifacts
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-17T22:30:55Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

`DESIGN-BRIEF.md §2` lines 170-177 define the `FeedbackOriginIcon` with a simple rendering: `text-xs text-stone-500 dark:text-stone-400` with emoji + label. Origins listed: `adversarial-review`, `external-pr`, `external-mr`, `user-visual`, `user-chat`, `agent` — each with a specific icon (🔍 for adversarial-review, 🔗 for external-pr, etc.).

Unit-05's `feedback-card-states.html §4 "Origin Badge Visual Inventory"` (lines 388-450) ships a much richer pill-based badge with per-origin colored backgrounds:
- `adversarial-review` → `bg-rose-100 text-rose-700 border-rose-200` (🛡 shield icon, not 🔍)
- `external-pr` / `external-mr` → `bg-violet-100 text-violet-700` (🔀 icon, not 🔗)
- `user-visual` → `bg-sky-100 text-sky-700` (👁 icon, not ✎)
- `user-chat` → `bg-sky-100 text-sky-700` (💬 — matches)
- `agent` → `bg-teal-100 text-teal-700` (✨ icon, not 🤖)

The name pattern is also inconsistent — DESIGN-BRIEF says label "Review Agent" (matches), "PR Comment" / "MR Comment" (unit-05 uses "External PR" / "External MR"), "Annotation" (unit-05 uses "User Visual"), "Comment" (unit-05 uses "User Chat"), "Agent" (matches).

This introduces a new color palette (rose, violet, sky) that neither the DESIGN-BRIEF nor DESIGN-TOKENS.md sanction for origin usage. The naming drift ("PR Comment" vs "External PR") also cascades into screen-reader labels, so a11y review will need to reconcile both.

Recommend: pick one origin-badge design. Unit-05's colored pill is arguably more useful (faster at-a-glance scanning), but if kept, DESIGN-BRIEF §2 must be updated and the new rose/violet/sky colors must be added to DESIGN-TOKENS.md with contrast proof. Also align the emoji choices and labels across both docs.
