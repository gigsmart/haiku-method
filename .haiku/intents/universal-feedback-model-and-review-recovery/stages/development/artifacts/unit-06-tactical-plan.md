# Tactical Plan: unit-06 Shell and Routing Refactor

> **UPDATE 2026-04-21 (bolt-3, user directive)** — The Lighthouse CI gate described below has been REMOVED. `chrome-launcher` (a transitive dep of `lighthouse`) was clobbering the developer's local Chrome profile, which is unacceptable on contributor hardware. Replacement: `packages/haiku-ui/tests/a11y-pages.spec.tsx` — a jsdom-rendered axe-core pass per route, asserting zero violations across tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. Deleted files: `packages/haiku-ui/scripts/audit-lighthouse.mjs`, `packages/haiku-ui/lighthouserc.json`. Removed devDeps: `lighthouse`, `@lhci/cli`. Added devDep: `axe-core`. Sections B/C/D below that reference Lighthouse reflect the planner's original thinking; the implemented gate is the axe spec.

Owner: planner (bolt 1)
Target: Rebuild `packages/haiku-ui/src/App.tsx` from 261 lines of branching page-specific JSX into a < 100-line clean shell composed of the unit-05 a11y landmark primitives (`<Header>` / `<Main>` / `<FooterBar>`), a typed route parser, four lazy-loaded per-page modules under `src/pages/`, the canonical skip link, mounted `<LiveRegionShell>`, a canonical `Header` component (brand + breadcrumb + theme toggle + help trigger), and an aria-labeled icon-only `ThemeToggle`. The build must preserve the committed DOM parity snapshots (`tests/__snapshots__/parity.spec.tsx.snap`) byte-for-byte where feasible and, where the refactor changes stable markup, refresh the snapshot in the same commit with an explicit rationale. ~~Adds a Lighthouse CI harness script at `scripts/audit-lighthouse.mjs` + `lighthouserc.json` + pinned `lighthouse` dep~~ Adds a per-route axe-core test at `tests/a11y-pages.spec.tsx`, and a new RTL test that presses Tab once on page load and asserts the skip link receives focus.

---

## Context & Prior Art

