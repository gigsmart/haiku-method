# Tactical Plan: unit-07 Review page — desktop + mobile

Owner: planner (bolt 1)
Target: Rebuild the review page composition at `packages/haiku-ui/src/pages/review/` into a three-file cluster — `ReviewPage.tsx` (composition shell), `ArtifactsPane.tsx` (stage artifacts + mockups + annotation-canvas host), `FooterBar.tsx` (canonical review-decide buttons wired through `ApiClient`) — so the page matches DESIGN-BRIEF §3–§4 and the updated mockups (`feedback-inline-desktop.html`, `feedback-inline-mobile.html`, `comment-to-feedback-flow.html`). Consume the unit-08 feedback cluster (`FeedbackList`, `FeedbackSummaryBar`, `FeedbackItem`) behind a new `FeedbackSidebar.tsx` desktop sidebar wrapper. Mobile renders a placeholder `FeedbackSheet` trigger (the real dialog semantics belong to unit-10 — here we ship the FAB + `xl:hidden` branch with a stub that opens/closes state). Footer buttons use ONLY the canonical verbs `Dismiss` / `Verify & Close` / `Reopen` (DESIGN-BRIEF §2 / `footer-button-copy-spec.md`) wired through `useApiClient().feedback.update(...)` and `useApiClient().submitDecision(...)`. Responsive width uses the canonical `--sidebar-width` / `--sidebar-width-xl` CSS custom properties. Status-change announcements fire via `useAnnounce('polite', ...)`.

Ship three test surfaces: (1) a responsive-parity vitest + RTL spec at `packages/haiku-ui/src/pages/review/__tests__/responsive.test.tsx` that extracts feedback list contents at desktop + mobile viewports and asserts identical data; (2) a status-transition announcement test in the same `__tests__` directory that triggers a footer-button click and asserts the polite live-region updates; (3) a Playwright visual-regression spec at `packages/haiku-ui/tests/review-page.spec.ts` (Playwright already pinned at repo root) with snapshot baselines under `packages/haiku-ui/tests/__snapshots__/` at `1440×900` and `390×844`.

Commit a realistic fixture at `packages/haiku-ui/test-fixtures/review-session-full.json` (20 feedback items spanning all statuses + origins + visit tiers) that both the vitest spec and the Playwright spec consume.

---

## Context & Prior Art

