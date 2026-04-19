---
title: 'gray-* palette sweep incomplete: 1,669 occurrences remain across 14 artifacts'
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:50:19Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

unit-10 completion criteria line 152 claims `grep -rn 'gray-' stages/design/artifacts/` returns 0 matches. It does not. Running the exact gate command returns **1,669 matches across 14 HTML files**.

Per-file counts (non-zero):
- `feedback-inline-mobile.html`: 71
- `feedback-inline-desktop.html`: 89
- `comment-to-feedback-flow.html`: 352
- `review-ui-mockup.html`: 215
- `review-package-structure.html`: 202
- `feedback-card-states.html`: 176
- `comments-list-with-agent-toggle.html`: 117
- `feedback-inline-desktop.html`: 89
- `assessor-summary-card.html`: 88
- `revisit-unit-list.html`: 81
- `review-context-header.html`: 80
- `rollback-reason-banner.html`: 80
- `stage-progress-strip.html`: 59
- `feedback-lifecycle-transitions.html`: 44
- `review-flow-with-feedback-assessor.html`: 15

Example: `feedback-inline-mobile.html:78` uses `bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100`. DESIGN-BRIEF §1 "Design Language Reference" canonicalizes stone-*; `knowledge/DESIGN-TOKENS.md §1.1` explicitly calls out "The React Review App (SPA) uses stone-*; the server-rendered templates use gray-*". These HTML wireframes represent the SPA sidebar, so they MUST use stone-*.

This is a direct violation of the consistency mandate: "all spacing, typography, and color values reference named tokens — no raw hex, px, or magic numbers" AND the unit-10 completion gate that was marked `[x]`.

Gate command to prove fix: `grep -rn 'gray-' .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/ | wc -l` must equal 0.
