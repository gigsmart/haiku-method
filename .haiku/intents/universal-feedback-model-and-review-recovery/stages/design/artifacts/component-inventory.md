# Component Inventory — Canonical Names

**Unit:** `unit-14-component-naming-and-copy`
**Closes:** FB-27 (component naming divergence), FB-36 (sidebar segmented control contradicts unit-05)

This file is the single source of truth for every new, renamed, or removed component in the review-app delta. Every row follows the existing review-app pattern language in `packages/haiku/review-app/src/components/`: **PascalCase, full words, no abbreviations, no platform prefixes** (e.g. `ReviewSidebar`, `StatusBadge`, `AnnotationCanvas`, `InlineComments`).

---

## Pattern Language (Non-Negotiable)

- PascalCase (`FeedbackStatusBadge`, not `feedbackStatusBadge` or `feedback_status_badge`).
- Full words — no abbreviations. Existing codebase has `AnnotationCanvas` not `AnnotCanv`, `InlineComments` not `InlineCmts`.
- No platform prefix (`Mobile`, `Desktop`, `Tablet`) unless the component genuinely renders across platforms and needs a sibling variant. Responsive behavior is baked into a single component when possible.
- No location prefix (`Sidebar`, `Footer`) unless the component is scoped to that surface AND not reusable. `StatusBadge` is shared; a hypothetical `SidebarStatusBadge` would only exist if it diverged meaningfully.
- Noun phrases for things (`FeedbackItem`, `FeedbackList`). Verb phrases only for controls whose label IS the verb (`AgentFeedbackToggle` is acceptable because "toggle" is the control type — it's a switch, same pattern as React Native's `Toggle`).

---

## New Components

| Name | Role | Rationale (tied to review-app pattern) |
|---|---|---|
| `FeedbackStatusBadge` | Status badge (`pending` / `addressed` / `closed` / `rejected`) | Mirrors existing `StatusBadge` with feedback-specific color mapping — same `Feedback*` family as other feedback components. |
| `FeedbackOriginIcon` | Origin icon + label for `adversarial-review` / `external-pr` / `external-mr` / `user-visual` / `user-chat` / `agent` | Noun phrase, scoped to feedback surface, follows `*Icon` suffix convention from common UI libs; full word (not `FeedbackOriginIco`). |
| `FeedbackItem` | Single feedback item (compact + expanded) | Primary building block; noun phrase, consistent with `SidebarComment` which is the closest existing analogue. |
| `FeedbackList` | Unified Comments list — user-origin items always, agent-origin items when `showAgent`, grouped by visit, status-pill filtered | Renders the unified Comments list unit-05 prescribed. Does NOT split by identity; population is determined by `AgentFeedbackToggle` + status pill state. |
| `FeedbackSummaryBar` | Aggregate status count strip above the list | Noun phrase, full word (`Bar`, not `Strp`). |
| `AgentFeedbackToggle` | `role="switch"` that reveals agent-origin items inline in the unified Comments list | **Canonical replacement for the retired `SidebarSegmentedControl`.** Unit-05 introduced the concept but assigned no PascalCase name; this unit fixes that. The name is a noun phrase describing what the control operates on (agent feedback) plus the control type (toggle / switch). Ties into unit-13's switch-role ARIA spec. |
| `FeedbackSheet` | Full-screen sheet overlay used on mobile breakpoints | **Renames `MobileFeedbackSheet`**. The `Mobile` prefix was redundant — this component only renders on mobile breakpoints anyway, so the variant is implicit. Matches the review-app convention where `ReviewSidebar` is not called `DesktopReviewSidebar`. If a desktop sheet variant ever appears, the options are (a) bake it into this component as a responsive prop, or (b) split into `DesktopFeedbackSheet` at that time — premature splitting is over-design. |
| `FeedbackFloatingButton` | Floating action button that opens `FeedbackSheet` on mobile | **Renames `FeedbackFAB`**. `FAB` is an abbreviation; existing review-app uses full words (`AnnotationCanvas`, `InlineComments`). Alternative considered: a shared `FloatingActionButton` primitive with feedback-specific usage. Rejected for v1 — there is no second floating-action use case in the review app today, so extracting the primitive is YAGNI. Revisit if a second FAB surface appears. |

---

## Modified Components

| Name | Change | Rationale |
|---|---|---|
| `ReviewSidebar` | Render unified Comments list + `AgentFeedbackToggle` + status filter pills, handle feedback fetching, per-item CRUD submission | Sidebar structure reconciles with unit-05's unified list + toggle pattern (FB-36). No `sidebarView` state anymore. |
| `ReviewPage` | Pass `intentSlug` + `stageName` to sidebar | Enables CRUD API calls from the sidebar. |
| `InlineComments` | No structural change | Continues to bubble comments up via `onCommentsChange`; sidebar handles persistence. |
| `AnnotationCanvas` | No structural change | Same as `InlineComments`. |
| `useSession` hook | Add `useFeedback` + CRUD helpers (`createFeedback`, `updateFeedbackStatus`, `deleteFeedback`) | Standard fetch pattern with `"bypass-tunnel-reminder": "1"` header. |
| `types.ts` | Add `FeedbackItemData` interface | Shared by all `Feedback*` components. |
| `index.css` | Add feedback status left-border styles + `FeedbackFloatingButton` pulse animation (with `prefers-reduced-motion` guard) | Only for descendant selectors and animations that are cumbersome inline. |

---

## Retired Components (Dropped from Inventory)

Each retirement lists the former name, what took its place, and why it was wrong to keep.

| Former name | Replaced by | Reason |
|---|---|---|
| `SidebarSegmentedControl` | `AgentFeedbackToggle` + unified Comments list (no segments) | H·AI·K·U has no concept of user identity (no login, no per-user state). A two-segment identity split ("mine" vs "not mine") is undefined in this system. See unit-05 rationale and `comments-list-with-agent-toggle.html`. Also: `Sidebar*` prefix was wrong — if a segmented control were ever justified, the component would be called `SegmentedControl` and live as a reusable primitive. |
| `MobileFeedbackSheet` | `FeedbackSheet` | Redundant platform prefix; the sheet only ever renders on mobile breakpoints, so the variant is implicit. Matches existing convention (`ReviewSidebar`, not `DesktopReviewSidebar`). |
| `FeedbackFAB` | `FeedbackFloatingButton` | `FAB` is an abbreviation; existing components use full words (`AnnotationCanvas`, `InlineComments`). Full-word naming is non-negotiable across the review-app. |

---

## Cross-References

- DESIGN-BRIEF §9 — file inventory table (driven by this document).
- DESIGN-BRIEF §1 — sidebar layout (unified Comments + AgentFeedbackToggle, no identity segments).
- DESIGN-BRIEF §2 — per-component specs, props, state, ARIA.
- `comments-list-with-agent-toggle.html` — unit-05 wireframe showing the unified list + toggle pattern.
- `footer-button-copy-spec.md` — canonical verb matrix (Dismiss / Verify & Close / Reopen).
- Unit-13 ARIA spec — `AgentFeedbackToggle` switch role and keyboard contract.
