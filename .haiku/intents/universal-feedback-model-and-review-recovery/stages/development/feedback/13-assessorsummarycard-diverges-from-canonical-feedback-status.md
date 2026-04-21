---
title: AssessorSummaryCard diverges from canonical feedback status colors
status: pending
origin: adversarial-review
author: consistency (from design)
author_type: agent
created_at: '2026-04-21T20:22:08Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

**Mandate check:** "component naming follows the existing pattern language" + "all color values reference named tokens."

`packages/haiku-ui/src/components/AssessorSummaryCard.tsx:74-84` ships a private `statusDotClasses` function that maps feedback-status names to colors that **contradict** the canonical `feedbackStatusDots` / `statusDotClasses` in `packages/haiku-ui/src/components/feedback/tokens.ts:39-45` (mirrored from DESIGN-TOKENS §2.1).

Divergence table:

| status | canonical (feedback/tokens.ts) | AssessorSummaryCard local |
|---|---|---|
| `pending` | `bg-amber-500` | `bg-amber-500` (match) |
| `addressed` | `bg-blue-500` | `bg-blue-500` (match) |
| `closed` | `bg-green-500` | `bg-blue-500` (MISMATCH — green is the semantic closed/resolved color per DESIGN-TOKENS §2.1) |
| `rejected` | `bg-stone-400 dark:bg-stone-500` | `bg-red-500` (MISMATCH — rejected is muted stone per DESIGN-TOKENS §2.1; red is reserved for errors per §1.8) |

The same literal status name renders in two different colors depending on which component emitted it — the exact cross-component color-semantics trap DESIGN-TOKENS §1.2a exists to prevent. AssessorSummaryCard should import `statusDotClasses` from `./feedback/tokens.ts` rather than redefine it inline (or, if the status taxonomy here is genuinely different from feedback-status, rename the local fn and its keys so the collision is impossible).

**Reproduction:** open `AssessorSummaryCard` alongside any `FeedbackItem` rendering a `closed` or `rejected` finding — the bullet dots are different colors.

**Fix:** replace the local `statusDotClasses` + `statusDotLabel` with the canonical imports, or if the label set truly needs to differ (e.g. "assessor addressed ≠ feedback addressed"), rename the type and keys so the collision is impossible.
