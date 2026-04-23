---
title: FeedbackSheet — mobile dialog semantics + focus trap
type: implementation
depends_on:
  - unit-05-a11y-foundations
  - unit-08-feedback-components
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
  - stages/design/artifacts/feedback-inline-mobile.html
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-21T15:00:28Z'
hat_started_at: '2026-04-21T15:24:45Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T15:00:28Z'
    completed_at: '2026-04-21T15:06:28Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T15:06:28Z'
    completed_at: '2026-04-21T15:24:45Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T15:24:45Z'
    completed_at: '2026-04-21T15:41:11Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-10-tactical-plan.md
  - packages/haiku-ui/BROWSER-SUPPORT.md
  - packages/haiku-ui/src/components/feedback/FeedbackFloatingButton.tsx
  - packages/haiku-ui/src/components/feedback/FeedbackSheet.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/FeedbackFloatingButton.states.test.tsx
  - packages/haiku-ui/src/components/feedback/__tests__/FeedbackSheet.test.tsx
  - packages/haiku-ui/src/components/feedback/index.ts
  - packages/haiku-ui/src/index.css
completed_at: '2026-04-21T15:41:11Z'
model: sonnet
---
# FeedbackSheet — mobile bottom sheet

Proper dialog semantics + focus trap + inert background on the mobile feedback sheet. Regression guard for missing-dialog-role + no-focus-trap + non-inert-background classes.

**Decision — no fallback for browsers without native `<dialog>`.** All modern browsers (Safari 15.4+, Firefox 98+, Chromium all) support native `<dialog>`. Requiring it simplifies the spec and avoids polyfill complexity. Documented in `packages/haiku-ui/BROWSER-SUPPORT.md` as part of this unit.

## Scope

- `packages/haiku-ui/src/components/feedback/FeedbackSheet.tsx`:
  - Native `<dialog>` element with `role="dialog"`, `aria-modal="true"`, `aria-labelledby={titleId}`.
  - Opens via `dialog.showModal()`; closes via `dialog.close()`. Native focus trap + top-layer + background inert handled by the platform.
  - `::backdrop` styled per design; click closes; Escape closes (native).
  - FAB (FeedbackFloatingButton) is the trigger; focus returns to FAB on close via `dialog.addEventListener('close', ...)` saving the activeElement before `showModal`.
  - Slide-up animation gated by `useReducedMotion()`.
- `packages/haiku-ui/BROWSER-SUPPORT.md` — documents `<dialog>` as required; lists minimum browser versions.

## Out of scope

- FeedbackList/FeedbackItem internals (unit-08).
- AgentFeedbackToggle (unit-09 — composed inside the sheet).

## Completion Criteria

- Sheet root has `role="dialog" aria-modal="true" aria-labelledby={titleId}`; the element at `#{titleId}` contains visible text `Feedback` — asserted via RTL.
- On open:
  - Focus lands on the first focusable child (not the dialog itself) — RTL: `expect(within(sheet).getByRole('button', {name: /dismiss/i})).toHaveFocus()`.
  - `document.body` child elements outside the sheet have `inert` set by the native `<dialog>` — verified by querying a known button outside the sheet and asserting `el.closest('[inert]') !== null` OR by native behavior: pressing Tab does not traverse outside the sheet (RTL user-event simulation).
- On close (via Escape, backdrop click, or dismiss button):
  - `dialog.close()` called.
  - Focus returns to FAB — RTL asserts `FAB.toHaveFocus()`.
- Accessibility tree: `screen.getByRole('dialog', { name: /feedback/i })` resolves when open.
- Reduced-motion: with matchMedia stub `reduce`, slide-up animation class is the no-motion variant.
- Browser-support doc exists.
- `npx tsc --noEmit` passes.
