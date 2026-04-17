---
title: Design artifacts use wrong Tailwind palette (gray-* instead of stone-*)
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-17T22:29:55Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

The `DESIGN-BRIEF.md` (lines 15-28) and `knowledge/DESIGN-TOKENS.md §1.1` both mandate the `stone-*` scale for the React review-app SPA. `gray-*` is reserved for server-rendered templates only. However, 14 of the 20 HTML artifacts in `stages/design/artifacts/` use `gray-*` classes exhaustively — 1595 hits across those 14 files vs 868 correct `stone-*` hits in the 6 newer artifacts.

Affected files (gray-* count):
- `feedback-card-states.html` (164)
- `comment-to-feedback-flow.html` (351)
- `review-ui-mockup.html` (211)
- `comments-list-with-agent-toggle.html` (117)
- `review-package-structure.html` (201)
- `feedback-inline-desktop.html` (84)
- `review-context-header.html` (80)
- `rollback-reason-banner.html` (80)
- `assessor-summary-card.html` (88)
- `revisit-unit-list.html` (61)
- `feedback-inline-mobile.html` (49)
- `feedback-lifecycle-transitions.html` (43)
- `stage-progress-strip.html` (51)
- `review-flow-with-feedback-assessor.html` (15)

Example at `feedback-card-states.html:13` — `<body class="bg-gray-50 dark:bg-gray-950 ...">` should be `bg-stone-50 dark:bg-stone-950`. Example at `comments-list-with-agent-toggle.html:13,15,27` — all of `bg-gray-50`, `dark:bg-gray-900/80`, `border-gray-200`, `dark:border-gray-800` must switch to the `stone-*` equivalents.

This is a direct violation of the mandate's first check ("no raw hex, px, or magic numbers" — here, wrong named tokens). If development implements these as-is, the review app will ship with two inconsistent color palettes side by side. Fix: sweep all 14 gray-using artifacts and replace gray-N → stone-N (same numeric shade).