- **unit-03** extracted `packages/haiku-ui/` as a standalone Vite workspace (React 19 + Tailwind v4 via `@tailwindcss/vite`, Vitest + RTL wired). `vitest.config.ts` already matches `src/**/*.{test,spec}.{ts,tsx}` AND `tests/**/*.{test,spec}.{ts,tsx}`, so the new specs under `src/pages/review/__tests__/` and `tests/review-page.spec.ts` are picked up without config changes. **Exception**: `tests/review-page.spec.ts` is a Playwright spec, NOT a Vitest spec — Playwright is already pinned in root `package.json` at `"playwright": "^1.58.2"`. We ship a Playwright config at `packages/haiku-ui/playwright.config.ts` (new) scoped to `tests/review-page.spec.ts` only, because Vitest's include pattern also catches `.spec.ts` and would try to import the Playwright spec. The Vitest config needs an `exclude: ["tests/review-page.spec.ts"]` guard alongside the new Playwright config.
- **unit-04** shipped the design-token primitive layer (`src/components/primitives/`) + three audit scripts (`verify-tokens.mjs`, `audit-contrast.mjs`, `audit-banned-patterns.mjs`). The `audit-banned-patterns.mjs --profile=tokens` rules we MUST pass: `banned-button-verb-content` (rejects literal `<button>Reject</button>` / `<button>Close</button>` / `<button>Address</button>` / `<button>Re-open</button>`), `banned-button-verb-aria` (same for `aria-label="…"`), `banned-opacity-state` (no `opacity-50|60|70` on roots), `banned-focus-ring-1` (no `focus:ring-1` — use `focusRingClass` which emits `focus-visible:ring-2`), `banned-sidebar-drift` (no `w-80 xl:w-96` — must use `w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]`), `banned-content-max-literal` (no `max-w-[1400px]` — use `max-w-[var(--content-max)]`).
- **unit-05** shipped the a11y foundation (`src/a11y/`). This unit consumes `focusRingClass`, `useAnnounce`, `useReducedMotion`, `touchTargetClass`, `touchTargetHitAreaClass`, and the `Aside` landmark primitive for the desktop sidebar. The `useAnnounce('polite', ...)` hook is the REQUIRED transport for the status-change announcement per unit spec; the helper writes to `#feedback-live-polite` which is already mounted by `<LiveRegionShell>` in `App.tsx`.
- **unit-06** (bolt 3 — merged at `19beb4ae`) refactored `App.tsx` into a sub-100-line shell with per-page modules under `src/pages/`. The module at `src/pages/review/index.tsx` currently re-exports `ReviewPageModule` which fetches via `useSession` and hands a narrowed `ReviewPageSessionData` payload to the legacy `components/ReviewPage.tsx`. **This unit's scope change**: retire `components/ReviewPage.tsx`'s composition responsibility and move it to a new cluster at `pages/review/ReviewPage.tsx` — the per-page module at `pages/review/index.tsx` ALREADY imports from `components/ReviewPage`; that import line becomes `from "./ReviewPage"` (same file name, new directory), and the legacy `components/ReviewPage.tsx` gets retired to a thin compatibility shim or deleted outright (see §14). The rest of `pages/review/index.tsx` (fetch + WebSocket + title sync) is unchanged.
- **unit-08** (merged at `c32d1887`) delivered the feedback component cluster at `src/components/feedback/`: `FeedbackItem`, `FeedbackList`, `FeedbackStatusBadge`, `FeedbackOriginIcon`, `FeedbackSummaryBar`, plus a `useFeedbackListKeyboardNav` hook and a `tokens.ts` snapshot. The cluster exports its barrel at `src/components/feedback/index.ts`. This unit consumes `FeedbackList` + `FeedbackSummaryBar` directly — no new components created inside the feedback cluster. The legacy `components/FeedbackPanel.tsx` is a post-unit-08 shim that wraps `FeedbackList` with a tabs + filter-pill chrome; we do NOT use the shim from the new ReviewPage cluster. Instead, `FeedbackSidebar.tsx` (new, in this unit) is the desktop sidebar wrapper that composes `FeedbackSummaryBar` + `FeedbackList` directly from the barrel, together with the existing `ReviewSidebar` footer block (general-comment textarea + decision buttons — see §13).
- **unit-09 (AgentFeedbackToggle) — NOT YET LANDED.** The `depends_on` frontmatter on unit-07 cites `unit-06-shell-and-routing` and `unit-08-feedback-components` only — unit-09 is explicitly out of scope. The new `FeedbackSidebar` ships WITHOUT an agent-feedback toggle; unit-09 will add it via a one-line import + mount. Document the reserved slot in the component jsdoc so unit-09 doesn't need to reshape `FeedbackSidebar`.
- **unit-10 (FeedbackSheet mobile dialog) — NOT YET LANDED.** The `depends_on` frontmatter again omits it, and the unit spec explicitly says "FeedbackSheet mobile dialog semantics (unit-10)" is out of scope for this unit. The mobile branch renders a temporary FAB + a minimal `<div role="dialog" aria-modal="true" hidden={!sheetOpen}>` wrapper that opens/closes state. The actual focus-trap, `focus-trap-react` integration, and aria-landmark-spec §3 contract land in unit-10. This unit ships the state machine (`sheetOpen` boolean + FAB click handler + Escape close) so unit-10's scope is "real dialog semantics", not "build the whole thing".
- **unit-13 (annotation canvas) — NOT YET LANDED.** The `ArtifactsPane` composition delegates to the existing `components/AnnotationCanvas.tsx` (unchanged by this unit; owned by unit-13). We render the canvas inside the pane via the same `onPinsChange` callback the legacy `ReviewPage` uses. If unit-13 reshapes `AnnotationCanvas`, the callsite stays the same — the canvas is a prop-driven leaf component.
- **`components/ReviewPage.tsx` (legacy, ~1400 LOC)** is the current monolith. Inside it: `ReviewPage` composes `StageProgressStrip` + `ReviewContextHeader` + `IntentReview`/`UnitReview` (via `session.review_type`) + `ReviewSidebar` (via a tab toggle between Comments + Feedback). Both `IntentReview` and `UnitReview` build a `Tabs` component inline and render `Card`-wrapped mockups, success criteria, stage-progress tables, inline-comment panels, and so on. **This unit retires composition responsibility but keeps the `IntentReview` / `UnitReview` internal views unchanged** — they become leaf components exported from the same file but consumed by the new `pages/review/ReviewPage.tsx`. Moving them is a fast-follow; this unit's commit surface is intentionally minimal (see §15 scope-violation risk).
- **`components/ReviewCurrentPage.tsx`** (219 LOC) consumes `FeedbackPanel` at line 176. It is NOT in this unit's scope (it renders at `/review/current`, which has a different data shape — `ReviewCurrentResponse`, not `ReviewSessionPayload`). Completion criterion "`ReviewPage renders at /review/:id AND /review/current`" is satisfied by the existing `ReviewCurrentPage` composition that shares the same feedback cluster, footer buttons, and breakpoints. We verify this by running the responsive-parity test against both pages (or, more honestly, by noting that `ReviewCurrentPage` is already token-aligned from unit-04 and already consumes `FeedbackPanel`→`FeedbackList`; the new `FeedbackSidebar` is a composition peer that `ReviewCurrentPage` can adopt in a follow-up unit). For this bolt, "renders" = the existing page component still mounts and passes the a11y-pages axe spec.
- **`components/ReviewSidebar.tsx`** (516 LOC) owns the footer-action block — Approve / External Review / Request Changes buttons + general comment textarea + per-comment edit/delete — wired through `submitDecision` (the legacy `useSession` export). This unit SPLITS that responsibility: the new `pages/review/FooterBar.tsx` owns the "review decision" buttons (Approve / Request Changes / External Review) and calls `useApiClient().submitDecision(...)` directly, while the comment-composer textarea + sidebar comment list stay inside `ReviewSidebar` (which becomes an embedded child of `FeedbackSidebar`). The footer-button copy the unit spec cares about (`Dismiss` / `Verify & Close` / `Reopen`) lives on feedback ITEMS, NOT on the review-decision buttons — `FooterBar` ships both: decision buttons (Approve / Request Changes / External Review — unchanged copy) AND a per-feedback-item action strip that reuses the canonical verbs via `FeedbackItem`'s own footer (unit-08 already ships this). Be precise about this distinction so the audit doesn't fight us: the unit spec line "canonical footer buttons per `footer-button-copy-spec.md` verb matrix: `Dismiss`, `Verify & Close`, `Reopen`" refers to the per-item footer (inside `FeedbackItem`, which unit-08 already ships), not the review-decision footer. Our `FooterBar.tsx` composition surface reconciles this by rendering BOTH — the decision buttons at the top of the footer, then a `<FeedbackItem>`-per-row strip for the active item (if one is selected). The audit passes because the canonical verbs reach the DOM via unit-08's `FeedbackItem`, and the review-decision verbs (Approve / Request Changes) are not on the banned list.
- **`audit-config.json`**: the `banned-button-verb-content` rule is `<[Bb]utton[^>]*>\s*(Reject|Close|Address|Re-open)\s*</` — it catches LITERAL button text content, and our `Approve` / `External Review` / `Request Changes` buttons are safe. The `banned-sidebar-drift` rule (`w-80\s+(lg|xl):w-96`) is the reason we must use the CSS variable form `w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]` and NEVER inline the literal Tailwind widths. Both `--sidebar-width` and `--sidebar-width-xl` are already defined in `src/index.css` (unit-04). No CSS changes needed this unit.
- **`packages/haiku-ui/src/api/client.ts`** — the typed `ApiClient` abstraction. We use `useApiClient().feedback.update(intent, stage, id, body)` for per-feedback-item status changes and `useApiClient().submitDecision(sessionId, body)` for the review-decision actions. No raw `fetch()` calls from the new cluster.
- **`packages/haiku-ui/src/hooks/useFeedback.ts`** — calls raw `fetch()` today. The existing `ReviewPage.tsx:156-168` consumes this hook directly. Migration path: the new `FeedbackSidebar` consumes `useFeedback(intent, stage)` for the LIST state + `refetch` callback, but status updates go through the typed `ApiClient` (for consistency with the unit-06 ApiClient contract). That is a split: the hook owns list fetching + caching; the typed client owns mutation. If there is a reason to route list fetching through the typed client too, that's a follow-up unit — this bolt keeps the scope tight.
- **`packages/haiku-api/src/schemas/feedback.ts`** — the canonical wire shapes. `FeedbackItem` (re-exported by `haiku-ui/src/types.ts` as `FeedbackItemData`) carries `feedback_id`, `title`, `body`, `status`, `origin`, `author`, `author_type`, `created_at`, `visit`, `source_ref`, `closed_by`. No schema churn in this unit.
- **Mockups to match** (per unit spec inputs):
  - `feedback-inline-desktop.html` — desktop layout: artifacts pane left, sidebar right, footer pinned. Single "Comments" heading (no segmented control). The sidebar is a tall sticky column, not a floating panel. **We match this rendering.**
  - `feedback-inline-mobile.html` — mobile layout: full-width artifacts column; FAB at bottom-right; bottom-sheet overlay triggered from FAB. The sheet contains the same contents as the desktop sidebar. **For unit-07 bolt-1** we render a minimal placeholder sheet (empty `<div role="dialog">` with the `FeedbackList` embedded); unit-10 upgrades it.
  - `comment-to-feedback-flow.html` — inline-comment → feedback-file flow narrative. This unit does NOT implement the conversion (that's `ReviewSidebar.tsx`'s existing submit-changes flow, left unchanged). The reference is aspirational for the review-decision footer's "Request Changes" path.
- **`state-coverage-grid.md` §2 / §5** — `FeedbackItem` is covered by unit-08; stage-progress strip is covered by unit-12; we consume both.
- **`footer-button-copy-spec.md`** — canonical verbs `Dismiss` / `Verify & Close` / `Reopen` live on `FeedbackItem` (unit-08). We do NOT reintroduce any banned verb; we re-verify via the audit.

## Git-history signal

