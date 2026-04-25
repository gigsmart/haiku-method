---
title: >-
  §2 components missing focus/active/disabled/error state rows — hard fails the
  six-state grid rule
status: closed
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-20T20:21:55Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-16:bolt-1'
bolt: 1
upstream_stage: null
---

## Problem

DESIGN-BRIEF §2 state-coverage rule (lines 117–119) is a hard gate:

> **State-coverage requirement (added in unit-15 / FB-25; extended in unit-19 / FB-56).** Every new component in this intent — and every new component introduced in downstream stages — **MUST** ship with a six-state grid (default / hover / focus / active / disabled / error) rendered alongside its component spec.
>
> **FB-56 extension**: every component named in §2 of THIS brief — including `FeedbackStatusBadge`, `FeedbackOriginIcon`, `FeedbackItem` (compact + expanded), `FeedbackList`, `FeedbackSummaryBar`, `AgentFeedbackToggle`, `FeedbackSheet`, `FeedbackFloatingButton`, `AssessorSummaryCard`, `StageProgressStrip`, `RevisitModal` — MUST have an explicit row in `state-coverage-grid.md §7`.

Walking §2's component specs against this rule:

**`FeedbackItem`** (lines 229–279) — Interaction states block (lines 269–277) covers: Default, Hover, Expanded, plus four status variants. **Missing:** focus, active (pressed/clicked), disabled, error. These are all reachable states (card is focusable via `tabIndex={0}` per §6 line 777; error = API failure revert per §3 line 621).

**`FeedbackList`** (lines 282–317) — no state grid at all. Only empty-state copy, grouping rules, sorting. No focus/hover/active/disabled/error coverage.

**`FeedbackSummaryBar`** (lines 320–333) — no state grid. "Clickable counts filter the list" is stated but no hover/focus/active/pressed styling documented.

**`FeedbackOriginIcon`** (lines 197–225) — not interactive, but the "?"-legend popover button mentioned at line 221 has no state coverage.

**`AgentFeedbackToggle`** (lines 337–389) — gives switch OFF/ON + keyboard + focus ring, but doesn't explicitly document hover, active (press-in), disabled, error states.

**`FeedbackFloatingButton`** (line 682) — single size/color token, no state grid.

**`FeedbackSheet`** (line 683) — overlay container, no state grid.

On top of this, `state-coverage-grid.md` — the file the brief designates as the canonical location for these rows — doesn't exist (see FB-09). So the gate can't be satisfied even by materializing the grids.

## Impact

DESIGN-BRIEF §2 line 119: "Adding a new component to §2 without simultaneously adding a row in the grid is a hard fail at the design-reviewer gate."

By the brief's own rule, every new component listed in §2 is a hard fail right now. The design-reviewer gate cannot pass in its current state.

## Fix

Two things must happen:

1. Materialize `stages/design/artifacts/state-coverage-grid.md` with §7 containing one row per §2 component (see FB-09).

2. For each §2 component, either inline-document the six states in the component's own sub-section OR link to the grid. At minimum, the `FeedbackItem` Interaction States table (lines 269–277) needs rows added for:
   - **Focus**: visible teal focus ring per `focus-ring-spec.html §1` + announce state via aria
   - **Active** (mid-click): briefly darker border / background
   - **Disabled**: spec what "disabled" means for a FeedbackItem (loading? rate-limited?) and the visual token, or explicitly declare "not reachable — mark N/A" per line 118
   - **Error**: the per-item error state when a status change API call fails (spec differs from the sidebar-level toast at line 621 — the item itself should show a revert animation)

Same exercise for FeedbackList, FeedbackSummaryBar, AgentFeedbackToggle, FeedbackOriginIcon, FeedbackFloatingButton, FeedbackSheet.

## Files
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/DESIGN-BRIEF.md:117-119` (the rule)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/DESIGN-BRIEF.md:229-389` (under-specified components)
- Missing: `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/state-coverage-grid.md`
