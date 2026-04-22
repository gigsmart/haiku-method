---
title: Annotation canvas UX
type: implementation
depends_on:
  - unit-01-extract-haiku-api-package
  - unit-05-a11y-foundations
  - unit-07-review-page-desktop-and-mobile
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
  - stages/design/artifacts/annotation-popover-states.html
  - stages/design/artifacts/annotation-gesture-spec.html
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-21T18:51:58Z'
hat_started_at: '2026-04-21T19:21:09Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T18:51:58Z'
    completed_at: '2026-04-21T19:00:06Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T19:00:06Z'
    completed_at: '2026-04-21T19:21:09Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T19:21:09Z'
    completed_at: '2026-04-21T19:27:15Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-13-tactical-plan.md
  - package-lock.json
  - packages/haiku-api/src/schemas/feedback.ts
  - packages/haiku-ui/audit-config.json
  - packages/haiku-ui/src/pages/direction/__tests__/DirectionPage.test.tsx
  - packages/haiku-ui/src/pages/question/__tests__/QuestionPage.test.tsx
  - packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx
  - packages/haiku-ui/src/pages/review/__tests__/AnnotationCanvas.test.tsx
  - packages/haiku-ui/src/pages/review/__tests__/layout.test.tsx
  - packages/haiku-ui/src/pages/review/__tests__/responsive.test.tsx
  - packages/haiku-ui/src/pages/review/__tests__/status-announce.test.tsx
  - packages/haiku-ui/tests/annotation-perf.spec.tsx
  - packages/haiku-ui/tests/audit-banned-patterns.test.ts
  - stages/development/artifacts/unit-13-review-findings.md
completed_at: '2026-04-21T19:27:15Z'
model: sonnet
---
# Annotation canvas UX

Pin-drop + popover UX for annotating stage artifacts. Regression guard for pin-markers-at-tabindex-negative-one + draft-data-loss classes.

## Popover semantics decision

**Non-modal popover.** The popover anchors to a pin, does not take focus aggressively, and dismisses on blur/Escape. This matches the annotation UX where users drag/zoom artifacts behind the popover. Semantics: `role="group"` with `aria-labelledby={titleId}` and `aria-label="Annotation draft"`. NOT `role="dialog"`. Manual focus management on open/close.

## Scope

- `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx`:
  - Overlay layer over `ArtifactsPane` using **a single delegated pointer listener + single delegated keydown listener** on the canvas root. No per-pin event handlers (verified by listener-count test).
  - Pin markers as `<button>` elements with `tabindex="0"`. Regression guard: `audit-banned-patterns.mjs --profile=tokens` catches `tabindex=["']-1["']` in `AnnotationCanvas.tsx`.
  - Popover on click/focus with draft form; validated against `haiku-api`'s `FeedbackCreateRequest` **including the `anchor` field** (pageId, x, y, viewportWidth, viewportHeight — added to schema in unit-01).
  - Keyboard:
    - `N` starts a new annotation at current focus anchor.
    - Arrow keys move focus between pins using a pre-sorted index by `(y, x)` rebuilt **only when the pin collection changes**, not per keystroke.
    - `Escape` cancels draft; focus returns to pin.
    - `Enter` saves.
  - Shortcuts registered via `useShortcut` with scope `annotation-canvas` — conflict-checked.

**Draft persistence:**
- Debounce interval: 500ms trailing edge. Verified by fake-timer test.
- Payload cap: 64 KB per session. Oversize drafts drop oldest-pin-first + polite live-region warning.
- Key format: `haiku-ui:annotation-draft:{sessionId}`.
- Cleanup:
  - On successful submit: key deleted.
  - On sheet close: key retained (draft-carry-forward).
  - Boot-time sweep: drafts whose sessionId isn't in the current session payload are deleted.
- localStorage read-back: re-parses against `haiku-api`'s `FeedbackCreateRequest` schema; invalid drafts discarded.
- Quota handling: catches `QuotaExceededError`, surfaces via `useAnnounce('assertive', 'Draft too large to save locally')`.

**XSS hardening:**
- Body rendered as React text children only.
- `audit-banned-patterns.mjs --profile=stage-wide` catches `dangerouslySetInnerHTML`, `innerHTML\\s*=`, `\\beval\\(`, `new Function\\(`, `document\\.write\\(` in annotation path.

**Perf budget:**
- Canvas supports ≥ 200 pins. Playwright perf test at `packages/haiku-ui/tests/annotation-perf.spec.ts`:
  - Mounts canvas with 200 fixture pins.
  - Asserts first paint ≤ 100ms.
  - Presses ArrowRight in a loop 200 times; asserts each keypress-to-paint ≤ 16ms.

## Out of scope

- Backend feedback storage (already shipped).

## Completion Criteria

**Keyboard a11y:**
- Tab reaches canvas; `N` starts annotation at current anchor — verified.
- `audit-banned-patterns.mjs` regex `tabindex=["']-1["']` in `AnnotationCanvas.tsx` returns zero.
- Arrow-key traversal across 200 pins lands focus on the correct pin at each step.

**Draft persistence:**
- Fake-timer test: 10 rapid edits → exactly 1 localStorage write at t=500ms.
- Oversize draft: write 70KB draft, assert oldest pin dropped, `haiku-ui:annotation-draft:{sessionId}` ≤ 64KB.
- Reload survives: mount → draft → unmount → remount with same sessionId → form prefills.
- Real page reload test in Playwright: same behavior.
- Schema re-validation: planted invalid JSON in localStorage → component boots cleanly, key removed.
- Quota: `QuotaExceededError` caught; assertive live-region announces the warning.

**Popover semantics:**
- Popover root has `role="group"` and `aria-labelledby` pointing to its title; `aria-label="Annotation draft"` (redundant but explicit).
- On popover dismiss, focus returns to the pin.

**XSS:**
- `audit-banned-patterns.mjs --profile=stage-wide` returns zero hits for XSS sinks in `pages/review/**`.

**Perf:**
- Listener-count test: with 200 pins mounted, `getEventListeners(canvasRoot)` shows ≤ 3 total (one pointer, one keydown, one document-level focus).
- Perf Playwright test meets 100ms first paint + 16ms/keypress budgets.

- `npx tsc --noEmit` passes.
