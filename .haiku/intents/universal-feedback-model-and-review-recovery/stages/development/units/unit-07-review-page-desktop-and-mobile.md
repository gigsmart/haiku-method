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
status: completed
bolt: 2
hat: reviewer
started_at: '2026-04-21T15:00:25Z'
hat_started_at: '2026-04-21T17:40:19Z'
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
    completed_at: '2026-04-21T15:46:42Z'
    result: reject
    reason: >-
      Playwright visual-regression harness not runnable: @playwright/test not
      installed, no fixture loader reads ?fixture= querystring, no baseline
      PNGs. Six of seven completion criteria pass (routes, tsc, vitest 176/176,
      audit-banned-patterns 0 hits, focusRingClass coverage, responsive-parity
      test, useAnnounce RTL test). See
      stages/development/artifacts/unit-07-review-findings.md.
  - hat: builder
    started_at: '2026-04-21T15:46:42Z'
    completed_at: '2026-04-21T17:40:19Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T17:40:19Z'
    completed_at: '2026-04-21T18:51:26Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-07-tactical-plan.md
  - packages/haiku-ui/package.json
  - packages/haiku-ui/src/components/ReviewPage.tsx
  - packages/haiku-ui/src/pages/review/ArtifactsPane.tsx
  - packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx
  - packages/haiku-ui/src/pages/review/FooterBar.tsx
  - packages/haiku-ui/src/pages/review/ReviewPage.tsx
  - packages/haiku-ui/src/pages/review/__tests__/layout.test.tsx
  - packages/haiku-ui/src/pages/review/__tests__/responsive.test.tsx
  - packages/haiku-ui/src/pages/review/__tests__/status-announce.test.tsx
  - packages/haiku-ui/src/pages/review/index.tsx
  - packages/haiku-ui/src/pages/review/useIsMobile.ts
  - packages/haiku-ui/test-fixtures/review-feedback-full.json
  - packages/haiku-ui/test-fixtures/review-session-full.json
  - packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap
  - packages/haiku-ui/vitest.config.ts
  - stages/development/artifacts/unit-07-review-findings.md
completed_at: '2026-04-21T18:51:26Z'
model: sonnet
---
# Review page — desktop + mobile

Rebuild the review page (stage artifacts + feedback list + annotation canvas + footer actions) to match DESIGN-BRIEF §3-4 and the updated mockups.

## Scope

- `packages/haiku-ui/src/pages/review/ReviewPage.tsx` — composition: `ArtifactsPane` + `FeedbackSidebar` (desktop) or `FeedbackSheet` (mobile, from unit-10).
- `packages/haiku-ui/src/pages/review/ArtifactsPane.tsx` — render stage artifacts (mockups, wireframes, stage-artifacts) per session payload; annotation overlay layer (driven by unit-13).
- `packages/haiku-ui/src/pages/review/FooterBar.tsx` — canonical footer buttons per `footer-button-copy-spec.md` verb matrix: `Dismiss`, `Verify & Close`, `Reopen`. Never `Reject`, standalone `Close`, `Address`, or `Re-open`. Wired to `haiku-api` review-decide route via the typed `ApiClient`.
- Responsive: `xl:flex` desktop split (artifacts left, sidebar `w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]` right), `flex-col` mobile with sheet triggered from the FAB.
- Status-badge transitions announced via `useAnnounce('polite', ...)`.

**Visual regression — RTL-only.** **Playwright was removed from this unit.** Same rationale as Lighthouse: browser-launching tooling (chrome-launcher, Playwright's chromium download) has repeatedly wedged on install or clobbered the developer's Chrome. Visual fidelity is verified here via RTL snapshots (JSDOM) + structural DOM assertions. A proper Playwright-sandboxed visual-diff suite can land as a follow-up unit once we have an isolated Playwright workspace.

- Responsive-parity test at `packages/haiku-ui/src/pages/review/__tests__/responsive.test.tsx`:
  - Renders ReviewPage with fixture `packages/haiku-ui/test-fixtures/review-session-full.json` (20 feedback items across statuses) at desktop + mobile viewports via `matchMedia` stub.
  - Extracts text content of every rendered feedback item via `screen.findAllByRole('listitem')`.
  - Asserts the two arrays are element-wise equal — "identical data" is mechanically proven.
- Structural DOM test at `packages/haiku-ui/src/pages/review/__tests__/layout.test.tsx`:
  - Asserts the desktop layout places `<ArtifactsPane>` and `<FeedbackSidebar>` as siblings under an `xl:flex` container.
  - Asserts the mobile layout places `<ArtifactsPane>` above a `<FeedbackFloatingButton>` with `flex-col` container; no sidebar present.
  - Grep-level check that `w-[var(--sidebar-width)]` and `xl:w-[var(--sidebar-width-xl)]` are present in the sidebar element's className string.
- `packages/haiku-ui/tests/review-page.spec.ts`, `packages/haiku-ui/playwright.config.ts`, and the `@playwright/test` dep must be DELETED if they exist from prior bolts.

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
- Responsive-parity test passes.
- Structural layout test passes.
- `packages/haiku-ui/tests/review-page.spec.ts`, `playwright.config.ts`, and the `@playwright/test` dep are REMOVED (grep confirms zero occurrences).
- `useAnnounce` fires on status-badge transitions — RTL test triggers a status change and asserts live-region text updates.
- `npx tsc --noEmit` passes.
