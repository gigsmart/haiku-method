---
title: >-
  Footer-button standard disabled style uses opacity-50, which unit-11/18 bans
  repo-wide
status: closed
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-20T20:20:19Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-11:bolt-1'
bolt: 1
upstream_stage: null
---

## Problem

DESIGN-BRIEF §2 Footer Button Copy, line 567:
> Every button above inherits the standard focus ring (`ring-2 ring-teal-500 ring-offset-2 ring-offset-white dark:ring-offset-stone-900`) and the standard disabled style (`opacity-50 cursor-not-allowed`). No verb-specific deviations.

DESIGN-TOKENS §1.7 (line 170):
> **Unit-11 / unit-18 note:** `disabled:opacity-50` and any `opacity-50`/`opacity-60`/`opacity-70` on a button, card, or wrapper root is **banned repo-wide**. α-composite opacity collapses text below WCAG 1.4.3 AA (≈ 2.3:1 on white for primary-colored disabled buttons). Convey disabled state via the token pairs above.

Direct contradiction. The brief defines the "standard disabled style" as exactly the thing DESIGN-TOKENS bans.

DESIGN-TOKENS §1.7 (lines 165–167) provides the canonical replacement:

| Disabled button — secondary | `bg-stone-100 text-stone-600 border border-stone-400 cursor-not-allowed` + `aria-disabled="true"` |
| Disabled button — primary green | `bg-green-300 text-green-800 dark:bg-green-900/40 dark:text-green-200 cursor-not-allowed` + `aria-disabled="true"` |

## Impact

The brief's "No verb-specific deviations" clause means every Dismiss / Verify & Close / Reopen disabled-state will ship with `opacity-50`, fail the WCAG 1.4.3 gate, and (if grep audit is wired) fail the repo-wide ban check immediately.

## Fix

Rewrite DESIGN-BRIEF line 567 to reference the DESIGN-TOKENS §1.7 disabled token pairs instead of `opacity-50`. Concrete replacement:

> Every button above inherits the standard focus ring (`ring-2 ring-teal-500 ring-offset-2 ring-offset-white dark:ring-offset-stone-900`) and the standard disabled tokens from `DESIGN-TOKENS §1.7`:
> - **Dismiss / Reopen (secondary)**: `bg-stone-100 text-stone-600 border border-stone-400 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-500 cursor-not-allowed` + `aria-disabled="true"`.
> - **Verify & Close (primary green)**: `bg-green-300 text-green-800 dark:bg-green-900/40 dark:text-green-200 cursor-not-allowed` + `aria-disabled="true"`.
> `opacity-*` on a button root is banned repo-wide (see DESIGN-TOKENS §1.7 / unit-11 / unit-18).

## Files
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/DESIGN-BRIEF.md:567`
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md:165-170`
