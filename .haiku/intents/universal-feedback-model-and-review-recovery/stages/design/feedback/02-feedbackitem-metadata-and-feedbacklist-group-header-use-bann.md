---
title: >-
  FeedbackItem metadata and FeedbackList group header use banned text-[10px] +
  banned stone-400/stone-500 pair
status: closed
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-20T20:18:06Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-02:bolt-1'
bolt: 1
upstream_stage: null
---

## Problem

DESIGN-BRIEF §2 Typography Floor (lines 123–128) declares:
> `text-[10px]` and `text-[9px]` are BANNED for user-facing content.

And §2 Banned Text-on-Surface Pairs (lines 132–141) lists:
> `text-stone-400` on white / stone-50 / stone-100 / etc. — FAILS AA (< 4.5:1)
> `text-stone-500` (dark mode) on stone-800 / stone-900 — FAILS AA

Yet three primary components spec themselves with exactly those banned tokens:

1. **`FeedbackItem` compact metadata row** (line 257):
   ```
   Third row: `text-[10px] text-stone-400 dark:text-stone-500` metadata line
   ```
   Double violation: banned size + banned color pair (light & dark).

2. **`FeedbackList` visit-group header** (line 308):
   ```
   text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500
   ```
   Same double violation.

3. **`AgentFeedbackToggle` muted count chip** (line 363):
   ```
   text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400 px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800
   ```
   `text-[10px]` banned outright (size rule has no exception for semibold/bold — only `text-[11px]` carries that exception per line 126). Also `text-stone-500` on `bg-stone-100` measures 4.40:1 which DESIGN-TOKENS §1.1a line 56 explicitly flags as a **FAIL** on body text.

DESIGN-TOKENS §2.4 Visit Counter (line 419) and §2.5 Panel Section Dividers (line 474) and §7 Composite Token Reference (line 655) also spec `text-[10px] font-bold`. This is either a legitimate exception (glyph circles per line 127 — "Decorative aria-hidden glyphs inside 16px status-signal circles use `text-xs font-bold`"... but the token sample is `text-[10px]`, not `text-xs`) or another violation.

## Impact

Three components named in §2 (FeedbackItem, FeedbackList, AgentFeedbackToggle) carry hard-coded tokens that their own brief bans. Implementers grep-checking against the typography floor will either (a) implement the violating tokens verbatim and fail the grep gate, or (b) silently lift to `text-xs` and diverge from the written spec.

Visit-counter and panel section dividers in DESIGN-TOKENS need the same reconciliation — either lift to `text-xs` and accept the fit tradeoff, or add an explicit `font-semibold/font-bold` exemption to the brief's §2 floor table.

## Fix

1. DESIGN-BRIEF line 257: metadata line → `text-xs text-stone-600 dark:text-stone-300` (meets contrast + size floor; matches DESIGN-TOKENS §1.1 "Text (muted, AAA)" row).
2. DESIGN-BRIEF line 308: group header → `text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300`.
3. DESIGN-BRIEF line 363 (AgentFeedbackToggle chip): lift to `text-[11px] font-semibold text-stone-600 dark:text-stone-300` or `text-xs font-semibold text-stone-600 dark:text-stone-300`. Keep the size rule self-consistent.
4. Update DESIGN-TOKENS.md §2.4 line 419, §2.5 line 474, §7 line 655 to match whichever rule wins (either carve out a `font-bold`/`font-semibold` + `text-[10px]` exemption in DESIGN-BRIEF §2 typography floor, or lift all three DESIGN-TOKENS sites to `text-[11px] font-bold`).

## Files
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/DESIGN-BRIEF.md:257, 308, 363`
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md:419, 474, 655`