- **unit-03** extracted `packages/haiku-ui/` as its own Vite workspace (React 19, Tailwind v4, vitest+jsdom). `vitest.config.ts` already globs `src/**/*.{test,spec}.{ts,tsx}` + `tests/**`, so a new test at `src/routing/__tests__/parseRoute.test.ts` or `tests/skip-link.spec.tsx` is picked up for free. No config change.
- **unit-04** shipped design-token primitives and the `@theme`-backed feedback color aliases. Nothing in unit-06's scope touches token wiring; we only consume the existing Tailwind classes.
- **unit-05** shipped the a11y foundation at `src/a11y/` — `Header`, `Main`, `Aside`, `Nav`, `FooterBar` landmark primitives (`landmarks.tsx`), `<LiveRegionShell>` + `announce` + `useAnnounce` (`live-regions.tsx`), `focusRingClass` + `useFocusTrap` (`focus.ts`), `useShortcut` + `KEYBOARD_SHORTCUT_REGISTRY` (`keyboard.ts`), `touchTargetClass` + `touchTargetHitAreaClass` (`touch-target.ts`), `useReducedMotion` + `motionSafeClass` (`reduced-motion.ts`). Barrel at `src/a11y/index.ts`. **This unit is the first downstream consumer** — we import `Header`, `Main`, `FooterBar`, `LiveRegionShell`, `focusRingClass`, `touchTargetClass` directly.
- **Current `App.tsx` (261 lines)**: top-level `parseRoute()` inline, then `App` branches to `ReviewCurrentLoader` or `SessionLoader`. Each of those two internal components re-implements the header + main + footer shell with inline markup. Duplication is ~90 lines between the two loaders. `<main id="main-content">` is already present, but there is no `<header role="banner">` (just a styled `<header>` element without role), no `<FooterBar>`, no skip link, no `<LiveRegionShell>`, no explicit 404 branch (returns an unlabeled `<div>` centered on screen).
- **aria-landmark-spec.md §1 DOM order**: skip-link first, then `<header role="banner">`, then `<main id="main-content" role="main">`, then the live-region shell (as siblings of main). The landmark primitives in `a11y/landmarks.tsx` already wire `role="banner"`, `id="main-content" role="main" tabIndex={-1}`, and `role="contentinfo"` — nothing new to build at the a11y layer.
- **skip-link-spec.html §1**: canonical pattern is a `sr-only` anchor that becomes visible on focus at `top-2 left-2 z-[100] px-3 py-2 bg-teal-600 text-white rounded-md ring-2 ring-teal-500 ring-offset-2 dark:ring-offset-stone-900`. The unit spec asks for a single skip link "Skip to main content"; the spec HTML shows a second "Skip to feedback list" anchor used by feedback-layout artifacts — that one is NOT in scope here (no sidebar exists yet in the shell). The unit spec explicitly cites the skip-link as the **regression guard for the missing-skip-link class of issue** — only the `#main-content` skip link lands in unit-06.
- **stage-progress-strip.html** is in the inputs list because the `Header` component is the natural embedder of the strip in review pages — the unit spec says: _"Header.tsx — canonical app header; brand, active-intent breadcrumb, theme toggle, keyboard-shortcut-help trigger."_ The strip itself is a downstream unit's concern (unit-12 at the stage level, which is a different intent); here we just pass through an optional `children` slot so review pages can inject the strip later. The inputs list includes the strip so the planner is aware the breadcrumb area is reserved for that future composition.
- **DESIGN-TOKENS.md §1.1 (SPA neutrals)**: stone/teal is the SPA palette — we preserve `bg-white dark:bg-stone-900`, `border-stone-200 dark:border-stone-800`, `text-stone-500 dark:text-stone-400`, `text-teal-600 dark:text-teal-400`, `focus-visible:ring-teal-500` etc. Nothing new; no token drift this unit.
- **Existing parity snapshot**: `tests/__snapshots__/parity.spec.tsx.snap` commits the normalized rendered DOM for each of the three session fixtures. `parity.spec.tsx` asserts `<header`, `id="main-content"`, `Powered by` are present in the output and snapshots the full DOM. **The refactor changes markup** — we add a skip-link `<a>` as the first body child, wrap the header in the `<Header>` primitive (adds `role="banner"`), wrap main in `<Main>` (adds `role="main" aria-label="Review content" tabIndex={-1}`), wrap footer in `<FooterBar>` (adds `role="contentinfo"`), and mount the `<LiveRegionShell>`. These are **additive semantic changes** that the existing assertions do not check for — the structural `expect(rendered).toContain('<header')` and `expect(rendered).toContain('id="main-content"')` continue to pass. The snapshot file must be refreshed (with `-u` or deletion) because the stringified DOM does change, and that refresh is part of this unit's commit, with a commit message that cites which semantic attributes were added.
- **`parseRoute()` current behavior**: returns `{ pageType: string, sessionId: string } | null`. We strengthen this to a discriminated union — `pageType: 'review' | 'review-current' | 'question' | 'direction'`. Narrowed string literal means `SessionLoader` (and whichever per-page module it dispatches to) carries a stricter type through. Catches typos and is a compiler-checked source of truth for the four page types.
- **`main.tsx` theme-init code**: duplicates the logic in `ThemeToggle.tsx` `applyTheme()`. The unit spec puts theme-init INSIDE `App.tsx` ("_theme init, landmark composition..._"), so we move the applyTheme() from `main.tsx` into `App.tsx` as a `useEffect` that runs once on mount. `main.tsx` then only boots Sentry, mounts `<App>`, and provides `ApiClientProvider`. This eliminates the double-wiring.
- **ThemeToggle today**: icon + text label ("System" / "Dark" / "Light"), three-state cycle (system → dark → light → system). Unit-06 spec requires **icon-only** `<button>` with `aria-label="Toggle theme"` (exact string). Scope note: the spec says `touchTargetClass` applied and aria-label verbatim. We change the visible surface to be a single glyph (no text span, no separate label span) and change the state cycle to a **binary** light↔dark toggle (the three-state system/dark/light model is out of scope per spec — spec says "switches light/dark, persists via localStorage"). The system-preference detection stays on initial load (in `App.tsx`), but the toggle itself is binary. Document the semantic simplification in the ThemeToggle jsdoc.
- **`Header` component**: doesn't exist yet. Unit-06 creates `src/components/Header.tsx` as a thin layout component that renders `<Header>` (primitive) with children slot for the brand/title + optional breadcrumb + always-visible `ThemeToggle` + optional help trigger. Keep it < 50 LOC. The per-page title is passed in as a prop; the help trigger and breadcrumb are `null` for v1 — they're reserved slots documented in the component jsdoc so downstream units can fill them without re-shaping the component.

## Git-history signal

- `packages/haiku-ui/src/App.tsx` is a medium-churn file (touched by unit-03 extraction + unit-04 token adjustments). The refactor is a full rewrite scoped to this file — no merge conflict risk because other open units don't touch App.tsx (verified by the worktree listing — no other concurrent unit names it in scope).
- `packages/haiku-ui/src/main.tsx` was last touched in unit-03 to add `ApiClientProvider`. Unit-06 removes the `applyTheme()` function and its `matchMedia` listener — low-risk because the function moves into App.tsx verbatim.
- `packages/haiku-ui/src/components/ThemeToggle.tsx` was last authored by unit-03's extraction. Zero shared churn — unit-06 is the only open unit touching it.
- `packages/haiku-ui/tests/parity.spec.tsx` has a committed snapshot. Refreshing the snapshot is part of this commit; `git show HEAD -- tests/__snapshots__/parity.spec.tsx.snap` will diff cleanly once semantic attributes land.
- `packages/haiku-ui/package.json` — we add `lighthouse` + `@lhci/cli` as pinned devDependencies. This churns the root lockfile (`package-lock.json` or `bun.lockb`). Verify the repo's package manager before running install — check `lockfile` presence in repo root.
- `packages/haiku-ui/scripts/` — greenfield for the new `audit-lighthouse.mjs`; existing sibling scripts (`audit-banned-patterns.mjs`, `audit-contrast.mjs`, `verify-tokens.mjs`) don't conflict.

