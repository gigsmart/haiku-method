---
title: >-
  DESIGN-TOKENS §2.6 resolution-action buttons use retired verbs, diverges from
  canonical footer-button matrix
status: closed
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-20T20:19:06Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-04:bolt-1'
bolt: 1
upstream_stage: null
---

## Problem

DESIGN-BRIEF §2 "Footer Button Copy — Canonical Status × Origin Matrix" (lines 536–586) is declared "the single source of truth for every footer-button label in the feedback UI", with the canonical verb set:

- `pending → rejected` = **Dismiss** (not "Reject")
- `addressed → closed` = **Verify & Close** (not standalone "Close")
- any reopen = **Reopen** (one word)

And the Banned variants list (lines 577–583) explicitly bans:
- `"Close"` as a standalone verb on a pending item (ambiguous with "Verify & Close")
- `"Reject"` (replaced by "Dismiss")

DESIGN-TOKENS.md §2.6 "Feedback Resolution Actions" (lines 504–532) specifies four buttons with the retired copy:
```
// Address button    (no such user action in the brief matrix)
// Reject button     (BANNED per DESIGN-BRIEF §2 line 579)
// Close button      (ambiguous — should be "Verify & Close")
// Reopen button
```

None of these map cleanly to the brief's status-transition matrix:
- There is no `pending → addressed` user action in the brief (only the agent/system moves an item to `addressed` via `addressed_by` claim) — so "Address" has no analog in §3's Feedback Status Transitions table.
- "Reject" is banned in favor of "Dismiss".
- "Close" should read "Verify & Close" and only appears on `addressed` items.

## Impact

DESIGN-TOKENS is positioned as the token reference implementers copy from. A dev landing on §2.6 will ship buttons labeled `Address`, `Reject`, `Close`, `Reopen` — three of four are off-spec. The copy-deck grep audit referenced in the brief will then fail with banned-variant hits.

Additionally, the button styling in §2.6 doesn't match the brief's §2 Button style per verb table (lines 562–567):
- DESIGN-TOKENS "Reject" uses `bg-stone-100 text-stone-500`; DESIGN-BRIEF "Dismiss" uses `border border-stone-300 text-stone-700 bg-white`. Different backgrounds.
- DESIGN-TOKENS "Close" uses `bg-green-50 text-green-700 hover:bg-green-100` (muted); DESIGN-BRIEF "Verify & Close" uses `bg-green-600 hover:bg-green-700 text-white` (primary). Fundamentally different visual weight — primary vs tertiary.

## Fix

Rewrite DESIGN-TOKENS.md §2.6 to mirror DESIGN-BRIEF §2 Footer Button Copy table exactly:

| Verb | Visual role | Tailwind |
|---|---|---|
| **Dismiss** | Secondary (muted) | `border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 bg-white dark:bg-stone-900` |
| **Verify & Close** | Primary (positive) | `bg-green-600 hover:bg-green-700 text-white` |
| **Reopen** | Secondary (muted) | Same as Dismiss |

Drop the "Address" button entirely (no such user action in the matrix). Update the section to explicitly cross-reference DESIGN-BRIEF §2 as the canonical source so future drift is prevented.

## Files
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md:504-532`
- Canonical rule: `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/DESIGN-BRIEF.md:536-586`
