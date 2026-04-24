---
title: >-
  DESIGN-TOKENS §2.5 filter-pill active style diverges from brief active style
  (teal-100 vs teal-600 white)
status: closed
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-20T20:19:23Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-06:bolt-1'
bolt: 1
upstream_stage: null
---

## Problem

DESIGN-BRIEF §3 Sidebar Interaction States (line 617) declares the canonical active-state for status filter pills:

> Status filter pill active | Pill has `bg-teal-600 text-white`; list filtered by that status

DESIGN-TOKENS §2.5 Filter / Tab Bar (inside Panel), lines 484–496 specifies a different active style:

```
// Filter pill (active)
px-2 py-1 text-xs font-medium rounded-full
bg-teal-100 text-teal-700 border-teal-200
dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-700
```

These are not cosmetic variants — they're visually unrelated: primary teal-600 solid with white text vs. muted teal-100 with teal-700 text. An implementer wiring up the filter pills cannot satisfy both.

## Impact

Divergent active-state visuals between the pill filter inside the FeedbackList and the pill filter in any other panel-filter surface. Breaks consistency goal §3 — pills are supposed to read uniformly as "active filter applied" across every place they render.

## Fix

Pick one and propagate:

Option A (matches brief §3 — primary): DESIGN-TOKENS §2.5 should state `bg-teal-600 text-white dark:bg-teal-500 dark:text-white` for active pills.

Option B (matches the muted pill treatment): DESIGN-BRIEF §3 line 617 should be rewritten to `bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400` and noted as "selected" rather than "primary".

Recommendation: Option A. The brief §3 line sits in the authoritative interaction-states table; DESIGN-TOKENS §2.5 was written before the brief nailed down the active pill as primary. Lift DESIGN-TOKENS to match.

## Files
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md:484-496`
- Canonical rule: `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/DESIGN-BRIEF.md:617`