## Behavioral spec coverage (MUST implement per hat contract)

The hat definition is unambiguous: _"The tactical plan MUST include a step for implementing test coverage for every scenario in the product stage's `.feature` files — either as Cucumber step definitions (if the project uses a BDD runner) or as equivalent tests in the project's test framework."_

The repo does NOT use Cucumber — the product stage's `.feature` files are spec artifacts, not executable. Equivalent coverage is provided by vitest suites. Unit-06's scope is **shell and routing only** — not every product-stage scenario. We map only the scenarios that fall inside unit-06 scope; the rest are covered by downstream units (and explicitly noted out of scope in §"Out-of-scope scenarios").

### In-scope scenarios → unit-06 test files

Per the unit spec "Completion Criteria": the new tests that this unit MUST add are (1) skip-link focus-on-Tab, (2) route-parser coverage for the four page types + null, (3) 404 placeholder renders with landmark primitives, (4) ThemeToggle aria-label + behavior, (5) parity snapshot refreshed with the new semantics. No `.feature` scenario drives shell refactor behavior directly — the features are about feedback CRUD, revisit flow, external review, etc. All of those consume the shell but none dictate its internal structure. So the BDD-equivalent assertion for this unit is: **"the existing parity snapshot continues to pass + new RTL tests cover skip-link, parseRoute, 404, and ThemeToggle."** That is captured in the test files below.

The one product-stage assertion the shell refactor DOES need to preserve: `review-ui-feedback.feature` Scenario "Single inline comment becomes a feedback file on Request Changes" requires the review page to render — so the `SessionLoader → ReviewPage` path must still work. That is covered by the existing `parity.spec.tsx` review-session snapshot, which this unit re-runs unchanged (save for refreshed snapshot content reflecting added landmark attributes).

### Out-of-scope scenarios (tracked but not implemented here)

The following `.feature` files map to downstream units; noted here so the hat contract is satisfied by explicit scope-management, not silence:

- `review-ui-feedback.feature` (feedback CRUD + Request Changes writing files) — belongs to unit-08 (feedback components) and unit-05 (feedback-lifecycle-ownership).
- `auto-revisit.feature` (revisit on pending feedback) — belongs to orchestrator + `haiku_revisit` flow, not the shell.
- `enforce-iteration-fix.feature` — belongs to unit-06-enforce-iteration-fix (a separately-named unit in this intent, different worktree).
- `external-review-feedback.feature` — belongs to unit-07 external review detection (separate unit).
- `feedback-crud.feature` — unit-05 ownership.
- `revisit-with-reasons.feature` — unit-06-revisit-confirmation-modal (separate unit).
- `additive-elaborate.feature` — elaboration-phase concern, not review-app.

The review-app shell only needs to not regress any of those flows. Regression is prevented by the parity snapshot + the four new routing tests.

## Risks & Blockers

