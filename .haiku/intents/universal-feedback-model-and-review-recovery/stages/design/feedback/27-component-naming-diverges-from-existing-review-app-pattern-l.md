---
title: Component naming diverges from existing review-app pattern language
status: closed
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-17T22:31:35Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
closed_by: unit-14-component-naming-and-copy
---

The mandate requires "component naming follows the existing pattern language." The existing review app (`packages/haiku/review-app/src/`) uses `PascalCase` component names with a consistent shape: `ReviewSidebar`, `ReviewPage`, `StatusBadge`, `SidebarComment`, `InlineComments`, `AnnotationCanvas`.

DESIGN-BRIEF §2 introduces these new components (lines 692-702):
- `FeedbackStatusBadge` — follows pattern (good)
- `FeedbackOriginIcon` — follows pattern (good)
- `FeedbackItem` — follows pattern (good)
- `FeedbackList` — follows pattern (good)
- `FeedbackSummaryBar` — follows pattern (good)
- `SidebarSegmentedControl` — inconsistent. The existing sidebar tabs component is not prefixed with `Sidebar`; sibling `ReviewSidebar` owns its internal tabs inline. If this is a reusable component, it should be `SegmentedControl`; if scoped to the sidebar, it should be implemented inline. Also — this component is rejected by unit-05 (see separate feedback item) so may not survive at all.
- `MobileFeedbackSheet` — inconsistent. The pattern would be `FeedbackSheet` with responsive behavior baked in, or `MobileSheet` as a reusable mobile sheet. Coupling "Mobile" + "Feedback" in the name is redundant once feedback is the only sheet use case.
- `FeedbackFAB` — inconsistent. `FAB` is an abbreviation; existing code uses full words (e.g., `AnnotationCanvas`, not `AnnotCanv`). Prefer `FeedbackFloatingButton` or just `FloatingActionButton` as a shared primitive.

Also — unit-05's `comments-list-with-agent-toggle.html` introduces a conceptual component called "agent-feedback toggle" but no PascalCase name is assigned. If this ships instead of `SidebarSegmentedControl`, it needs a canonical name (e.g., `AgentFeedbackToggle`) added to the file inventory.

Fix: reconcile the DESIGN-BRIEF §9 file inventory with the existing naming pattern. Drop `Mobile` prefix, expand `FAB`, and align with unit-05's decision on the sidebar structure so there is a single canonical component list for development.
