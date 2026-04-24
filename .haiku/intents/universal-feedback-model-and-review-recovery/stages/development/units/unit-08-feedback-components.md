---
title: Feedback component cluster
type: implementation
depends_on:
  - unit-04-design-token-system
  - unit-05-a11y-foundations
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
  - stages/design/artifacts/feedback-card-states.html
  - stages/design/artifacts/state-coverage-grid.md
  - stages/design/artifacts/feedback-lifecycle-transitions.html
status: completed
bolt: 2
hat: reviewer
started_at: '2026-04-21T07:27:01Z'
hat_started_at: '2026-04-21T13:25:33Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T07:27:01Z'
    completed_at: '2026-04-21T07:35:43Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T07:35:43Z'
    completed_at: '2026-04-21T07:39:08Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T07:39:08Z'
    completed_at: '2026-04-21T07:46:00Z'
    result: reject
    reason: >-
      REQUEST CHANGES — builder produced zero implementation. No
      packages/haiku-ui/src/components/feedback/ directory exists; react-window
      not added to haiku-ui/package.json; no FeedbackItem / FeedbackList /
      FeedbackStatusBadge / FeedbackOriginIcon / FeedbackSummaryBar / index.ts;
      no __tests__ (state-matrix snapshots, virtualization perf, keyboard-nav,
      aria-label); legacy components/FeedbackPanel.tsx still renders {origin}
      slug (C4 regression guard). Unit branch contains only the planner's
      tactical-plan commit (14a36445). Every completion criterion (C1-C7) fails
      by non-existence of deliverables. Full CoVe evidence + complete bolt-2
      builder checklist in FB-07.
  - hat: builder
    started_at: '2026-04-21T07:46:00Z'
    completed_at: '2026-04-21T13:25:33Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T13:25:33Z'
    completed_at: '2026-04-21T13:36:40Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-08-tactical-plan.md
  - package-lock.json
  - packages/haiku-ui/package.json
  - packages/haiku-ui/src/components/FeedbackPanel.tsx
  - packages/haiku-ui/src/components/feedback/FeedbackItem.tsx
  - packages/haiku-ui/src/components/feedback/FeedbackList.tsx
  - packages/haiku-ui/src/components/feedback/FeedbackOriginIcon.tsx
  - packages/haiku-ui/src/components/feedback/FeedbackStatusBadge.tsx
  - packages/haiku-ui/src/components/feedback/FeedbackSummaryBar.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/FeedbackItem.states.test.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/FeedbackList.keyboard.test.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/FeedbackList.states.test.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/FeedbackList.virtualization.test.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/FeedbackOriginIcon.states.test.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/FeedbackStatusBadge.states.test.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/FeedbackSummaryBar.states.test.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackItem.states.test.tsx.snap
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackList.states.test.tsx.snap
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackOriginIcon.states.test.tsx.snap
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackStatusBadge.states.test.tsx.snap
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackSummaryBar.states.test.tsx.snap
  - packages/haiku-ui/src/components/feedback/__tests__/mockItems.ts
  - packages/haiku-ui/src/components/feedback/index.ts
  - packages/haiku-ui/src/components/feedback/tokens.ts
  - packages/haiku-ui/src/components/feedback/useFeedbackListKeyboardNav.ts
  - stages/development/artifacts/unit-08-review-notes.md
completed_at: '2026-04-21T13:36:40Z'
model: sonnet
---
# Feedback component cluster

The components that render feedback items in any page. Built as a cluster because they share state, tokens, and a11y patterns. Every component covers the full six-state × status-variant matrix per `state-coverage-grid.md`.

## Scope

- `packages/haiku-ui/src/components/feedback/FeedbackItem.tsx` — single row: title, body excerpt, origin badge, status badge, author, timestamp, expand/collapse. `aria-expanded` reflects state; focus preserved across status changes.
- `FeedbackList.tsx` — list with visit-grouped headers. **Virtualization via `react-window` (new dep declared in haiku-ui package.json) when item count exceeds 50.** `FeedbackItem` nodes beyond the viewport window are unmounted.
- `FeedbackStatusBadge.tsx` — variants: pending, addressed, closed, rejected. Tokens per DESIGN-TOKENS §2.1 / DESIGN-BRIEF §2 (including the contrast-resolved rejected variant at `text-stone-600 dark:text-stone-300`). Every instance has `aria-label="Status: {status}"` — regression guard for inconsistent-aria-label class.
- `FeedbackOriginIcon.tsx` — canonical emoji map: `🔍 adversarial-review`, `👤 user-visual`, `🧩 user-chat`, `📦 external-pr`, etc. Visible label uses `originLabels[origin]`, not the raw slug — regression guard for slug-rendering class.
- `FeedbackSummaryBar.tsx` — count breakdown by status at list top.

**Keyboard navigation + virtualization coordination:**
- ArrowDown/Up on focused `FeedbackItem` advances focus to the next/prev item.
- When the next/prev item is outside the rendered window, the virtualizer scrolls to mount it first; focus lands on the newly-mounted item in the next paint (verified in tests).
- Enter activates the focused item (toggles expand/collapse).

**State matrix tests:**
- For each component above, a Vitest + RTL snapshot test at `packages/haiku-ui/src/components/feedback/__tests__/<Component>.states.test.tsx` renders every cell of the (default | hover | focus | active | disabled | error) × status-variant grid and compares against committed snapshots.
- Cardinality ≤ 36 cells per component; components exceeding split into sub-matrices with justified groupings.
- Snapshots include a header recording the token hash (source: `verify-tokens.mjs` output); token-intentional changes update the header + regenerate the snapshot deliberately.

## Out of scope

- Mobile sheet container (unit-10).
- Agent feedback toggle (unit-09).
- Annotation-canvas integration (unit-13).

## Completion Criteria

- Every component's state-matrix snapshot test passes; snapshots exist at `__snapshots__/` and diffs are reviewer-surfaced on change.
- Zero opacity on card roots — `audit-banned-patterns.mjs --profile=tokens` catches `opacity-50/60/70` regressions on `<FeedbackItem>` root.
- Every status badge carries `aria-label="Status: {status}"` — RTL test asserts presence on all four status variants.
- Origin icons render via `originLabels[origin]` — `audit-banned-patterns.mjs` regex `\{origin\}(?!Labels)` returns zero hits in feedback component source.
- Virtualization perf test: render `FeedbackList` with 500 mock items, query `document.querySelectorAll('[data-testid="feedback-item"]').length` ≤ 30 at steady state.
- Keyboard nav test: render list of 100 items, press ArrowDown from index 0 to 99 in a loop, assert focus lands on the correct item at each step (no skips, no dropped keystrokes).
- `npx tsc --noEmit` passes.