1. **Lighthouse fixture-server boot is non-trivial.** The unit spec says: _"boots the built SPA on an ephemeral port using committed fixtures, runs Lighthouse CI..."_ This requires (a) a `vite build` first, (b) a static server serving `dist/` + a JSON fixture endpoint at `/api/sessions/:id` returning the three committed fixtures + a `/api/review/current` endpoint returning synthesized data, (c) invoking `@lhci/cli` with the `lighthouserc.json` config. **Decision**: the script uses Node's built-in `http` server to serve `dist/index.html` for every non-`/api/*` path (SPA fallback) and the three committed `test-fixtures/*.json` files for `/api/sessions/demo`, `/api/sessions/test-review-1`, etc. `demo` is the stable ID used in the Lighthouse URLs. This avoids adding `express` or `sirv` as a dependency — Node's `http` is plenty. The fixture-server code is ~60 LOC inline in `audit-lighthouse.mjs`. Lighthouse is invoked via `@lhci/cli autorun` with `upload.target=filesystem` so no external LHCI server is needed.
2. **Lighthouse dep weight on install.** `lighthouse` + `@lhci/cli` together pull ~60MB of Chromium artifacts via `puppeteer` dep. Pin exact versions in `package.json` to avoid silent upgrades. `lighthouse@12.3.0` is the current stable at time of planning; lock to that. The install cost is paid once (dev-only); CI runs `npm ci` and caches.
3. **Snapshot refresh is a blast-radius touchpoint.** If the parity snapshot refresh hides an unintended semantic regression, we only catch it on the next PR's diff. Mitigation: the commit message for the snapshot refresh MUST cite every added attribute (role="banner", role="main", role="contentinfo", tabIndex="-1" on main, skip-link anchor text, live-region shell IDs). A reviewer can eyeball those in the snapshot diff against the enumerated list. Do NOT blanket `-u` the snapshots without a line-level explanation.
4. **Per-page lazy-loading — actual size vs. bundle goal.** Vite's config at `packages/haiku-ui/vite.config.ts` sets `inlineDynamicImports: true` + `cssCodeSplit: false`. That **disables code-splitting**. So `React.lazy(() => import('./pages/review'))` compiles away — every page ships in the same bundle. The unit spec says "each page-type is a lazy-loaded module" — read pragmatically, this means each page-type **lives in its own module file** (one folder per page-type under `src/pages/`), which serves code-organization and per-unit ownership clarity. It does NOT mandate runtime chunk separation, which is incompatible with the existing single-HTML build strategy. Document this in the page-module index header so a future maintainer who wants actual lazy chunks knows to flip the vite config first. Use plain `import` statements, not `React.lazy`.
5. **`review-current` page-type was a second branch in the old `App.tsx`.** It uses a different data source (`fetchReviewCurrent()` returning `ReviewCurrentPayload`, not `SessionPayload`). Its data loader must stay distinct. We put it in `src/pages/review-current/ReviewCurrentPage.tsx` — the page module owns the fetch; the shell just dispatches. The existing `ReviewCurrentPage` component under `src/components/` keeps its pure-render contract and is re-exported from `src/pages/review-current/index.tsx` to avoid a breaking import path for whoever else might import it. Move OR re-export — choose re-export to minimize churn. **Chosen**: re-export from `src/pages/review-current/index.tsx`.
6. **`parseRoute()` null branch rendering.** Current behavior renders a centered `<div>` saying "No session found in URL." Unit spec: _"unknown renders a 404 placeholder using landmark primitives."_ So the null branch becomes a proper `<Header>` + `<Main aria-label="Not found">` + `<FooterBar>` shell with a 404 message inside. The `<Header>` still shows the ThemeToggle (consistent chrome), but no breadcrumb. No route info is included in the message (prevents open-redirect-style confusion). Covered by a new test case in `parseRoute.test.ts` + an RTL render assertion.
7. **Theme initialization order.** Moving `applyTheme()` from `main.tsx` into `App.tsx` as a `useEffect` introduces a brief flash-of-unstyled-content because the `useEffect` fires after the first paint. Mitigation: keep a short inline `<script>` in `index.html` that reads `localStorage['haiku-review-theme']` and toggles the `dark` class on `<html>` **before** React mounts. This is the canonical no-FOUC pattern. The `useEffect` in App.tsx keeps the matchMedia listener for live system-preference changes. **Chosen**: tiny (~10 LOC) inline script in `index.html`; document it in a comment cross-linking to App.tsx.
8. **ThemeToggle: icon-only collapse changes visible behavior.** Current toggle shows icon + text label (a visible affordance for sighted users). Spec removes the text label. We preserve affordance via tooltip-like `title` attribute + aria-label. Document this UX narrowing in the ThemeToggle jsdoc: users who relied on reading "Dark / Light / System" must now rely on the icon alone. If any design review flags this as a regression, the binary light↔dark toggle is still the correct scope — the three-state system option moves to a future settings menu.
9. **Routing — `/review/current` is a **prefix collision** with `/review/:id`.** The current `parseRoute` handles this by testing `/review/current` FIRST, before the regex for `/review/:sessionId`. We preserve that order in the new `parseRoute.ts`. A test case asserts `parseRoute('/review/current')` returns `{pageType: 'review-current', sessionId: 'current'}` and NOT `{pageType: 'review', sessionId: 'current'}`.
10. **RTL test for skip-link focus.** The spec says: _"verified by an RTL test that presses Tab once on page load and asserts the skip link receives focus."_ jsdom + React Testing Library supports `fireEvent.keyDown(document.body, {key: 'Tab'})` but this does NOT advance `document.activeElement` by default — Tab handling is a browser concern, not jsdom. Mitigation: the test uses `userEvent.tab()` from `@testing-library/user-event` which is a utility that updates `document.activeElement` explicitly to walk the tab order. `@testing-library/user-event` is NOT currently a dependency. **Add** `@testing-library/user-event@14.x` as a devDependency. Tested on multiple open-source React apps; well-maintained; ~20KB. Document the addition in `package.json` with a dep-rationale comment (via package-lock.json comments are impossible, so mention in the commit message).
11. **Scope-violation risk.** Unit scope is `packages/haiku-ui/**` exclusively. No files outside that package. No edits to `packages/haiku/`, `packages/shared/`, `packages/haiku-api/`, nothing in `plugin/`, nothing at the repo root. The one exception: `packages/haiku-ui/package.json` and the repo's package-lock file, which is updated by `npm install` (or `bun install`). If the lockfile lives at the repo root, the lockfile edit is legitimate (it's a cascade consequence of the in-scope package.json change). Verify lockfile location before committing.
12. **Header component breadcrumb slot deferred.** The unit spec says Header has a _"brand, active-intent breadcrumb, theme toggle, keyboard-shortcut-help trigger."_ The active-intent breadcrumb and shortcut-help trigger require data (current intent name; shortcut-help modal) not available in this unit. Render the brand + theme toggle always; render `props.breadcrumb` and `props.helpTrigger` as optional slots (React nodes). Downstream units fill them; this unit tests that both slots render when passed and are absent when not.
13. **`useFocusTrap` is NOT needed here** — there's no modal in unit-06's scope. Don't import it; keep the module graph small.
14. **`useShortcut` for help trigger deferred.** The help trigger uses the `?` shortcut per the keyboard-shortcut-map. But the help modal itself is not in unit-06 scope. Don't wire `useShortcut` here; the help-trigger button is a placeholder that calls `props.onHelpClick` — downstream units bind the shortcut.
15. **Component size budget.** App.tsx < 100 lines is a hard gate in the completion criteria. Current refactor sketch: imports (~15) + `applyInitialTheme()` helper (~15) + `App()` body with `parseRoute` dispatch and 404 branch (~30) + `SessionLoader` dispatcher that routes to per-page modules (~25) — total ~85 LOC. Comfortable margin. If we overshoot, the `applyInitialTheme` helper moves to `src/theme.ts`.
16. **`react-markdown` / `remark` are page-level deps, not shell.** App.tsx MUST NOT import markdown renderers — the shell is layout-only. Verify via grep in the completion step.
17. **AnnotationCanvas is out of scope** (unit-13). The existing `ReviewPage` component internally imports AnnotationCanvas; the shell just dispatches to ReviewPage. No refactor of that import chain.
18. **Worktree state has modified files**. The worktree starts clean at unit start (haiku_unit_start resets to stage-branch). Verify `git status` before first commit is clean except our additions.

