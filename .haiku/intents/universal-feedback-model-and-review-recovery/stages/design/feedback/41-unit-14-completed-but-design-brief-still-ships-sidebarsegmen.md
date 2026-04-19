---
title: >-
  unit-14 "completed" but DESIGN-BRIEF still ships SidebarSegmentedControl +
  Mine split + FAB + MobileFeedbackSheet
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:51:17Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

unit-14 (`unit-14-component-naming-and-copy.md`) status: `completed`. Completion criteria line 120 asserts `SidebarSegmentedControl removed; AgentFeedbackToggle added; FAB abbreviation removed; Mobile prefix resolved`. None of those sweeps landed in DESIGN-BRIEF.md.

Live grep of `DESIGN-BRIEF.md` for the names that were supposed to be removed:
- Line 289: `#### \`SidebarSegmentedControl\`` — section heading still present (including ASCII mockup line 293-296 and prop spec lines 299-302).
- Line 77, 104, 108, 295, 310, 333, 347, 456, 470, 577, 684: 11 references to the "Mine" segmented identity split. unit-14 gate explicitly requires `grep -rEn '\bMine\b' stages/design/DESIGN-BRIEF.md` = 0. Result: 11.
- Line 509: `The FAB and sheet overlay are new components: \`MobileFeedbackSheet\` and \`FeedbackFAB\`.` — both forbidden names still canonicalized.
- Lines 706-708 (File Inventory §9): `SidebarSegmentedControl.tsx`, `MobileFeedbackSheet.tsx`, `FeedbackFAB.tsx` listed as **New** files with no renames applied.

There is no `AgentFeedbackToggle` entry in DESIGN-BRIEF.md. unit-14 gate line 34-36 requires "`AgentFeedbackToggle` added as a first-class component in DESIGN-BRIEF §9 with props, state, ARIA contract". Result: 0 matches of that component name in DESIGN-BRIEF.md.

Consistency mandate violation: "component naming follows the existing pattern language" is impossible when the brief and the artifacts disagree on which components even exist. Dev stage cannot generate a component inventory from the brief without re-deciding naming questions that unit-14 was supposed to have settled.

Fix plan (matching unit-14 quality gates verbatim):
1. Delete DESIGN-BRIEF §2 "SidebarSegmentedControl" subsection (lines 289-303).
2. Replace DESIGN-BRIEF §1 sidebar ASCII layout (lines 76-97) with the unified Comments + AgentFeedbackToggle pattern.
3. Remove "Mine" segmented identity text (11 occurrences).
4. Add an `AgentFeedbackToggle` component subsection (props, state, ARIA contract citing `role="switch" aria-checked`).
5. Rename §9 File Inventory rows: `SidebarSegmentedControl.tsx` deleted; `MobileFeedbackSheet.tsx` → `FeedbackSheet.tsx` (or split per unit-14 FB-27); `FeedbackFAB.tsx` → `FeedbackFloatingButton.tsx`.
