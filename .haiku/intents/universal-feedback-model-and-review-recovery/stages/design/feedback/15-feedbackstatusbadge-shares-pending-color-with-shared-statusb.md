---
title: >-
  FeedbackStatusBadge shares "pending" color with shared StatusBadge, breaks
  cross-component color semantics
status: closed
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-20T20:21:09Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-15:bolt-1'
bolt: 1
upstream_stage: null
---

## Problem

DESIGN-TOKENS §1.2 shared `StatusBadge` (`packages/shared/src/components/StatusBadge.tsx`, lines 66–74) defines:

| `pending` (default fallback) | `bg-stone-100 text-stone-500` | `dark:bg-stone-800 dark:text-stone-400` |

This is the app-wide "neutral, no status yet" badge.

DESIGN-BRIEF §2 `FeedbackStatusBadge` + DESIGN-TOKENS §2.1 define:

| `pending` | `bg-amber-100 text-amber-800` | `dark:bg-amber-900/30 dark:text-amber-300` |

And DESIGN-TOKENS §2.1 (line 243):

| `rejected` | `bg-stone-100 text-stone-500` | `dark:bg-stone-800 dark:text-stone-400` |

**Two separate problems:**

1. The *word* "pending" now means two visually opposite things across the app:
   - `StatusBadge pending` = stone/neutral (unit/intent not started)
   - `FeedbackStatusBadge pending` = amber/attention (open feedback needing review)

   A screenshot of a sidebar with both badges visible will show the same literal label "pending" in two colors. A user will assume the difference is meaningful when it's actually just reflecting two different component contexts. DESIGN-BRIEF §2 line 173 acknowledges this implicitly — amber for "attention needed" — but there's no policy preventing the two badges from co-rendering on the same page.

2. `FeedbackStatusBadge rejected` = `bg-stone-100 text-stone-500` — **identical to shared StatusBadge's `pending` fallback.** So an implementer who forgets the `feedbackStatusColors` map and falls back to the shared `StatusBadge` would render rejected feedback using the same tokens as "pending" units. Two different states, one shape. This is a latent trap.

## Impact

- Ambiguity in color-to-meaning for "pending" across the product.
- Latent aliasing between shared pending and feedback rejected tokens means defensive coding can trip silently.
- The brief's accessibility audit (§6 lines 751–752) measures `stone-500 on stone-100` at 4.6:1 — which passes AA, but DESIGN-TOKENS §1.1a line 56 flags the same pair as a **FAIL** (4.40:1 measured). The two documents disagree about whether this pair passes AA — a direct contradiction on the actual contrast number.

## Fix

1. Either rename the app-wide `StatusBadge pending` fallback to something more specific (`neutral` or `idle`), or pin `FeedbackStatusBadge pending` to a visually distinct non-amber token (but this is worse — amber is already wired into the rest of the feedback UI and into DESIGN-TOKENS §2.1 note). Prefer renaming the shared fallback.

2. Reconcile the `stone-500` on `stone-100` contrast number between DESIGN-BRIEF §6 (4.6:1 claimed) and DESIGN-TOKENS §1.1a (4.40:1 claimed). WebAIM's official contrast checker puts the ratio at 4.43:1 → AA fails for normal-text body. At minimum, document the "rejected" rationale acknowledges this: the badge text "rejected" is intentionally low-contrast as a de-emphasis cue, but the brief still claims AA compliance. Either drop the AA claim or swap to `text-stone-600` on `bg-stone-100` (6.99:1, unambiguous AA).

3. Add explicit guidance in the Retired Components / Banned pairs section: "Never render a shared `StatusBadge pending` inside a feedback context — use `FeedbackStatusBadge` exclusively."

## Files
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md:66-74` (shared StatusBadge)
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md:239-267` (FeedbackStatusBadge)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/DESIGN-BRIEF.md:751-752` (AA claim)
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md:56` (FAIL claim for same pair)