## Files to Modify / Create

### A. New files — shell layer

A1. **`packages/haiku-ui/src/routing/parseRoute.ts`** (NEW)
   - Typed route parser. Exports `type PageType = 'review' | 'review-current' | 'question' | 'direction'` and `export interface ParsedRoute { pageType: PageType; sessionId: string }`.
   - `export function parseRoute(pathname?: string): ParsedRoute | null`. Default arg is `window.location.pathname` (guarded for SSR: `typeof window === "undefined" ? "/" : window.location.pathname`).
   - Matches in this order: (1) `/review/current` → `{pageType: 'review-current', sessionId: 'current'}`, (2) `/review/:id` via regex `^\/review\/([^/]+)/?$`, (3) `/question/:id`, (4) `/direction/:id`. Any other path → `null`.
   - Input allowlist: reject paths containing `..` segments (path-traversal defense). Just return `null`.
   - < 50 LOC.

A2. **`packages/haiku-ui/src/routing/__tests__/parseRoute.test.ts`** (NEW)
   - Table-driven tests:
     - `/review/current` → `{pageType: 'review-current', sessionId: 'current'}`
     - `/review/abc-123` → `{pageType: 'review', sessionId: 'abc-123'}`
     - `/review/current/extra` → `null` (strict single-segment id)
     - `/question/xyz` → `{pageType: 'question', sessionId: 'xyz'}`
     - `/direction/q1` → `{pageType: 'direction', sessionId: 'q1'}`
     - `/` → `null`
     - `/unknown/path` → `null`
     - `/review/` → `null` (empty sessionId)
     - `/review/../etc` → `null` (path traversal)
   - Each test pass, vitest.

A3. **`packages/haiku-ui/src/components/Header.tsx`** (NEW)
   - Thin layout component. Imports `Header as HeaderLandmark` from `../a11y`.
   - Props: `{ title: ReactNode; breadcrumb?: ReactNode; helpTrigger?: ReactNode; className?: string }`.
   - Renders `<HeaderLandmark className="sticky top-0 z-40 bg-white/80 dark:bg-stone-900/80 backdrop-blur border-b border-stone-200 dark:border-stone-800">` wrapping a `<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">` that composes: brand (title), optional breadcrumb (between title and toggle), helpTrigger (optional), `<ThemeToggle />`.
   - Default title is the text `"H·AI·K·U Review"` when parent doesn't pass one (delegated explicitly — no hidden fallback in shell).
   - < 50 LOC.

A4. **`packages/haiku-ui/src/components/SkipLink.tsx`** (NEW)
   - Single component. Renders `<a href="#main-content" className={...}>Skip to main content</a>` with the canonical sr-only-until-focused class chain from skip-link-spec.html §1. Uses `focus-visible:*` prefix so it only reveals on keyboard focus.
   - Exact className: `"sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[100] focus-visible:px-3 focus-visible:py-2 focus-visible:bg-teal-600 focus-visible:text-white focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900 focus-visible:outline-none"`.
   - The component renders the anchor only; it does NOT wrap in a `<nav>` because a single skip link is a direct body child per §1 DOM order.
   - < 25 LOC.

A5. **`packages/haiku-ui/tests/skip-link.spec.tsx`** (NEW)
   - Vitest + RTL + user-event test.
   - Renders `<App />` wrapped in `<ApiClientProvider>` with mocked client (same pattern as `parity.spec.tsx`).
   - Sets `window.history.replaceState({}, "", "/review/test-review-1")` to route into SessionLoader.
   - Waits for `#main-content` to appear (same `waitForSessionRender` helper pattern).
   - Calls `await userEvent.tab()` once.
   - Asserts `document.activeElement` has `textContent === "Skip to main content"` AND `tagName === "A"` AND `getAttribute('href') === '#main-content'`.
   - Second assertion: `document.activeElement.matches('a[href="#main-content"]')` is `true`.
   - Third: activating the link (`userEvent.click(document.activeElement)`) followed by `document.activeElement` = the `<main>` element (its `tabIndex={-1}` allows programmatic focus).

