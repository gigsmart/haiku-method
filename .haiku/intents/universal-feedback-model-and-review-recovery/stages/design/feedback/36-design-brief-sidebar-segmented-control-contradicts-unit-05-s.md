---
title: >-
  DESIGN-BRIEF sidebar segmented control contradicts unit-05's unified comments
  list
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-17T22:32:38Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

`DESIGN-BRIEF.md §1` (lines 99-108) and `§2` (lines 287-300) spec a `SidebarSegmentedControl` component with two segments "Feedback (default)" and "Mine", including full props, state, and ARIA (`role="tablist"`). 14 mentions of "Mine"/"Feedback" segmentation in the brief.

But `unit-05-feedback-lifecycle-ownership.md:41` and its output artifact `comments-list-with-agent-toggle.html:18-34` explicitly reject that design:
> "No 'Mine / Feedback' segmented control. ... H·AI·K·U has no concept of user identity. There is no login, no per-user state — the review app is a local surface. 'Mine' is undefined."

Instead unit-05 ships a unified "Comments" list with an agent-feedback toggle overlay. Both designs now live in the stage's output — the DESIGN-BRIEF prescribes one sidebar structure, the active wireframes prescribe another.

The development stage cannot build both. Either:
1. Update DESIGN-BRIEF §1 and §2 to remove the Feedback/Mine segmented control and replace with the agent-feedback toggle pattern from unit-05, OR
2. Revert unit-05's rationale.

Recommend (1) since the unit-05 rationale is sound. Also remove the `SidebarSegmentedControl` from the "New Components" inventory (§2), update the `ReviewSidebar.tsx` state block (DESIGN-BRIEF line 312), and update the sidebar ASCII layout (lines 76-97) so downstream docs aren't misled.

Old wireframes that still show the segmented control (`feedback-inline-desktop.html` has segmented filter pills labeled "Pending/Addressed/All" per unit-01 — that's the related-but-different direction) should also be reconciled with unit-05.
