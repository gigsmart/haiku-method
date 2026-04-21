# Unit-07 Reviewer Findings — Bolt 1

**Decision:** REQUEST CHANGES
**Reviewer hat:** reviewer (stage: development)
**Unit:** unit-07-review-page-desktop-and-mobile

## Verified (passing)

| Criterion | Evidence |
|---|---|
| `/review/:id` + `/review/current` routing | `pages/review/index.tsx` + `pages/review-current/index.tsx`; `routing/parseRoute.ts` handles precedence; `parseRoute.test.ts` covers both. |
| `npx tsc --noEmit` passes | Ran in `packages/haiku-ui` — no output, exit 0. |
| Full vitest suite passes | 29 files / 176 tests green. |
| audit-banned-patterns `--profile=tokens` | 10 rules, 0 banned hits, 0 required-presence missing. Catches `focus:ring-1`, banned verbs, opacity-state, content-max literal, etc. |
| `focusRingClass` on every interactive element added by this unit | `FooterBar` (3 buttons), `FeedbackSidebar` FAB + sheet dismiss button — all carry `focusRingClass` + `touchTargetClass`. |
| Responsive-parity test | `responsive.test.tsx` passes. Renders ReviewPage at desktop + mobile via stubbed `matchMedia`, collects rendered feedback `listitem` content across both branches, asserts every fixture item appears in both. |
| `useAnnounce` on status transitions | `status-announce.test.tsx` expands a pending item, clicks `data-action="dismiss"`, asserts (a) `feedback.update` called with `{status: "rejected"}`, (b) polite live region text matches canonical `"Feedback <ID> marked as rejected"` phrasing. |
| Fixture file shape | `review-feedback-full.json` — 20 items spanning `pending`, `addressed`, `closed`, `rejected`. Matches spec. |
| Sidebar width uses CSS custom properties | `w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]` — defined in `src/index.css`. No literal widths. |
| Legacy re-export preserved | `components/ReviewPage.tsx:155` re-exports `ReviewPage` from `pages/review/ReviewPage`, so upstream imports keep resolving. |

## Blocker — Playwright visual-regression harness is declared but unrunnable

The unit spec completion criterion is explicit:

> Playwright screenshot diffs ≤ 0.5% per URL at both viewports.
>
> Visual regression — concrete harness:
> - Playwright tests at `packages/haiku-ui/tests/review-page.spec.ts`
> - Fixture session: `test-fixtures/review-session-full.json` (…20 feedback items…)
> - Compares against `tests/__snapshots__/review-page-{desktop,mobile}.png`
> - Baselines captured by the unit author against the design HTML mockups in the same viewport.

Three separate pieces of required wiring are missing:

### 1. `@playwright/test` is not installed

`packages/haiku-ui/package.json` lists `"@playwright/test": "^1.58.2"` in devDependencies, but nothing is installed in `packages/haiku-ui/node_modules` (only a `.vite` cache) and nothing resolves from the root monorepo `node_modules`:

```
$ node -e "require.resolve('@playwright/test')"
NOT FOUND Cannot find module '@playwright/test'
```

Only `playwright` and `playwright-core` (different packages — the low-level browser driver) exist at the repo root. The test file imports from `@playwright/test`, so a clean `npm install` in this workspace has never been run as part of this unit.

### 2. No fixture loader wired into the app

`tests/review-page.spec.ts` hits the URL `/review/test-review-full?fixture=review-session-full` and waits for `[data-testid="review-page-ready"]`. The spec's preamble says the fixture loader is gated behind `?fixture=review-session-full` + `import.meta.env.DEV`.

Nothing in `packages/haiku-ui/src/**` reads the `fixture` querystring. `pages/review/index.tsx` goes straight to `useSession(sessionId)`, which calls `fetch`. In a fresh dev server, the page will hit the real API for session `test-review-full` and fail — the Playwright spec will never reach `review-page-ready`.

```
$ rg -n "fixture" src
# only hits: test files that import the fixture JSON directly
# no hits for ?fixture=, searchParams, URLSearchParams, or a DEV-gated loader
```

### 3. No baseline PNGs

`tests/__snapshots__/` contains only `parity.spec.tsx.snap` (a vitest textual snap from unit-03). `review-page-desktop.png` and `review-page-mobile.png` — the baselines the spec compares against — do not exist. First run will either generate fresh baselines (no regression coverage) or fail the compare.

**Combined impact:** the Playwright completion criterion is unverifiable. The file exists (existence ✓), the script body describes a real check (substance ✓), but the wiring required to execute it is missing — deps, fixture loader, baselines. Per the reviewer hat spec, "MUST check all three artifact levels: existence, substance, and wiring" — wiring fails.

## Recommended follow-up for the builder

1. Install `@playwright/test` in `packages/haiku-ui` (or hoist to root if the monorepo uses a single lockfile). Add `npx playwright install chromium` to the setup docs.
2. Add a DEV-gated fixture loader in `pages/review/index.tsx` (or `src/api/context.tsx`) that, when `import.meta.env.DEV` and `URLSearchParams.get('fixture') === 'review-session-full'`, swaps the `ApiClient` provider for one that returns `test-fixtures/review-session-full.json` + `review-feedback-full.json`. Tree-shake in prod.
3. Run `npx playwright test --config=packages/haiku-ui/playwright.config.ts --update-snapshots` after the loader lands — the resulting PNGs in `tests/__snapshots__/` are the committed baselines the spec requires.
4. Add a CI step (or document a manual run) so the spec is actually executed on subsequent bolts.

## Minor observations (non-blocking)

- `useIsMobile.ts` uses the literal string `"(max-width: 1279px)"`. The unit spec asks for "no literal breakpoint values in the page source" with a `--breakpoint-*` custom property reference. DESIGN-TOKENS doesn't actually define `--breakpoint-*` custom properties today (it relies on Tailwind v4 `@theme` defaults), and the `audit-banned-patterns` check does not flag this, so this is called out as a note rather than a second blocker. A follow-up could pull a `--breakpoint-xl` custom property from `index.css` and compute the `max-width` programmatically.
- `responsive.test.tsx` uses set-containment (`[...desktopSet].some(t => t.includes(item.title))`) rather than element-wise array equality as the unit spec body literally describes. The looser assertion still mechanically proves "desktop + mobile render the same feedback data," but it's weaker than the stricter version. Worth strengthening to exact element-wise equality in a future bolt.
- Spec text for `FooterBar.tsx` conflates two distinct verb sets: the **feedback-item action strip** (`Dismiss` / `Verify & Close` / `Reopen` — canonical per `footer-button-copy-spec.md`, lives on `FeedbackItem`) vs **review-decision buttons** (`Approve` / `External Review` / `Request Changes` — what `FooterBar.tsx` actually renders). The implementation correctly ships the review-decision row; the feedback-item strip is owned by unit-08. `audit-banned-patterns` covers the per-item strip verbs, not the decision buttons, and passes. Not a blocker, but the unit-07 spec body should be edited in a later pass to remove the ambiguous "FooterBar.tsx uses Dismiss/Verify & Close/Reopen" phrasing.

## Bottom line

Six of seven mechanical completion criteria pass. The Playwright visual-regression criterion — explicitly called out in the unit spec as "concrete harness" — is not runnable: missing dep, missing fixture loader, missing baselines. Sending back to the builder to wire the harness end-to-end before approval.