A6. **`packages/haiku-ui/src/pages/index.ts`** (NEW)
   - Barrel re-export: `ReviewPageModule` from `./review`, `ReviewCurrentPageModule` from `./review-current`, `QuestionPageModule` from `./question`, `DirectionPageModule` from `./direction`. Types for page-module interface too (see A7).

A7. **`packages/haiku-ui/src/pages/review/index.tsx`** (NEW)
   - Thin wrapper re-exporting the existing `ReviewPage` component from `src/components/ReviewPage.tsx`. Also re-exports the session loader logic: `export function ReviewPageModule({ sessionId }: { sessionId: string })` — internally calls `useSession(sessionId)` and dispatches to `<ReviewPage>`. This consolidates the SessionLoader branching per page-type.
   - Moves the `asReviewPageSession` cast helper here (was in App.tsx).
   - < 50 LOC.

A8. **`packages/haiku-ui/src/pages/review-current/index.tsx`** (NEW)
   - Re-export of `ReviewCurrentPage` from `src/components/ReviewCurrentPage.tsx`. Hosts the `fetch('/api/review/current')` loader that was previously in `ReviewCurrentLoader` in App.tsx. Uses the injected `ApiClient.fetchReviewCurrent` method (see api/client.ts) — NOT raw fetch. This aligns with the unit spec phrase "consuming the session from `haiku-api`".
   - Export: `export function ReviewCurrentPageModule()`.
   - < 60 LOC.

A9. **`packages/haiku-ui/src/pages/question/index.tsx`** (NEW)
   - Re-export of `QuestionPage`. Export: `export function QuestionPageModule({sessionId}) { const {session, loading, error} = useSession(sessionId); ... }`.
   - < 50 LOC.

A10. **`packages/haiku-ui/src/pages/direction/index.tsx`** (NEW)
    - Re-export of `DesignPicker` (despite the folder being `direction/`, the component name is historical). Export `DirectionPageModule`.
    - < 50 LOC.

### B. Files to modify

B1. **`packages/haiku-ui/src/App.tsx`** (MODIFY — full rewrite, target < 100 LOC)
   - New structure (pseudocode):
     ```tsx
     import { Header as HeaderLandmark, Main, FooterBar, LiveRegionShell } from "./a11y"
     import { SkipLink } from "./components/SkipLink"
     import { Header } from "./components/Header"
     import { parseRoute } from "./routing/parseRoute"
     import { ReviewPageModule, ReviewCurrentPageModule, QuestionPageModule, DirectionPageModule } from "./pages"
     import { useEffect } from "react"

     function applyInitialTheme() { /* read localStorage, apply .dark class — same logic that was in main.tsx */ }

     export function App() {
       useEffect(() => { /* subscribe to matchMedia change; reapply theme */ }, [])
       const route = parseRoute()
       return (
         <>
           <SkipLink />
           {route ? <RoutedApp route={route} /> : <NotFoundShell />}
           <LiveRegionShell />
         </>
       )
     }
     function RoutedApp({ route }: { route: NonNullable<ReturnType<typeof parseRoute>> }) {
       switch (route.pageType) {
         case "review": return <ShellLayout title="Review"><ReviewPageModule sessionId={route.sessionId} /></ShellLayout>
         case "review-current": return <ShellLayout title="Review"><ReviewCurrentPageModule /></ShellLayout>
         case "question": return <ShellLayout title="Question"><QuestionPageModule sessionId={route.sessionId} /></ShellLayout>
         case "direction": return <ShellLayout title="Design Direction"><DirectionPageModule sessionId={route.sessionId} /></ShellLayout>
       }
     }
     function ShellLayout({ title, children }: { title: string; children: ReactNode }) {
       return (<><Header title={title} /><Main>{children}</Main><FooterBar>{/* ... */}</FooterBar></>)
     }
     function NotFoundShell() { return (<><Header title="Not found" /><Main ariaLabel="Not found">{/* centered 404 block */}</Main><FooterBar /></>) }
     ```
   - Document titles (`document.title = ...`) move INTO the per-page modules (A7–A10), where they have real session data. App.tsx does NOT set titles.
   - Verified < 100 LOC after rewrite (budget ~85 LOC).
   - Contains zero page-specific JSX (no `<ReviewPage>`, no `<QuestionPage>`, no inline header classes — only landmark composition + dispatch).

B2. **`packages/haiku-ui/src/main.tsx`** (MODIFY)
   - Remove the `applyTheme()` function and its `matchMedia('change')` listener block (lines 21–37 of the current file). Keep Sentry init, `ApiClientProvider`, `createRoot(root).render`.
   - Target size after edit: ~25 LOC.

