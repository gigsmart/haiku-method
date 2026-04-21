---
title: Review page — desktop + mobile
type: implementation
depends_on:
  - unit-06-shell-and-routing
  - unit-08-feedback-components
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
  - stages/design/artifacts/feedback-inline-desktop.html
  - stages/design/artifacts/feedback-inline-mobile.html
  - stages/design/artifacts/comment-to-feedback-flow.html
  - stages/design/artifacts/state-coverage-grid.md
  - stages/design/artifacts/footer-button-copy-spec.md
status: active
bolt: 1
hat: reviewer
started_at: '2026-04-21T15:00:25Z'
hat_started_at: '2026-04-21T15:38:15Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T15:00:25Z'
    completed_at: '2026-04-21T15:10:18Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T15:10:18Z'
    completed_at: '2026-04-21T15:38:15Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T15:38:15Z'
    completed_at: null
    result: null
outputs:
  - stages/development/artifacts/unit-07-tactical-plan.md
  - packages/haiku-ui/package.json
  - packages/haiku-ui/playwright.config.ts
  - packages/haiku-ui/src/components/ReviewPage.tsx
  - packages/haiku-ui/src/pages/review/ArtifactsPane.tsx
  - packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx
  - packages/haiku-ui/src/pages/review/FooterBar.tsx
  - packages/haiku-ui/src/pages/review/ReviewPage.tsx
  - packages/haiku-ui/src/pages/review/__tests__/responsive.test.tsx
  - packages/haiku-ui/src/pages/review/__tests__/status-announce.test.tsx
  - packages/haiku-ui/src/pages/review/index.tsx
  - packages/haiku-ui/src/pages/review/useIsMobile.ts
  - packages/haiku-ui/test-fixtures/review-feedback-full.json
  - packages/haiku-ui/test-fixtures/review-session-full.json
  - packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap
  - packages/haiku-ui/tests/review-page.spec.ts
  - packages/haiku-ui/vitest.config.ts
---
# Review page — desktop + mobile

Rebuild the review page (stage artifacts + feedback list + annotation canvas + footer actions) to match DESIGN-BRIEF §3-4 and the updated mockups.

## Scope

- `packages/haiku-ui/src/pages/review/ReviewPage.tsx` — composition: `ArtifactsPane` + `FeedbackSidebar` (desktop) or `FeedbackSheet` (mobile, from unit-10).
- `packages/haiku-ui/src/pages/review/ArtifactsPane.tsx` — render stage artifacts (mockups, wireframes, stage-artifacts) per session payload; annotation overlay layer (driven by unit-13).
- `packages/haiku-ui/src/pages/review/FooterBar.tsx` — canonical footer buttons per `footer-button-copy-spec.md` verb matrix: `Dismiss`, `Verify & Close`, `Reopen`. Never `Reject`, standalone `Close`, `Address`, or `Re-open`. Wired to `haiku-api` review-decide route via the typed `ApiClient`.
- Responsive: `xl:flex` desktop split (artifacts left, sidebar `w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]` right), `flex-col` mobile with sheet triggered from the FAB.
- Status-badge transitions announced via `useAnnounce('polite', ...)`.

**Visual regression — concrete harness:**
- Playwright tests at `packages/haiku-ui/tests/review-page.spec.ts`:
  - Viewports: 1440×900 desktop, 390×844 mobile.
  - Fixture session: `packages/haiku-ui/test-fixtures/review-session-full.json` (realistic payload committed in this unit — 20 feedback items across all statuses).
  - Compares against `packages/haiku-ui/tests/__snapshots__/review-page-{desktop,mobile}.png` using `expect(page).toHaveScreenshot({ maxDiffPixelRatio: 0.005 })`. Baselines captured by the unit author against the design HTML mockups in the same viewport.
- Responsive-parity test at `packages/haiku-ui/src/pages/review/__tests__/responsive.test.tsx`:
  - Renders ReviewPage with same fixture at desktop + mobile viewports.
  - Extracts text content of every rendered feedback item via `screen.findAllByRole('listitem')`.
  - Asserts the two arrays are element-wise equal — "identical data" is mechanically proven.

## Out of scope

- Annotation canvas interactions (unit-13).
- FeedbackList / FeedbackItem internals (unit-08).
- FeedbackSheet mobile dialog semantics (unit-10).
- AgentFeedbackToggle (unit-09).

## Completion Criteria

- ReviewPage renders at `/review/:id` and `/review/current`.
- Footer buttons use only canonical verbs — `audit-banned-patterns.mjs --profile=tokens` invoked on the page source returns zero hits for banned verbs.
- Responsive breakpoints match DESIGN-TOKENS `--breakpoint-*` values (no literal breakpoint values in the page source).
- Every interactive element has `focusRingClass` — audit-banned-patterns catches `focus:ring-1` regressions.
- Playwright screenshot diffs ≤ 0.5% per URL at both viewports.
- Responsive-parity test passes.
- `useAnnounce` fires on status-badge transitions — RTL test triggers a status change and asserts live-region text updates.
- `npx tsc --noEmit` passes.
