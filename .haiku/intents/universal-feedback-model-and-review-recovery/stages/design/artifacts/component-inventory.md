# Component Inventory — Canonical Names (alias / cross-reference)

**Unit:** `unit-14-component-naming-and-copy` (original); `unit-17-design-brief-tokens-alignment` (canonicalized into DESIGN-BRIEF §2)
**Closes:** FB-27 (component naming divergence), FB-36 (sidebar segmented control contradicts unit-05), FB-41 (retired components authoritative list)

> **Alias notice.** As of unit-17, the authoritative component inventory lives in **DESIGN-BRIEF.md §2 → "New Components"** (for live components) and **DESIGN-BRIEF.md §2 → "Retired Components"** (for retired names and their replacements). Every component row in this file cross-links back to DESIGN-BRIEF §2 rather than duplicating per-component specs. If this file disagrees with DESIGN-BRIEF §2, DESIGN-BRIEF §2 wins.

This file is retained as a naming-convention rationale reference — the pattern-language rules below (PascalCase, full words, no platform prefixes) are the governing principles that shaped every name in DESIGN-BRIEF §2. Every row follows the existing review-app pattern language in `packages/haiku/review-app/src/components/`: **PascalCase, full words, no abbreviations, no platform prefixes** (e.g. `ReviewSidebar`, `StatusBadge`, `AnnotationCanvas`, `InlineComments`).

---

## Pattern Language (Non-Negotiable)

- PascalCase (`FeedbackStatusBadge`, not `feedbackStatusBadge` or `feedback_status_badge`).
- Full words — no abbreviations. Existing codebase has `AnnotationCanvas` not `AnnotCanv`, `InlineComments` not `InlineCmts`.
- No platform prefix (`Mobile`, `Desktop`, `Tablet`) unless the component genuinely renders across platforms and needs a sibling variant. Responsive behavior is baked into a single component when possible.
- No location prefix (`Sidebar`, `Footer`) unless the component is scoped to that surface AND not reusable. `StatusBadge` is shared; a hypothetical `SidebarStatusBadge` would only exist if it diverged meaningfully.
- Noun phrases for things (`FeedbackItem`, `FeedbackList`). Verb phrases only for controls whose label IS the verb (`AgentFeedbackToggle` is acceptable because "toggle" is the control type — it's a switch, same pattern as React Native's `Toggle`).

---

## New Components

Full per-component specs (props, visual mapping, state tables, ARIA) live in **DESIGN-BRIEF §2 → "New Components"**. The rows below are thin pointers plus the naming-convention rationale for each — do not duplicate the spec here.

| Name | Role | Spec location | Naming rationale |
|---|---|---|---|
| `FeedbackStatusBadge` | Status badge (`pending` / `addressed` / `closed` / `rejected`) | DESIGN-BRIEF §2 `FeedbackStatusBadge` | Mirrors existing `StatusBadge` with feedback-specific color mapping — same `Feedback*` family as other feedback components. |
| `FeedbackOriginIcon` | Origin icon + label for `adversarial-review` / `external-pr` / `external-mr` / `user-visual` / `user-chat` / `agent` | DESIGN-BRIEF §2 `FeedbackOriginIcon` | Noun phrase, scoped to feedback surface, follows `*Icon` suffix convention from common UI libs; full word (not `FeedbackOriginIco`). |
| `FeedbackItem` | Single feedback item (compact + expanded) | DESIGN-BRIEF §2 `FeedbackItem` | Primary building block; noun phrase, consistent with `SidebarComment` which is the closest existing analogue. |
| `FeedbackList` | Unified Comments list — user-origin items always, agent-origin items when `showAgent`, grouped by visit, status-pill filtered | DESIGN-BRIEF §2 `FeedbackList` | Renders the unified Comments list unit-05 prescribed. Does NOT split by identity; population is determined by `AgentFeedbackToggle` + status pill state. |
| `FeedbackSummaryBar` | Aggregate status count strip above the list | DESIGN-BRIEF §2 `FeedbackSummaryBar` | Noun phrase, full word (`Bar`, not `Strp`). |
| `AgentFeedbackToggle` | `role="switch"` that reveals agent-origin items inline in the unified Comments list | DESIGN-BRIEF §2 `AgentFeedbackToggle` | Unit-05 introduced the concept but assigned no PascalCase name; unit-14 fixed that. The name is a noun phrase describing what the control operates on (agent feedback) plus the control type (toggle / switch). Ties into unit-13's switch-role ARIA spec. For retirement context see DESIGN-BRIEF §2 "Retired Components". |
| `FeedbackSheet` | Full-screen sheet overlay used on mobile breakpoints | DESIGN-BRIEF §2 / §4 Responsive Behavior | The `Mobile` prefix was redundant — this component only renders on mobile breakpoints anyway, so the variant is implicit. Matches the review-app convention where `ReviewSidebar` is not called `DesktopReviewSidebar`. If a desktop sheet variant ever appears, the options are (a) bake it into this component as a responsive prop, or (b) split into `DesktopFeedbackSheet` at that time — premature splitting is over-design. For retirement context see DESIGN-BRIEF §2 "Retired Components". |
| `FeedbackFloatingButton` | Floating action button that opens `FeedbackSheet` on mobile | DESIGN-BRIEF §2 / §4 Responsive Behavior | Existing review-app uses full words (`AnnotationCanvas`, `InlineComments`); abbreviations are not acceptable in this codebase. Alternative considered: a shared `FloatingActionButton` primitive with feedback-specific usage. Rejected for v1 — there is no second floating-action use case in the review app today, so extracting the primitive is YAGNI. Revisit if a second floating-action surface appears. For retirement context see DESIGN-BRIEF §2 "Retired Components". |

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

Canonical retired-components list lives in **DESIGN-BRIEF §2 → "Retired Components"** (single source of truth). That table lists every retired name, its live replacement, and a one-line rationale so future readers don't resurrect them.

To keep this alias discoverable from a grep across `stages/design/artifacts/`, the retired names are referenced in-line in the rows above (the "Retirement context see DESIGN-BRIEF §2" pointers on `AgentFeedbackToggle`, `FeedbackSheet`, and `FeedbackFloatingButton`). Do not duplicate the retired-components table here — change DESIGN-BRIEF §2 if a retirement needs to be added or amended.

---

## Cross-References

- DESIGN-BRIEF §9 — file inventory table (driven by this document).
- DESIGN-BRIEF §1 — sidebar layout (unified Comments + AgentFeedbackToggle, no identity segments).
- DESIGN-BRIEF §2 — per-component specs, props, state, ARIA.
- `comments-list-with-agent-toggle.html` — unit-05 wireframe showing the unified list + toggle pattern.
- `footer-button-copy-spec.md` — canonical verb matrix (Dismiss / Verify & Close / Reopen).
- Unit-13 ARIA spec — `AgentFeedbackToggle` switch role and keyboard contract.