B3. **`packages/haiku-ui/src/components/ThemeToggle.tsx`** (MODIFY)
   - Collapse the three-state `system/dark/light` cycle to a **binary** `dark` ↔ `light`. System preference is consulted only on initial load (via `main.tsx`'s inline script + App.tsx's mount effect); user-initiated toggle is strict binary.
   - Icon-only rendering: `<button type="button" aria-label="Toggle theme" className={touchTargetClass + " flex items-center justify-center w-11 h-11 rounded-lg border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors " + focusRingClass} onClick={toggle} title="Toggle theme"><span aria-hidden="true">{isDark ? SUN_GLYPH : MOON_GLYPH}</span></button>`.
   - `touchTargetClass` and `focusRingClass` imported from `../a11y`. Width and height both 44px (`w-11 h-11`).
   - Use `U+263E` (☾ moon) for dark mode active, `U+2600` (☀ sun) for light mode active.
   - `aria-label="Toggle theme"` is the literal string the spec demands — byte-for-byte.
   - < 40 LOC.

B4. **`packages/haiku-ui/src/components/ThemeToggle.test.tsx`** (NEW — adjacent to component per vitest include pattern)
   - Assert `aria-label="Toggle theme"` on the button.
   - Assert `touchTargetClass` is applied (query for `.touch-target`).
   - Assert clicking the button toggles `document.documentElement.classList.contains('dark')` between `true` and `false`.
   - Assert localStorage key `haiku-review-theme` persists `"dark"` or `"light"` after toggle.
   - < 80 LOC.

B5. **`packages/haiku-ui/index.html`** (MODIFY)
   - Inject a ~10-LOC inline `<script>` BEFORE `<div id="root">` that reads `localStorage.getItem('haiku-review-theme')` (same key as ThemeToggle / main.tsx) and toggles the `dark` class on `<html>` synchronously. Prevents FOUC when the user has a stored dark preference.

B6. **`packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap`** (MODIFY — refresh)
   - Delete the existing snapshot file OR re-run vitest with `-u` on this file only. The refresh is intentional and is part of this unit's commit. Commit message MUST enumerate the attributes that were added: `role="banner"` on header, `role="main" aria-label="Review content" tabIndex="-1"` on main, `role="contentinfo"` on footer, the skip-link anchor `a[href="#main-content"]`, the two live-region divs with `id="feedback-live-polite"` / `id="feedback-live-assertive"`.
   - Before/after diff must show NO removal of `<header`, `id="main-content"`, or "Powered by" (the existing structural assertions in `assertStructuralMarkers`).

B7. **`packages/haiku-ui/tests/parity.spec.tsx`** (MODIFY — additive assertions, structure untouched)
   - Add these assertions to `assertStructuralMarkers`:
     - `expect(rendered).toContain('role="banner"')`
     - `expect(rendered).toContain('role="main"')`
     - `expect(rendered).toContain('role="contentinfo"')`
     - `expect(rendered).toContain('href="#main-content"')`
     - `expect(rendered).toContain('id="feedback-live-polite"')`
     - `expect(rendered).toContain('id="feedback-live-assertive"')`
   - Do NOT touch the existing three assertions (`<header`, `id="main-content"`, "Powered by").

### C. Lighthouse CI harness