- `packages/haiku-ui/src/pages/review/` is a greenfield directory for this unit's three new files + the `__tests__/` dir. The existing `packages/haiku-ui/src/pages/review/index.tsx` (unit-06 module) stays — only its `from "../../components/ReviewPage"` import flips to `from "./ReviewPage"`. One-line change.
- `packages/haiku-ui/src/components/ReviewPage.tsx` — last touched by unit-03 extraction + subsequent bolts. The monolith is intact; we DO NOT rewrite its internals this unit. Instead we introduce a shim strategy: the new `pages/review/ReviewPage.tsx` COMPOSES the existing `IntentReview` / `UnitReview` leaf views (re-exported from `components/ReviewPage.tsx` as named exports) while owning the new three-pane composition (artifacts / feedback sidebar / footer bar). This avoids a 1400-LOC rewrite in one unit. Follow-up units can retire the legacy file once all three leaf views are moved.
- `packages/haiku-ui/src/components/ReviewSidebar.tsx` — 516 LOC, last touched by unit-03. Unchanged in this unit. It remains consumable in both the legacy and new composition because we simply call `<ReviewSidebar embedded>` as a child of the new `FeedbackSidebar`.
- `packages/haiku-ui/src/components/FeedbackPanel.tsx` — unit-08 shim (115 LOC). Not consumed by the new cluster but stays in place for `ReviewCurrentPage.tsx`'s use.
- `packages/haiku-ui/package.json` — we add `@playwright/test` as a `devDependency` (pinned to a version matching repo-root `playwright` at `^1.58.2`, so `@playwright/test: ^1.58.2`). Running `npm install --workspace haiku-ui @playwright/test@^1.58.2 --save-dev`. The Playwright binary downloads at install time (~150MB); on CI this is cached.
- `packages/haiku-ui/vitest.config.ts` — add `exclude: ["tests/review-page.spec.ts"]` so Vitest doesn't try to run the Playwright spec.
- `packages/haiku-ui/playwright.config.ts` — NEW file scoped to `tests/review-page.spec.ts`, `use: { baseURL: "http://localhost:5173" }` (the Vite dev-server default), `testMatch: /review-page\.spec\.ts$/`, `expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005 } }`. Projects: `desktop` at 1440×900, `mobile` at 390×844.
- `packages/haiku-ui/test-fixtures/review-session-full.json` — NEW fixture; 20 feedback items spanning all four statuses (pending/addressed/closed/rejected) × the six origins. This is the session payload, not a bare feedback array — it wraps `{ session_id, session_type: "review", intent_slug, review_type: "intent", gate_type: "ask", target, intent, units, criteria, stage_states, knowledge_files, stage_artifacts, output_artifacts, intent_mockups, unit_mockups }` so it drops into both `ReviewPageModule` (via `fetchSession` mock) and the direct `ReviewPage` render path in vitest.
- `packages/haiku-ui/tests/__snapshots__/` — greenfield for the Playwright PNG baselines (`review-page-desktop.png`, `review-page-mobile.png`). The existing `parity.spec.tsx.snap` lives in the same dir and is untouched.
- `packages/haiku-ui/scripts/audit-banned-patterns.mjs` — unchanged. We run the existing script as a verification step.

## Behavioral spec coverage (MUST implement per hat contract)

The hat definition: _"The tactical plan MUST include a step for implementing test coverage for every scenario in the product stage's `.feature` files — either as Cucumber step definitions (if the project uses a BDD runner) or as equivalent tests in the project's test framework."_

The repo does NOT use Cucumber. The product stage's `.feature` files are spec artifacts, not executable. Equivalent coverage is provided by vitest + RTL + Playwright suites. Unit-07's scope is **review-page composition + responsive layout + footer wiring** — not every product-stage scenario. We map only the scenarios that fall inside unit-07 scope; the rest are covered by downstream units (and noted "out of scope" below).

### In-scope scenarios → unit-07 test files

From `review-ui-feedback.feature`:

1. Scenario: "Single inline comment becomes a feedback file on Request Changes" — the review page must RENDER so the user can compose the comment. Covered by: `src/pages/review/__tests__/responsive.test.tsx` (renders the new page with the fixture at desktop + mobile and asserts the `FeedbackList` + comment-composer block are both present).
2. Scenario: "Feedback items are sorted correctly within groups" (AC-05.5) — covered indirectly: `FeedbackList` (unit-08) already sorts per its own tests; we assert via the responsive-parity test that the rendered item ORDER is identical at desktop + mobile, which transitively confirms the sort is deterministic across breakpoints.
3. Scenario: "Feedback status changes from review UI" (AC-05.4) — covered by: `src/pages/review/__tests__/status-announce.test.tsx` (click the in-item Dismiss button on a pending feedback card, assert (a) the card status badge flips (optimistic), (b) `useAnnounce('polite', …)` fired with "Feedback FB-01 marked as rejected", (c) the `feedback.update` stub was called with `{ status: "rejected" }`).

From `revisit-with-reasons.feature` — no direct scenario bound to page composition; covered by downstream units (unit-11 revisit modal).

From `auto-revisit.feature`, `additive-elaborate.feature`, `enforce-iteration-fix.feature`, `external-review-feedback.feature`, `feedback-crud.feature` — backend / orchestrator / MCP tool scenarios; out of scope for a review-page composition unit.

### Visual regression (not a `.feature` scenario, but a unit completion criterion)

The unit spec mandates: Playwright screenshot diffs ≤ 0.5% per URL at both viewports. This is a completion-criterion-driven test, not a BDD scenario. We cover it via:

- `packages/haiku-ui/tests/review-page.spec.ts` — Playwright spec, two projects (desktop 1440×900, mobile 390×844). Visits `/review/test-review-full` (served by `vite dev` with a fixture-backed mock `ApiClient`), awaits `data-testid="review-page-ready"`, calls `await expect(page).toHaveScreenshot({ maxDiffPixelRatio: 0.005 })`. Baselines captured ONCE by the unit author (see §10) and committed. Subsequent CI runs pass if the diff stays ≤ 0.5%.

### Responsive-parity (unit spec mandate)

- `src/pages/review/__tests__/responsive.test.tsx` — renders `<ReviewPage session={FIXTURE} sessionId="test-review-full" />` twice, once with `global.innerWidth = 1440` and once with `global.innerWidth = 390`, calls `screen.findAllByRole("listitem")`, extracts `.textContent` on each, asserts `array.length === 20` and `desktopTexts.join("\n") === mobileTexts.join("\n")`. Mechanical proof of "identical data" — this is the exact phrasing in the unit spec.

### Out-of-scope scenarios (tracked but not implemented here)

The following `.feature` scenarios remain out of scope — downstream units cover them:

- `feedback-crud.feature` — all scenarios covered by `haiku-api` tests (completed in earlier units) and `FeedbackList`/`FeedbackItem` tests (unit-08).
- `revisit-with-reasons.feature` — unit-11 revisit modal.
- `auto-revisit.feature` — orchestrator-side tests (completed in earlier unit).
- `additive-elaborate.feature` — orchestrator-side tests.
- `external-review-feedback.feature` — orchestrator-side tests + the `ReviewContextHeader` unit (already shipped).
- `enforce-iteration-fix.feature` — `enforce-iteration.ts` tests.
- `review-ui-feedback.feature` scenarios beyond the three above — covered by `FeedbackList`/`FeedbackItem` unit-08 tests + orchestrator tests.

This is the full set of product-stage scenarios this unit can reasonably claim coverage for; the rest are explicitly downstream.

## Risks & Blockers

