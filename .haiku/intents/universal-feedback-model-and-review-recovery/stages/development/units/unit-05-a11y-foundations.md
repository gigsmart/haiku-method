---
title: 'A11y foundations — landmarks, live regions, focus, keyboard nav'
type: implementation
depends_on:
  - unit-04-design-token-system
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
  - stages/design/artifacts/aria-landmark-spec.md
  - stages/design/artifacts/aria-live-sequencing-spec.md
  - stages/design/artifacts/keyboard-shortcut-map.html
  - stages/design/artifacts/focus-ring-spec.html
  - stages/design/artifacts/skip-link-spec.html
  - stages/design/artifacts/touch-target-audit.md
  - stages/design/artifacts/motion-and-reduced-motion-spec.md
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-21T06:58:35Z'
hat_started_at: '2026-04-21T07:22:39Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T06:58:35Z'
    completed_at: '2026-04-21T07:04:11Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T07:04:11Z'
    completed_at: '2026-04-21T07:22:39Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T07:22:39Z'
    completed_at: '2026-04-21T07:25:29Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-05-tactical-plan.md
  - package-lock.json
  - packages/haiku-ui/src/a11y/__tests__/focus.test.tsx
  - packages/haiku-ui/src/a11y/__tests__/keyboard.test.tsx
  - packages/haiku-ui/src/a11y/__tests__/landmarks.test.tsx
  - packages/haiku-ui/src/a11y/__tests__/live-regions.test.tsx
  - packages/haiku-ui/src/a11y/__tests__/matchMedia.stub.ts
  - packages/haiku-ui/src/a11y/__tests__/reduced-motion.test.tsx
  - packages/haiku-ui/src/a11y/__tests__/touch-target.test.tsx
  - packages/haiku-ui/src/a11y/focus.ts
  - packages/haiku-ui/src/a11y/index.ts
  - packages/haiku-ui/src/a11y/keyboard.ts
  - packages/haiku-ui/src/a11y/landmarks.tsx
  - packages/haiku-ui/src/a11y/live-regions.tsx
  - packages/haiku-ui/src/a11y/reduced-motion.ts
  - packages/haiku-ui/src/a11y/touch-target.ts
  - packages/haiku-ui/src/index.css
completed_at: '2026-04-21T07:25:29Z'
model: sonnet
---
# A11y foundations

Establish the accessibility layer every feature component builds on: canonical aria-landmarks, live-region sequencing, focus-ring tokens, keyboard navigation primitives, touch-target helpers, reduced-motion guards.

## Scope

- `packages/haiku-ui/src/a11y/landmarks.tsx` — `<Header>`, `<Main>`, `<Aside>`, `<Nav aria-label="...">`, `<FooterBar>` primitives per `aria-landmark-spec.md §1-2`.
- `packages/haiku-ui/src/a11y/live-regions.tsx` — `<LiveRegion id="feedback-live-polite" aria-live="polite">` + `<LiveRegion id="feedback-live-assertive" aria-live="assertive" role="alert">` mounted once in the shell. `useAnnounce(severity, message)` hook targets only those two IDs per `aria-live-sequencing-spec.md §2.2` + `§3.1`.
- `packages/haiku-ui/src/a11y/focus.ts`:
  - `focusRingClass` — canonical token per `focus-ring-spec.html`.
  - `focusVisibleOnly(...)` helper.
  - `useFocusTrap(ref, enabled)` — traps Tab/Shift+Tab wrap, ignores disabled elements, restores focus to the trigger on close.
- `packages/haiku-ui/src/a11y/keyboard.ts` — `useShortcut(key, handler, { scope })` hook. Keyboard-shortcut-map is parsed from `keyboard-shortcut-map.html §2` (bindings table) at dev time; scope-conflict detection **throws in dev mode** on duplicate `(key, scope)` bindings. Conflict rule test covers `R` (review shortcut) overlapping SR browse mode — guard must scope R to contexts where SR isn't in browse mode.
- `packages/haiku-ui/src/a11y/touch-target.ts` — `touchTargetClass` utility that renders a transparent `::before` hit-zone of ≥44×44 without changing visible geometry. Per `touch-target-audit.md §2-3`.
- `packages/haiku-ui/src/a11y/reduced-motion.ts` — `useReducedMotion()` + `motionSafeClass`. Per `motion-and-reduced-motion-spec.md`.

**Test harness notes:**
- Tests under `a11y/__tests__/` use Vitest with `@testing-library/react`. JSDOM's `matchMedia` is stubbed via `packages/haiku-ui/src/a11y/__tests__/matchMedia.stub.ts` — exports a helper that installs a controllable `matchMedia` before the test and emits `change` events to verify `useReducedMotion` reactivity.

## Out of scope

- Applying these to specific feature components (per-component units).
- Adding new shortcuts beyond what `keyboard-shortcut-map.html` defines.

## Completion Criteria

- Every primitive above exists and exports from `packages/haiku-ui/src/a11y/index.ts`.
- `useShortcut` throws on duplicate bindings within a scope — verified by a test that registers a duplicate and asserts it throws with `KeyboardShortcutConflict`.
- `useFocusTrap` tests:
  - Focus on open lands on first focusable child (not the container).
  - Tab from last focusable wraps to first; Shift+Tab from first wraps to last.
  - Disabled elements skipped.
  - On close, focus returns to the element that had focus at open.
- `touchTargetClass` — test renders a 20×20 icon button, measures `getBoundingClientRect()` on the wrapper, asserts ≥44×44.
- `useReducedMotion` test uses the `matchMedia.stub.ts` helper, emits a `change` event from `no-preference` → `reduce`, asserts the hook's return value updates via `rerender`.
- `useAnnounce` test: calls with `('polite', 'hello')`, queries `#feedback-live-polite`, asserts it contains `hello`; same for assertive.
- `npx tsc --noEmit` passes.
- `npm test -w haiku-ui` passes.
