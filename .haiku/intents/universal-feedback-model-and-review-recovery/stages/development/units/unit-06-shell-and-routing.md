---
title: Shell and routing refactor
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
  - stages/design/artifacts/aria-landmark-spec.md
  - stages/design/artifacts/skip-link-spec.html
  - stages/design/artifacts/stage-progress-strip.html
status: completed
bolt: 3
hat: reviewer
started_at: '2026-04-21T07:26:57Z'
hat_started_at: '2026-04-21T14:54:42Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T07:26:57Z'
    completed_at: '2026-04-21T07:33:19Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T07:33:19Z'
    completed_at: '2026-04-21T08:00:59Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T08:00:59Z'
    completed_at: '2026-04-21T13:19:14Z'
    result: reject
    reason: >-
      Completion-criterion failure on the Lighthouse gate. (1) FB-08:
      audit-lighthouse.mjs fixture registry uses /api/sessions/:id (plural) but
      the canonical haiku-api path is /api/session/:id (singular) — three of
      four pinned URLs render the "Session not found" error state, so Lighthouse
      measures a11y of an error page rather than the loaded shell. (2) FB-09:
      `node packages/haiku-ui/scripts/audit-lighthouse.mjs` exits 1 (NO_FCP) in
      the test environment, not the required 0. App.tsx shell refactor, routing,
      ThemeToggle, SkipLink, Header, pages/, parity snapshot, and all 95 unit
      tests (tsc + vitest) pass — the shell work is solid; the gate harness
      needs a fix before this unit can be approved.
  - hat: builder
    started_at: '2026-04-21T13:19:14Z'
    completed_at: '2026-04-21T13:35:27Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T13:35:27Z'
    completed_at: '2026-04-21T13:50:20Z'
    result: reject
    reason: >-
      FB-10: audit-lighthouse.mjs static-asset server only matches top-level
      dist entries, so /assets/*.js requests fall through to SPA fallback and
      return HTML. Lighthouse sees a blank page (NO_FCP) on every pinned URL and
      the script exits 1 — completion criterion "exits 0 with a11y score >= 0.95
      on each pinned URL" is not met. All other criteria pass.
  - hat: builder
    started_at: '2026-04-21T13:50:20Z'
    completed_at: '2026-04-21T14:54:42Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T14:54:42Z'
    completed_at: '2026-04-21T14:59:35Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-06-tactical-plan.md
  - package-lock.json
  - packages/haiku-ui/index.html
  - packages/haiku-ui/package.json
  - packages/haiku-ui/src/App.tsx
  - packages/haiku-ui/src/components/DesignPicker.tsx
  - packages/haiku-ui/src/components/Header.tsx
  - packages/haiku-ui/src/components/SkipLink.tsx
  - packages/haiku-ui/src/components/ThemeToggle.tsx
  - packages/haiku-ui/src/components/__tests__/ThemeToggle.test.tsx
  - packages/haiku-ui/src/main.tsx
  - packages/haiku-ui/src/pages/direction/index.tsx
  - packages/haiku-ui/src/pages/index.ts
  - packages/haiku-ui/src/pages/question/index.tsx
  - packages/haiku-ui/src/pages/review-current/index.tsx
  - packages/haiku-ui/src/pages/review/index.tsx
  - packages/haiku-ui/src/routing/__tests__/parseRoute.test.ts
  - packages/haiku-ui/src/routing/parseRoute.ts
  - packages/haiku-ui/src/shell/PageTitleContext.tsx
  - packages/haiku-ui/src/shell/ShellLayout.tsx
  - packages/haiku-ui/src/theme.ts
  - packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap
  - packages/haiku-ui/tests/a11y-pages.spec.tsx
  - packages/haiku-ui/tests/parity.spec.tsx
  - packages/haiku-ui/tests/skip-link.spec.tsx
completed_at: '2026-04-21T14:59:35Z'
model: sonnet
---
# Shell and routing refactor

Rebuild `App.tsx` as a clean shell composing a11y landmarks, theme toggle, and page-routing. Each page-type is a lazy-loaded module consuming the session from `haiku-api`.

## Scope

- `packages/haiku-ui/src/App.tsx` — theme init, landmark composition (`<Header>` / `<Main>` / `<FooterBar>`), route parse, live-region mounts, render matched page. **< 100 lines**.
- `packages/haiku-ui/src/routing/parseRoute.ts` — typed route parser returning `{ pageType: 'review'|'review-current'|'question'|'direction', sessionId: string } | null`.
- `packages/haiku-ui/src/pages/` — one folder per page-type (`review/`, `review-current/`, `question/`, `direction/`).
- `packages/haiku-ui/src/components/ThemeToggle.tsx` — aria-labeled icon-only `<button>`, `aria-label="Toggle theme"`, `touchTargetClass` applied — **regression guard for the icon-only missing-label class of issue**.
- `packages/haiku-ui/src/components/Header.tsx` — canonical app header; brand, active-intent breadcrumb, theme toggle, keyboard-shortcut-help trigger.
- Skip-to-main-content link per `skip-link-spec.html` — first in DOM order in `<Header>`, hidden until focused, jumps to `#main`. **Regression guard for missing-skip-link class of issue.**

**A11y gate:**
- axe-core assertions inside the existing RTL tests — verified by an RTL test that renders each page with a fixture session and runs `axe(container)` asserting zero violations in categories `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`.
- No headless-browser Lighthouse. **Lighthouse was removed** — the chrome-launcher Lighthouse uses was clobbering the developer's local Chrome profile. `packages/haiku-ui/scripts/audit-lighthouse.mjs` and the `lighthouse` / `@lhci/cli` deps must be DELETED if they exist from prior bolts. A proper Playwright-sandboxed axe audit can land as a follow-up unit; out of scope here.

## Out of scope

- Per-page redesign (separate units).
- Annotation canvas UX (unit-13).

## Completion Criteria

- `App.tsx` < 100 lines and contains no page-specific JSX (verified by `wc -l` + grep).
- Route parser handles the four page types and returns null for unknown paths; unknown renders a 404 placeholder using landmark primitives.
- ThemeToggle has `aria-label="Toggle theme"`, switches light/dark, persists via `localStorage`.
- Skip-link renders first in tab order in every page — verified by an RTL test that presses Tab once on page load and asserts the skip link receives focus.
- Existing URL paths (`/review/:id`, `/review/current`, `/question/:id`, `/direction/:id`) render without regression (verified by the unit-03 DOM parity Playwright test, now re-run with the new shell).
- axe-core RTL test passes with zero WCAG 2.1 AA violations across every page (`review`, `review-current`, `question`, `direction`).
- `packages/haiku-ui/scripts/audit-lighthouse.mjs`, `packages/haiku-ui/lighthouserc.json`, and the `lighthouse` / `@lhci/cli` deps are REMOVED from the package (grep confirms zero occurrences).
- `npx tsc --noEmit` passes.