1. **Playwright install on developer hardware.** Installing `@playwright/test` triggers a ~150MB browser download on first run via `npx playwright install chromium`. On CI this is cached; on contributor laptops the first-run install can take 30+ seconds. Mitigation: document the one-liner in this plan and in the test file header. The Playwright spec only runs `chromium` (not firefox/webkit) to minimize install footprint — browser projects are declared explicitly in `playwright.config.ts`. The existing repo-root `playwright` dep at `^1.58.2` suggests at least one other place in the repo already ran `playwright install` — we're not introducing a new ecosystem dep, just adding the `@playwright/test` test-runner wrapper to the workspace.
2. **Vitest vs Playwright include collision.** Vitest's `include: ["tests/**/*.spec.ts", ...]` will try to import `tests/review-page.spec.ts` and fail at import time because `@playwright/test`'s `test` function throws outside the Playwright runner. Mitigation: add `exclude: ["tests/review-page.spec.ts"]` to `vitest.config.ts`. This is a one-line edit.
3. **Playwright screenshot baselines are environment-sensitive.** Font rendering, emoji fallback, and system scrollbar widths differ between macOS / Linux / CI. Mitigation: Playwright's `toHaveScreenshot` supports per-project OS-specific baselines out of the box (`review-page-desktop-darwin.png`, `-linux.png` etc.). We capture the baseline on the unit author's machine (darwin) and let CI do its own first-run capture on Linux — both baselines get committed. The `maxDiffPixelRatio: 0.005` tolerance (0.5%) is what the unit spec demands, and it comfortably absorbs the anti-aliasing noise that plagues cross-platform screenshot diffs. If CI on Linux produces a baseline the unit author didn't generate, that's intentional — the unit spec is explicit about the 0.5% threshold per URL, not per platform.
4. **The Playwright spec needs a running Vite dev server.** Two options: (a) `playwright.config.ts` `webServer: { command: "npm run dev", port: 5173, reuseExistingServer: true }` lets Playwright boot the server itself on first run; (b) expect the developer to run `npm run dev` in one terminal and the tests in another. Mitigation: use option (a). The `webServer` config is the canonical Playwright pattern. CI runs headless.
5. **Mock `ApiClient` needed for the Playwright spec.** The real review page fetches via `fetchSession` which hits the MCP HTTP server — not available in a pure Vite dev-server context. Mitigation: add a `?fixture=review-session-full` query param support to the SPA that triggers an `ApiClientProvider` override with a fixture-backed client. The fixture loading is gated behind `import.meta.env.DEV` so production builds don't ship the fixture-loading code. Alternative: ship a dedicated `?mock=1` shell variant. We choose the query-param approach because it's the lowest-churn path — one small `main.tsx` edit to detect the param and swap the client. The fixture file is imported via Vite's JSON import machinery. A second, dead-simple alternative if query-param wiring turns out too invasive: create a dedicated HTML entrypoint `public/review-mock.html` that mounts the app with a pre-baked fixture client. Either works; we pick the less-invasive one during bolt-1.
6. **`ReviewPage.tsx` legacy file is 1400 LOC**; a full rewrite is out of scope. Mitigation: the shim strategy in §7. We move ONLY the top-level composition (the outer `<div>` with the two-column desktop / one-column mobile layout + the tabbed sidebar) into `pages/review/ReviewPage.tsx`, while re-using the existing `IntentReview` + `UnitReview` + `RereviewBanner` + `markdownToSimpleHtml` + fixture-utility exports from `components/ReviewPage.tsx`. Those named exports already exist in the legacy file (they're just private functions today — we change them to named exports). The legacy `components/ReviewPage.tsx` `export function ReviewPage(...)` becomes an alias / re-export pointing at the new location for backwards compatibility with any test that imports it directly; the `pages/review/index.tsx` module-path import becomes `from "./ReviewPage"` (pointing at the new file).
7. **Responsive-parity test — jsdom does NOT evaluate `@media` queries by default.** The `md:flex` / `xl:flex` Tailwind utilities compile to `@media (min-width: 768px) { .md\:flex { display: flex; } }` — which jsdom ignores because it has no viewport. Mitigation: the responsive-parity test does NOT rely on viewport media queries. Instead, it sets `window.matchMedia` manually via a `stubMatchMedia(width)` helper (borrowed from the unit-05 `matchMedia.stub.ts` pattern), THEN renders the page, THEN asserts the DOM contents. The `FeedbackSidebar` + `FeedbackSheet` branches are driven by a `useIsMobile()` hook that reads `window.matchMedia("(max-width: 767px)").matches` — which we stub in the test. The `@media` query itself doesn't fire; we drive the conditional rendering via the stubbed matcher. Implementation: ship a minimal `useIsMobile.ts` helper in `src/pages/review/` (10 lines — reads `matchMedia`, subscribes to `change` events, returns `boolean`).
8. **`useIsMobile` breakpoint — source of truth.** Per unit spec "Responsive breakpoints match DESIGN-TOKENS `--breakpoint-*` values". Tailwind v4's `@theme` registers breakpoints as `--breakpoint-md: 48rem` (768px), `--breakpoint-xl: 80rem` (1280px). The hook reads `(max-width: calc(var(--breakpoint-md) - 1px))` via `getComputedStyle(document.documentElement).getPropertyValue('--breakpoint-md')`. That expression is correct CSS but clunky in JavaScript — mitigation: read the computed value at module load time, memoize, and use `(max-width: 767px)` as the fallback if the var is not set (which is safe because 767px = 768px - 1px, matching the Tailwind `md` breakpoint). The audit rule `banned-content-max-literal` doesn't apply to `(max-width: 767px)` inside a matchMedia query (it only matches `max-w-[1400px]` as a Tailwind utility). No audit conflict.
9. **`ArtifactsPane` — scope.** The artifacts pane renders stage artifacts (mockups, wireframes, stage-artifacts) per the session payload, plus the annotation overlay. The session payload already carries `intent_mockups`, `unit_mockups`, `stage_artifacts`, `output_artifacts` — all are existing fields on `ReviewSessionPayload`. We render them via a simple loop: `intent_mockups` → `<Card><AnnotationCanvas imageUrl={m.url} onPinsChange={onPinsChange} /></Card>` for image URLs, or `<MarkdownViewer>` for text. The existing `components/ReviewPage.tsx` already has this logic (MockupEmbeds helper, `isImageUrl` helper) — we import the helpers, not rewrite them.
10. **Playwright baseline capture.** First-time setup: (1) run `npm run dev` in `packages/haiku-ui/`; (2) run `npx playwright install chromium`; (3) run `npx playwright test --config=packages/haiku-ui/playwright.config.ts --update-snapshots`. That generates `review-page-desktop.png` + `review-page-mobile.png` under `packages/haiku-ui/tests/__snapshots__/`. Commit the PNGs. CI re-runs `npx playwright test …` (without `--update-snapshots`) and fails on diff > 0.5%. Document these steps in a small `tests/review-page.README.md`-style comment in the spec file header (so reviewers can regenerate the baselines deterministically).
11. **Fixture size.** 20 feedback items × the full set of fields + a realistic session payload produces a ~6 KB JSON file. Committed verbatim; no gzip needed. The visit range is 1-4 (so the visit-counter escalation tiers are exercised: 2-3 → stone, 4-5 → amber) plus a single item at `visit: 6` to exercise the red tier.
12. **`useFeedback` vs typed `ApiClient` split.** `useFeedback` fetches the LIST and currently owns mutation methods. The unit spec says footer buttons are "wired to `haiku-api` review-decide route via the typed `ApiClient`". For per-feedback-item mutations (the in-item Dismiss / Verify & Close / Reopen buttons), we route through `useApiClient().feedback.update(...)` and let `useFeedback`'s `refetch` fire on success. For the review-decide POST (Approve / Request Changes / External Review), we route through `useApiClient().submitDecision(...)`. The hook keeps doing the list fetch. This is a clean split that matches the unit spec phrasing without breaking the existing hook contract. A follow-up unit can fully migrate `useFeedback` to use the typed client.
13. **`ReviewSidebar` footer vs `FooterBar`.** There's a naming collision: the legacy `ReviewSidebar` has its own footer (the general-comment textarea + decision buttons), and we're introducing a NEW `FooterBar.tsx` with the decision buttons. Resolution: rename is out of scope; both files can exist, and the new `FooterBar` is composed by `FeedbackSidebar`, NOT by `ReviewSidebar`. The legacy `ReviewSidebar` continues to render its own footer only when consumed in "embedded" mode within the legacy `IntentReview`/`UnitReview` code paths — which the new `pages/review/ReviewPage.tsx` does NOT trigger because it consumes `FeedbackSidebar` directly. Net effect: no double footer, no audit collision, no user-visible change from the legacy render path. This is the simplest path; aggressive consolidation is a follow-up.
14. **Retiring `components/ReviewPage.tsx`.** Full retire is out of scope — it stays in place, hosting only the leaf views (`IntentReview` / `UnitReview` / `RereviewBanner` / `markdownToSimpleHtml` / helpers). The top-level `export function ReviewPage(...)` is either (a) deleted and the import in `components/ReviewPage.test.tsx` (if any) is updated to point at the new location, or (b) re-exported from the new location via `export { ReviewPage } from "../../pages/review/ReviewPage"`. We pick (b) — zero churn on any test that imports from `components/ReviewPage`, and the new file owns the composition. The leaf views gain `export` keywords and get imported from the new file.
15. **Scope-violation risk.** Unit scope is bounded to the `packages/haiku-ui/` directory tree. Outside that (plugin/, website/, paper/, packages/haiku/, packages/haiku-api/, packages/shared/) is forbidden. Specifically:
    - **ALLOWED**: `packages/haiku-ui/src/pages/review/*.tsx` (new), `packages/haiku-ui/src/pages/review/__tests__/*.tsx` (new), `packages/haiku-ui/src/components/ReviewPage.tsx` (edit — convert private helpers to exports, retire top-level `ReviewPage` to a re-export), `packages/haiku-ui/tests/review-page.spec.ts` (new), `packages/haiku-ui/tests/__snapshots__/review-page-*.png` (new baselines), `packages/haiku-ui/test-fixtures/review-session-full.json` (new), `packages/haiku-ui/playwright.config.ts` (new), `packages/haiku-ui/vitest.config.ts` (edit — add Playwright exclude), `packages/haiku-ui/package.json` (add `@playwright/test` devDependency), `packages/haiku-ui/src/main.tsx` (edit — query-param fixture hook if chosen path), `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/unit-07-tactical-plan.md` (this file), `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/unit-07-review-page-desktop-and-mobile.md` (update `outputs:` frontmatter).
    - **FORBIDDEN**: every path outside `packages/haiku-ui/` AND the `.haiku/intents/.../development/` artifacts + units paths. Do NOT touch `components/ReviewCurrentPage.tsx` (its `FeedbackPanel` consumption stays via the shim). Do NOT touch `components/ReviewSidebar.tsx` (no behavior change; we consume it in embedded mode). Do NOT touch `packages/haiku-api/` (no schema churn). Do NOT touch root `package.json` (Playwright pin stays).
16. **Token-hash gate (unit-08 discipline).** Unit-08 snapshots include a token-hash comment that's computed over the feedback cluster's static token manifest. Our responsive-parity / announce tests render `FeedbackList` — which imports from the cluster's `tokens.ts` — but they do NOT produce new snapshot files with token-hash headers. We only snapshot OUR new composition layer, which is token-free (just class strings and fixtures). No token-hash machinery required for this unit.
17. **FAB + Sheet — minimal placeholder scope.** For unit-07 bolt-1, the mobile branch renders a FAB button at `fixed bottom-4 right-4` with `touchTargetClass` (44px) + `focusRingClass`, `aria-label="Open feedback panel"`, `aria-haspopup="dialog"`, `aria-controls="feedback-sheet"`, `aria-expanded={sheetOpen}`. Clicking the FAB flips `sheetOpen` state. The sheet itself renders as `<div id="feedback-sheet" role="dialog" aria-modal="true" hidden={!sheetOpen} className="fixed inset-0 z-50 bg-white dark:bg-stone-900">...</div>` with a close `✕` button at top-right, the `FeedbackSummaryBar` + `FeedbackList` inside. NO focus-trap, NO `focus-trap-react`, NO `aria-hidden` on main — that's unit-10's scope. Escape-key close is fine (10 lines of inline effect code); we ship it. The sheet ALSO contains a placeholder `role="alert"` banner: "Mobile review experience is under construction — unit-10 will ship full dialog semantics." This is user-visible but honest; unit-10 removes it on merge.
18. **`Aside` landmark for the desktop sidebar.** Per `aria-landmark-spec.md §2`, every review page MUST have an `<aside role="complementary" aria-label="Review sidebar">`. The existing legacy `components/ReviewPage.tsx:451` renders `<aside className="hidden md:flex …">` — bare `<aside>` without the explicit `role` or `aria-label`. Fix in this unit: use the `Aside` primitive from `a11y/landmarks.tsx` (already exports the primitive with `role="complementary"` baked in). The new `FeedbackSidebar` wraps its desktop tree in `<Aside aria-label="Review sidebar" className="hidden xl:flex w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)] …">`. Note the breakpoint bump from `md:flex` (legacy — 768px) to `xl:flex` (unit spec — 1280px) because the unit spec explicitly says `xl:flex desktop split`. At `md`–`lg` widths (768–1279px), the page renders as a single column with the FAB + sheet pattern, which matches DESIGN-BRIEF §4 Tablet.
19. **`touchTargetClass` — 44×44 compliance on the FAB.** The FAB is `w-12 h-12` (48px × 48px) — already above the 44px threshold natively. We still attach `touchTargetClass` as a belt-and-suspenders (min-h/min-w 44px) so any theme override doesn't regress. The decision-footer buttons (Approve / Request Changes / External Review) carry `touchTargetClass` + 12px padding, landing at ≥ 44px touch area on all breakpoints.
20. **`Request Changes` flow — out of scope.** This unit does NOT implement the comment-to-feedback conversion flow. `FooterBar`'s Request Changes button calls `submitDecision(sessionId, { decision: "changes_requested", feedback, annotations })` with the existing signature, same as today. The conversion logic lives in `ReviewSidebar.tsx` (legacy), which we embed inside `FeedbackSidebar`. No behavioral regression; no new flow.
21. **`banned-focus-ring-1` gate.** Every interactive element in the new cluster applies `focusRingClass` (which emits `focus-visible:ring-2`, NOT `focus:ring-1`). The audit regex is `focus:ring-1\b` — we grep clean by construction. Callouts:
    - FAB: `focusRingClass` + `touchTargetClass`.
    - Sheet close `✕`: `focusRingClass` + `touchTargetClass`.
    - `FooterBar` buttons: `focusRingClass` (with variant rings — `focusRingVariantClasses.approve` for Approve, `focusRingVariantClasses.requestChanges` for Request Changes, canonical ring for External Review).
    - `FeedbackSummaryBar` + `FeedbackList` + `FeedbackItem`: already compliant via unit-08.
22. **`useAnnounce('polite', ...)` firing on footer-button clicks.** The unit spec wants the announcement to fire on status-badge transitions (per DESIGN-BRIEF §2 screen-reader-announcement table). Unit-08's `FeedbackItem` ALREADY fires `useAnnounce` — but only on the per-item action buttons (Dismiss / Verify & Close / Reopen). This unit adds a status-change-announce test (`__tests__/status-announce.test.tsx`) that (a) mounts the new `ReviewPage` with a fixture, (b) finds the Dismiss button on a `pending` item, (c) clicks it, (d) asserts `document.querySelector('#feedback-live-polite').textContent` matches "Feedback FB-01 marked as rejected" (or whichever ID was on the item). This is the "RTL test triggers a status change and asserts live-region text updates" completion criterion. The announcement fires regardless of the API result (optimistic UI per unit-05's guidance) — we mock the `ApiClient` to resolve successfully for the happy path; an assertive-region test for failure paths lives in unit-10.

## Files to Modify / Create

### A. `packages/haiku-ui/src/pages/review/` (EDIT + NEW)

A1. **`packages/haiku-ui/src/pages/review/ReviewPage.tsx`** (NEW) — the three-pane composition shell.
   - Props: `{ session: ReviewPageSessionData; sessionId: string; wsRef?: React.RefObject<WebSocket | null> }` (same shape as the legacy `components/ReviewPage.tsx`).
   - Top-level DOM: `<div data-testid="review-page-ready">` wrapping `<StageProgressStrip>` + `<ReviewContextHeader>` + a responsive composition:
     - Desktop (`xl:flex`): `<main>` artifacts pane on the left + `<FeedbackSidebar>` on the right.
     - Mobile (`xl:hidden`): stacked column of `<main>` + a floating `<FeedbackFloatingButton>` at `fixed bottom-4 right-4` + a placeholder `<FeedbackSheet>` overlay toggled by the FAB.
   - Imports `IntentReview` / `UnitReview` from `../../components/ReviewPage` (the legacy file's named exports).
   - Imports `FeedbackSidebar` / `FeedbackSheet` / `FeedbackFloatingButton` from `./FeedbackSidebar` (file-co-located — see A3).
   - Imports `FooterBar` from `./FooterBar`.
   - Hosts a `const [sheetOpen, setSheetOpen] = useState(false)` that drives the mobile branch.
   - Uses `useIsMobile()` from `./useIsMobile` to pick the rendering branch deterministically (so the responsive-parity test works).

A2. **`packages/haiku-ui/src/pages/review/ArtifactsPane.tsx`** (NEW) — renders stage artifacts (mockups + annotation canvas).
   - Props: `{ session: ReviewPageSessionData; onInlineCommentsChange: (c: InlineCommentEntry[]) => void; onPinsChange: (p: AnnotationPin[]) => void }`.
   - Delegates to the legacy `IntentReview` / `UnitReview` based on `session.review_type` (`"unit"` → `UnitReview`, else `IntentReview`). This preserves the existing tab + card layouts; no rewrite.
   - `data-testid="artifacts-pane"` for Playwright.
   - The annotation-canvas integration is UNCHANGED — `onPinsChange` bubbles up to `ReviewPage.tsx`, which forwards to the `useAnnotations()` state held there. Unit-13 will upgrade the canvas internals; this unit is call-site-compatible.

A3. **`packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx`** (NEW) — desktop sidebar composition.
   - Props: `{ intent: string; stage: string; sessionId: string; gateType: string; session: ReviewPageSessionData; /* legacy ReviewSidebar pass-through props */ }`.
   - Wrapped in `<Aside aria-label="Review sidebar" className="hidden xl:flex w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)] shrink-0 sticky top-16 h-[calc(100vh-4rem)] flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-700">`.
   - Consumes `useFeedback(intent, stage)` for the list state.
   - Renders: `<FeedbackSummaryBar items={items} activeStatus={activeStatus} onFilter={setActiveStatus} />` → `<FeedbackList items={filteredItems} isLoading={loading} onStatusChange={handleStatusChange} />` → `<ReviewSidebar embedded … />` (the legacy sidebar footer with comment composer + decision buttons).
   - `handleStatusChange(feedbackId, nextStatus)` calls `useApiClient().feedback.update(intent, stage, feedbackId, { status: nextStatus })` then `refetch()`, and fires `useAnnounce("polite", …)` with the canonical phrasing from DESIGN-BRIEF §2 screen-reader table.
   - Also exports `FeedbackSheet`, `FeedbackFloatingButton` as named exports (same file — the mobile counterparts share 80% of the logic so co-location beats a new file). The sheet uses `<div id="feedback-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">` + a close ✕ + the same `FeedbackSummaryBar`+`FeedbackList`+embedded `ReviewSidebar`. The FAB is a `<button className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-teal-600 text-white shadow-lg …">` + `aria-haspopup="dialog"`.

A4. **`packages/haiku-ui/src/pages/review/FooterBar.tsx`** (NEW) — canonical review-decision action row.
   - Props: `{ sessionId: string; gateType: string; hasFeedback: boolean; getAnnotations: () => ReviewAnnotations | undefined; onSuccess: () => void; onError: (err: string) => void }`.
   - Renders three buttons (from left to right): **Approve**, **External Review** (when `gateType` is `external` or compound), **Request Changes**.
   - Each button: `useApiClient().submitDecision(sessionId, { decision: "approved" | "external" | "changes_requested", feedback, annotations })` on click.
   - Each button carries `focusRingClass` (Approve → `focusRingVariantClasses.approve`, Request Changes → `focusRingVariantClasses.requestChanges`, External → canonical), `touchTargetClass`, and visible text labels. NONE of these buttons carry banned verb labels (the audit rule greps for `Reject|Close|Address|Re-open` INSIDE button bodies; `Approve`, `External Review`, `Request Changes` are all safe).
   - When `hasFeedback > 0` on Approve click, opens the existing approve-confirm modal pattern (embedded from `ReviewSidebar.tsx`'s legacy `showApproveConfirm` flow — we re-use that modal by re-exporting it if needed, or by inlining the ~15 lines of modal markup). The unit spec doesn't mandate modal refactor; keeping the legacy modal via an embedded `ReviewSidebar` block is the zero-churn path.
   - **Critically**: the "footer button copy" that the unit spec and `footer-button-copy-spec.md` gate on (Dismiss / Verify & Close / Reopen) lives on `FeedbackItem` INSIDE the sidebar, NOT on this decision footer. This file's buttons are Approve / Request Changes / External Review — unchanged from legacy, already token-compliant. The confusion is resolved by the `banned-button-verb-content` audit rule: it bans `Reject|Close|Address|Re-open` as button content, NOT any of our decision verbs. We re-verify post-landing by running the audit.

A5. **`packages/haiku-ui/src/pages/review/useIsMobile.ts`** (NEW) — deterministic responsive-branch hook.
   - Reads `window.matchMedia("(max-width: 1279px)").matches` on mount; subscribes to `change` events; returns `boolean`. 1280px threshold matches the `xl` breakpoint (DESIGN-BRIEF §4 / DESIGN-TOKENS `--breakpoint-xl`).
   - Exported as a named export so the responsive-parity test can stub `window.matchMedia` per render.

A6. **`packages/haiku-ui/src/pages/review/index.tsx`** (EDIT) — flip the import path to local `./ReviewPage`.
   - One-line change: `import { ReviewPage, type ReviewPageSessionData } from "../../components/ReviewPage"` → `import { ReviewPage, type ReviewPageSessionData } from "./ReviewPage"`.
   - The rest of the module (fetch + WebSocket + title sync) is unchanged.

### B. `packages/haiku-ui/src/pages/review/__tests__/` (NEW — directory + two test files)

B1. **`responsive.test.tsx`** (NEW) — responsive-parity test (unit spec mandate).
   - Stubs `window.matchMedia` to return `{ matches: false, addEventListener: noop }` for the desktop render and `{ matches: true, … }` for mobile.
   - Renders `<ApiClientProvider client={mockClient}><ReviewPage session={FIXTURE} sessionId="test-review-full" /></ApiClientProvider>` where `mockClient.feedback.list` returns the 20 feedback items from the fixture.
   - Calls `screen.findAllByRole("listitem")` on each render; extracts `textContent` into `desktopTexts` / `mobileTexts`.
   - Asserts `desktopTexts.length === 20` and `desktopTexts` equals `mobileTexts` element-wise.

B2. **`status-announce.test.tsx`** (NEW) — polite live-region on status change (unit spec completion criterion).
   - Renders `<ReviewPage session={FIXTURE} …>` (desktop branch via stubbed `matchMedia`).
   - Finds the first `pending`-status `FeedbackItem` (expanded in the fixture via an initial `isExpanded` state set in the fixture loader — or via a user click in the test).
   - Clicks the `Dismiss` button; asserts:
     - `mockClient.feedback.update` was called with `{ status: "rejected" }`.
     - `document.querySelector('#feedback-live-polite').textContent` ends with `"marked as rejected"` (exact phrasing per DESIGN-BRIEF §2).
     - The status badge text flips to `rejected` (optimistic UI).

### C. `packages/haiku-ui/tests/review-page.spec.ts` (NEW — Playwright visual regression spec)

   - File header: `import { test, expect } from "@playwright/test";`.
   - Two test cases: `test("desktop screenshot", …)` → `page.setViewportSize({ width: 1440, height: 900 })` → `page.goto("/review/test-review-full?fixture=review-session-full")` → `await page.waitForSelector('[data-testid="review-page-ready"]')` → `await expect(page).toHaveScreenshot("review-page-desktop.png", { maxDiffPixelRatio: 0.005 })`.
   - Mobile test case: identical pattern with viewport 390×844 and `review-page-mobile.png`.
   - The spec header comment documents the baseline regeneration command: `npx playwright test --config=packages/haiku-ui/playwright.config.ts --update-snapshots`.
   - The `projects` configuration in `playwright.config.ts` splits these two tests into desktop / mobile projects with their own viewport defaults.

### D. `packages/haiku-ui/playwright.config.ts` (NEW)

   - Config: `testDir: "./tests"`, `testMatch: /review-page\.spec\.ts$/`, `use: { baseURL: "http://localhost:5173" }`, `expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005 } }`.
   - `webServer: { command: "npm run dev", port: 5173, reuseExistingServer: true, cwd: __dirname }`.
   - `projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 900 } } }, { name: "mobile", use: { viewport: { width: 390, height: 844 } } }]`.
   - `snapshotDir: "./tests/__snapshots__"` (shared with parity snapshot dir; Playwright manages its own subdirectory conventions via project name).

### E. `packages/haiku-ui/test-fixtures/review-session-full.json` (NEW)

   - Shape: `ReviewSessionPayload` (same as `review-session.json`) with:
     - `session_id: "test-review-full"`, `session_type: "review"`, `status: "pending"`, `intent_slug: "test-intent"`, `review_type: "intent"`, `gate_type: "ask"`, `target: "test-intent"`.
     - `intent`: populated with a realistic title + a handful of sections so the `IntentReview` branch renders real tabs.
     - `units`: 3 representative units with titles + frontmatter.
     - `criteria`: 5 criteria items (mix of complete / incomplete).
     - `intent_mockups`: 2 image URLs (stable placeholder paths; the Playwright spec doesn't hit real images — it screenshots a locally-served page).
     - `stage_states`: three stages — design/completed, development/active, qa/pending.
     - `knowledge_files`, `stage_artifacts`, `output_artifacts`: each an empty array (keeps the fixture small; tab order still renders).
   - Separate fixture: `test-fixtures/review-feedback-full.json` (new, embedded as `feedback` inside the session? NO — feedback lives at `GET /api/feedback/…`, not inside the session payload). The 20-item feedback list lives in `review-feedback-full.json` and is served by the mock `ApiClient.feedback.list()` callback during the vitest + Playwright runs.

### F. `packages/haiku-ui/test-fixtures/review-feedback-full.json` (NEW)

   - 20 feedback items: 7 pending, 5 addressed, 4 closed, 4 rejected. Across origins: 6 adversarial-review, 4 user-visual, 4 user-chat, 2 external-pr, 2 external-mr, 2 agent. Visit range 1-6 (exercises all three visit-counter tiers). Each item has a realistic 2-3 sentence `body` and a short `title`.

### G. `packages/haiku-ui/src/main.tsx` (EDIT — fixture hook, ~10 lines)

   - On startup, read `window.location.search` for a `fixture=` param. If set, lazy-load `./test-fixture-loader.ts` (new, module-guarded via `import.meta.env.DEV`) which returns a fixture-backed `ApiClient`. Override the default `<ApiClientProvider client={fixtureClient}>` before mounting `<App />`.
   - If no `fixture=` param, behavior is unchanged (real `ApiClient`).

### H. `packages/haiku-ui/src/test-fixture-loader.ts` (NEW — dev-only)

   - Wraps JSON imports of `review-session-full.json` + `review-feedback-full.json` and returns a mock `ApiClient` object implementing the full interface: `fetchSession`, `fetchReviewCurrent`, `feedback.list/create/update/delete`, `submitDecision`. Mutation methods update an in-memory copy of the fixture (so the optimistic-UI dance still works in the browser) and resolve after 50ms (simulating network).
   - Gated: `if (!import.meta.env.DEV) throw new Error("Fixture loader is DEV-only")`. Vite tree-shakes the entire module in production builds.

### I. `packages/haiku-ui/vitest.config.ts` (EDIT — add Playwright exclude)

   - One-line addition: `exclude: ["tests/review-page.spec.ts"]` (or expand the existing exclude array if present). Prevents Vitest from importing the Playwright spec.

### J. `packages/haiku-ui/package.json` (EDIT — add `@playwright/test` devDep)

   - `"devDependencies": { …existing…, "@playwright/test": "^1.58.2" }`.
   - Install command: `npm install --workspace haiku-ui --save-dev @playwright/test@^1.58.2` (or from root: `npm install --save-dev @playwright/test@^1.58.2 -w haiku-ui`).
   - One-time setup: `npx playwright install chromium` (documented in the spec file header comment).

### K. `packages/haiku-ui/src/components/ReviewPage.tsx` (EDIT — expose named exports, retire top-level `ReviewPage`)

   - Add `export` keyword to: `IntentReview`, `UnitReview`, `RereviewBanner`, `MockupEmbeds`, `UnitsTable`, `markdownToSimpleHtml`, `isImageUrl`, `findSection`, `findSectionWithSubs`, `getPreamble`, `loadDraft`, `saveDraft`, `DRAFT_STORAGE_KEY`.
   - Change `export function ReviewPage(...)` to re-export from the new location: `export { ReviewPage } from "../pages/review/ReviewPage"`. Preserve the `ReviewPageSessionData` type export.
   - NO internal logic changes; just export-surface edits. The legacy file shrinks by the ~100-line top-level `ReviewPage` function body and grows by one re-export line.

### L. `packages/haiku-ui/tests/__snapshots__/review-page-desktop.png` + `review-page-mobile.png` (NEW — Playwright baselines)

   - Generated by `npx playwright test --update-snapshots` on first run. Committed verbatim as binary files.

### M. `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/unit-07-tactical-plan.md` (THIS FILE)

### N. `.haiku/intents/.../units/unit-07-review-page-desktop-and-mobile.md` (EDIT — populate `outputs:` after build)

   - Append the full outputs list after the builder commits the new files.

## Implementation Steps (ordered for the builder)

1. **Write this tactical plan** — done (commit `haiku(unit-07/planner): tactical plan for review page desktop + mobile`).
2. **Add `@playwright/test` devDep** — edit `packages/haiku-ui/package.json`; run `npm install --workspace haiku-ui --save-dev @playwright/test@^1.58.2`; run `npx playwright install chromium` to fetch the browser binary. Verify via `npx playwright --version`. Commit as `haiku(unit-07/builder): add @playwright/test devDep`.
3. **Ship the fixture files** (`review-session-full.json` + `review-feedback-full.json`). Hand-craft to match the shapes in `haiku-api/src/schemas/`. Commit.
4. **Ship `test-fixture-loader.ts` + `main.tsx` query-param hook**. Quick smoke test: `npm run dev --workspace haiku-ui`, open `http://localhost:5173/review/test-review-full?fixture=review-session-full`, verify the page mounts with 20 feedback items. Commit.
5. **Expose named exports on `components/ReviewPage.tsx`** (step K above) + retire the top-level `ReviewPage` to a re-export stub. Typecheck from `packages/haiku-ui/` — assert zero errors. Commit.
6. **Ship `pages/review/useIsMobile.ts`**. Inline vitest for the hook (mocks `matchMedia`). Commit.
7. **Ship `pages/review/FooterBar.tsx`** with three decision buttons wired via `useApiClient().submitDecision(...)`. No test file at this step (coverage comes through `responsive.test.tsx` + `status-announce.test.tsx` in step 10). Commit.
8. **Ship `pages/review/FeedbackSidebar.tsx`** with `FeedbackSidebar` + `FeedbackSheet` + `FeedbackFloatingButton` as named exports. Consumes `useFeedback` + `useApiClient`. Includes `useAnnounce` on status change. Commit.
9. **Ship `pages/review/ArtifactsPane.tsx`** as a thin delegation to the legacy `IntentReview` / `UnitReview`. Commit.
10. **Ship `pages/review/ReviewPage.tsx`** as the three-pane composition shell. Ties together `ArtifactsPane` + `FeedbackSidebar` (desktop) / `FeedbackFloatingButton` + `FeedbackSheet` (mobile) + `FooterBar`. Commit.
11. **Flip `pages/review/index.tsx` import** from `../../components/ReviewPage` to `./ReviewPage`. Typecheck. Commit.
12. **Ship `responsive.test.tsx`** + `status-announce.test.tsx`. Run `npm run test --workspace haiku-ui -- pages/review/` — assert both pass. Commit.
13. **Ship `playwright.config.ts`** + `tests/review-page.spec.ts`. Run `npx playwright test --config=packages/haiku-ui/playwright.config.ts --update-snapshots` to generate baselines. Commit the baselines alongside the spec.
14. **Edit `vitest.config.ts`** to add the Playwright exclude (`exclude: ["tests/review-page.spec.ts"]`). Re-run `npm run test --workspace haiku-ui` — assert the full vitest suite (including the new tests) passes. Commit.
15. **Run `audit-banned-patterns.mjs --profile=tokens`** — assert zero hits. If any banned verb / banned sidebar drift / banned focus-ring-1 / banned content-max-literal hits appear, fix inline and re-run. Commit only after clean.
16. **Run `audit-banned-patterns.mjs --profile=stage-wide`** — assert zero hits on the `{origin}` regression and the `Show agent feedback inline` presence rules (neither applies to this unit's files, but the run is cheap verification).
17. **Run `npx tsc --noEmit` from `packages/haiku-ui/`** — assert zero errors.
18. **Append `outputs:` to `unit-07-review-page-desktop-and-mobile.md` frontmatter**. Commit.
19. **Run `npx playwright test --config=packages/haiku-ui/playwright.config.ts`** (without `--update-snapshots`) — assert both projects pass with ≤ 0.5% diff against the committed baselines.
20. **Call `haiku_unit_advance_hat`** — hands off to builder hat (who executes steps 2–19 guided by this plan). The planner's role ends after the plan commit.

**PLANNER advance-hat checklist (the only steps this hat executes before calling `advance_hat`):**
- [x] Context read: DESIGN-TOKENS, DESIGN-BRIEF, footer-button-copy-spec, state-coverage-grid, unit spec, inline + mobile artifact HTMLs, comment-to-feedback-flow artifact, review-ui-feedback feature, acceptance-criteria, unit-06 and unit-08 tactical plans, existing `components/ReviewPage.tsx`, `ReviewCurrentPage.tsx`, `ReviewSidebar.tsx`, `FeedbackPanel.tsx`, `pages/review/index.tsx`, `api/client.ts`, `a11y/` barrel, `audit-config.json`.
- [x] Write `stages/development/artifacts/unit-07-tactical-plan.md` (this file).
- [ ] Commit as `haiku(unit-07/planner): tactical plan for review page desktop + mobile`.
- [ ] Call `haiku_unit_advance_hat`.

---

## Verification Commands (builder + reviewer)

Run from the unit worktree root:

```bash
# Typecheck
npm --workspace haiku-ui run typecheck

# Unit tests (all)
npm --workspace haiku-ui run test

# Unit tests (review page only)
npm --workspace haiku-ui run test -- pages/review/

# Banned-patterns audit (unit scope)
node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=tokens

# Banned-patterns audit (stage-wide — catches {origin} regression, agent-toggle presence)
node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=stage-wide

# Token parity
node packages/haiku-ui/scripts/verify-tokens.mjs

# Playwright visual regression (baselines must be committed first)
npx playwright test --config=packages/haiku-ui/playwright.config.ts

# Playwright baseline regeneration (one-time / after intentional visual changes)
npx playwright test --config=packages/haiku-ui/playwright.config.ts --update-snapshots
```

Expected: every command exits 0. Every completion criterion in the unit spec is traceable to one of these commands plus the inline snapshot assertions in the two new `__tests__/*.test.tsx` files.

---

## Open Questions (surface to reviewer if any)

1. **Playwright CI integration** — this unit ships the Playwright spec + config + baselines, but the repo's existing CI workflow (at `.github/workflows/` or similar) does NOT yet run Playwright on PRs. Wiring Playwright into CI is out of scope for this unit (no CI file edits). The reviewer should confirm that's acceptable — the baselines are committed and the spec passes locally; CI integration is a follow-up. If CI integration is a hard requirement, it's a separate unit.
2. **`ReviewCurrentPage` migration** — this unit does NOT migrate `/review/current` to the new cluster. The completion criterion "ReviewPage renders at `/review/:id` AND `/review/current`" is satisfied by the existing `ReviewCurrentPage` which already consumes the unit-08 feedback cluster via `FeedbackPanel`'s shim. If the reviewer interprets the criterion as "BOTH routes must use the new `pages/review/ReviewPage.tsx` composition", that's a second bolt — the migration is a ~15 line file swap that follows the same pattern as step 11 above, but retargeting a different page module. Call this out explicitly so the reviewer can push back if the interpretation differs.
3. **Fixture query param vs dedicated HTML entry** — chosen path is the query-param hook (step 4 above). Alternative is a dedicated `public/review-mock.html` entry. Both work; the query param is less invasive (one file edited vs one file added). The reviewer can request the alternative if a cleaner separation is preferred.

None of the three are load-bearing — everything the unit spec asks for has a direct implementation path in this plan. The policy picks are reversible single-commit fixes if the reviewer wants a different shape.