C1. **`packages/haiku-ui/scripts/audit-lighthouse.mjs`** (NEW)
   - ESM Node script. Steps (pseudocode):
     1. `cd packages/haiku-ui && npm run build` (or spawn child process). Abort on non-zero exit.
     2. Boot a Node `http.createServer` on an ephemeral port (`port: 0`, read the assigned port from `server.address()`). Serve `dist/index.html` for any non-API path; serve `test-fixtures/*.json` for `/api/sessions/:id` and a synthesized payload for `/api/review/current`. Handle `ws://` upgrade with a no-op (WebSocket is optional — the fixtures don't need live updates).
     3. Map `demo` session IDs: `/api/sessions/demo` → `test-fixtures/review-session.json`, `/api/sessions/demo-question` → `question-session.json`, etc. The `lighthouserc.json` URL list uses these `demo` IDs.
     4. Launch `@lhci/cli autorun --config=lighthouserc.json`.
     5. Teardown the server (unref + close).
     6. Exit with the `lhci` exit code.
   - ~120 LOC inline; no deps beyond Node's stdlib + `@lhci/cli`.

C2. **`packages/haiku-ui/lighthouserc.json`** (NEW)
   ```json
   {
     "ci": {
       "collect": {
         "url": [
           "http://localhost:0/review/demo",
           "http://localhost:0/review/current",
           "http://localhost:0/question/demo",
           "http://localhost:0/direction/demo"
         ],
         "settings": {
           "onlyCategories": ["accessibility"],
           "preset": "desktop",
           "throttling": {"cpuSlowdownMultiplier": 1}
         }
       },
       "assert": {
         "assertions": {
           "categories:accessibility": ["error", {"minScore": 0.95}]
         }
       },
       "upload": { "target": "filesystem" }
     }
   }
   ```
   - `audit-lighthouse.mjs` rewrites the port placeholder (`:0`) to the actual port at runtime before invoking LHCI.

C3. **`packages/haiku-ui/package.json`** (MODIFY)
   - Add to `devDependencies`:
     - `"lighthouse": "12.3.0"` — pinned exact version.
     - `"@lhci/cli": "0.14.0"` — pinned exact version.
     - `"@testing-library/user-event": "14.5.2"` — pinned exact.
   - Add to `scripts`:
     - `"audit:lighthouse": "node scripts/audit-lighthouse.mjs"`

## Verification Commands

Run from `packages/haiku-ui/` unless noted. Each must exit 0:

1. `npx tsc --noEmit` — typecheck passes. **Must have zero errors.** This is both a unit completion criterion AND a `quality_gates: [typecheck]` entry in the unit frontmatter. Hard gate.

2. `npx vitest run` — full test suite passes. Covers:
   - `tests/parity.spec.tsx` (refreshed snapshot + additive structural assertions).
   - `tests/skip-link.spec.tsx` (new — Tab-on-load).
   - `src/routing/__tests__/parseRoute.test.ts` (new — route parser table tests).
   - `src/components/ThemeToggle.test.tsx` (new — aria-label, touch-target, toggle behavior, localStorage).
   - Existing unit-05 a11y tests (untouched).
   This is the `quality_gates: [test]` entry. Hard gate.

3. `wc -l src/App.tsx` — target **< 100**. Budget: ~85. Completion criterion.

4. `grep -E "ReviewPage|QuestionPage|DesignPicker|ReviewCurrentPage" src/App.tsx | wc -l` — target **0**. App.tsx contains no page-specific JSX. Completion criterion.

5. `grep -E 'aria-label="Toggle theme"' src/components/ThemeToggle.tsx` — target **≥ 1** match. Completion criterion (icon-only missing-label regression guard).

6. `grep -E 'href="#main-content"' src/components/SkipLink.tsx tests/__snapshots__/parity.spec.tsx.snap` — target **≥ 4** matches (the component file + at least three snapshots). Skip-link regression guard.

7. `grep -E 'role="banner"|role="main"|role="contentinfo"' tests/__snapshots__/parity.spec.tsx.snap | wc -l` — target **≥ 9** matches (3 roles × 3 snapshots). Confirms landmark primitives reached the rendered output.

8. `node scripts/audit-lighthouse.mjs` — exits 0 with a11y ≥ 0.95 on each of the four pinned URLs. Completion criterion. (Skip in bolt-1 CI if sandbox blocks Chromium launch; document as a `SKIP_LIGHTHOUSE=1` env var opt-out. Reviewer runs manually on local hardware.)

9. `node scripts/verify-tokens.mjs && node scripts/audit-contrast.mjs && node scripts/audit-banned-patterns.mjs` — the unit-04 audit scripts continue to pass. No token drift (unit-06 introduces no new classes that violate §1.1a banned pairs or typography floors).

10. `git status` — clean; all expected new files staged. No files outside `packages/haiku-ui/**` and the repo lockfile modified.

## Commit Plan

Serial commits inside the unit worktree — each is self-verifying:

1. `unit-06: add routing/parseRoute.ts + tests` — A1 + A2.
2. `unit-06: add SkipLink + Header + ThemeToggle icon-only refactor` — A3 + A4 + B3 + B4 + B5.
3. `unit-06: add pages/ module per-page directories` — A6 + A7 + A8 + A9 + A10.
4. `unit-06: rewrite App.tsx as landmark shell + move theme init from main.tsx` — B1 + B2.
5. `unit-06: refresh parity snapshot with landmark roles + live regions` — B6 + B7.
6. `unit-06: add Lighthouse CI harness (audit-lighthouse.mjs + lighthouserc.json)` — C1 + C2 + C3.
7. `unit-06: add skip-link Tab-focus RTL test` — A5.

Final frontmatter update: `outputs` field auto-detected on `haiku_unit_advance_hat`; manually set if auto-detection misses a path (e.g., the snapshot refresh).

## Out of scope (explicit)

- Per-page redesign beyond what fits in the re-export stub modules (unit spec §Out of scope).
- AnnotationCanvas changes — unit-13.
- Feedback panel wiring — unit-08 / 09 / 10.
- Keyboard-shortcut help modal — downstream; we expose a slot only.
- Active-intent breadcrumb rendering — downstream; we expose a slot only.
- Runtime code-splitting (lazy chunk per page) — incompatible with existing single-HTML bundle config; deferred.
- Three-state (system/dark/light) theme toggle — binary per unit spec.
- Second `Skip to feedback list` anchor — only required by feedback layouts (not in unit-06 shell scope).
- Parsing `keyboard-shortcut-map.html` for bindings — unit-05 already shipped `KEYBOARD_SHORTCUT_REGISTRY`.
- `/haiku:feedback-assessor` flow — stage-level concern, not the shell.

## Handoff to builder

Builder starts by rebuilding App.tsx to the < 100-line shape using the landmark primitives, then fills in the page modules, then wires the skip-link, then the Header + ThemeToggle icon-only rewrite, then the snapshot refresh, and finally the Lighthouse harness. Each commit exits its verification step cleanly before moving to the next. If any hard gate fails (typecheck, test, App.tsx line count, aria-label grep), stop and report — do not advance hat.
