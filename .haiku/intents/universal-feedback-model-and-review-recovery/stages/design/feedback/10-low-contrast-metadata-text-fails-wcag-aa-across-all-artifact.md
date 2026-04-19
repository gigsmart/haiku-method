---
title: Low-contrast metadata text fails WCAG AA across all artifacts
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:29:50Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
closed_by: unit-11-contrast-and-type-scale
---

The metadata footer lines on every feedback card (`FB-XX · Visit N · origin`) use `text-gray-400 dark:text-gray-500` or `text-stone-400 dark:text-stone-500`. These colors hit roughly 2.8–3.0:1 contrast against the card backgrounds (white / stone-50 / amber-50/50), which is **below the WCAG 2.1 AA requirement of 4.5:1 for normal body text**.

This is load-bearing information — feedback ID, visit number, and origin are how the user identifies which item they're acting on.

Examples:
- `artifacts/feedback-inline-desktop.html:109` — `<p class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">FB-01 &middot; Visit 1 &middot; adversarial-review</p>`
- `artifacts/feedback-inline-mobile.html:178` — same pattern
- `artifacts/feedback-card-states.html:85` — `<p class="text-[10px] text-gray-500 mt-0.5">Visit 1 · adversarial-review · parent-agent</p>`
- `artifacts/comments-list-with-agent-toggle.html:91, 102, 117` — metadata lines
- `artifacts/assessor-summary-card.html:55, 98` — "ran 2s ago" + "rollback imminent"

The DESIGN-BRIEF.md §6 claims WCAG AA compliance for status badges, but the brief never audits the metadata text colors that sit on every card. The contrast claim in the brief covers badges only.

**Fix:** Require `text-stone-500 dark:text-stone-400` minimum for metadata text on light/dark card surfaces, or lift to `text-stone-600 dark:text-stone-300` for anything at text-[10px] size. Update the DESIGN-TOKENS to ban `stone-400`/`gray-400` on white/stone-50 surfaces for text.
