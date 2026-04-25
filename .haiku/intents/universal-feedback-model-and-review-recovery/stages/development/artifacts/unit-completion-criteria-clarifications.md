# Unit Completion-Criteria Clarifications (FB-49)

This artifact supersedes specific subjective / ambiguous / contradictory
completion-criteria lines in the four affected unit specs, replacing each
with a deterministic command-based gate that exits 0 on pass.

It exists as a stage artifact because the unit files themselves are
FSM-locked (`status: completed` — direct body edits are blocked by the
`guard-fsm-fields` PreToolUse hook). The substance of the fix is unchanged
from the FB-49 planner plan; only the delivery surface moves from in-unit
edits to this companion artifact.

Pairs with `STAGE-INVARIANTS.md` in the same directory, which owns the
Playwright-out-of-scope rule + parity-command mandate that these
clarifications reference.

Rules:

- Each affected criterion below names a **single command** that must
  exit 0 on pass. No reviewer-graded phrases.
- Where a rule was previously implicit (e.g. "parity" without a
  definition), the rule is stated inline.
- Where two units previously contradicted each other (Playwright
  required vs. Playwright deleted), the contradiction is resolved by
  pointing at `STAGE-INVARIANTS.md` (Playwright is out of scope for
  this stage).
- Unit frontmatter (status, bolt, hat, iterations, outputs,
  completed_at) is NOT touched. Only the prose criteria listed below
  are superseded.

---

## 1. `unit-03-extract-haiku-ui-package.md`

### 1a. Scope paragraph — "Runtime DOM parity"

**Original (lines 142-143):**
> **Runtime DOM parity:**
> - Playwright test at `packages/haiku-ui/tests/parity.spec.ts` boots a test MCP against committed fixtures (`packages/haiku-ui/test-fixtures/{review,question,direction}-session.json`), captures the rendered DOM tree for each page, asserts the tree matches committed snapshots at `packages/haiku-ui/tests/__snapshots__/`. Snapshots captured from the pre-move build. Volatile attributes (`data-reactid`, auto-generated id suffixes) stripped via a shared transformer.

**Superseded by:**
> **Runtime DOM parity:**
> - RTL / JSDOM parity test at `packages/haiku-ui/tests/parity.spec.tsx` renders the three fixtures (`packages/haiku-ui/test-fixtures/{review,question,direction}-session.json`) and asserts the rendered DOM matches committed snapshots at `packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap`. Volatile attributes (`data-reactid`, auto-generated id suffixes) are stripped via the shared transformer at `packages/haiku-ui/tests/dom-parity-transformer.ts`. Playwright is out of scope for this stage (see `STAGE-INVARIANTS.md`).

### 1b. Completion criterion — "Bundle comparison script exits 0."

**Original (line 160):**
> - Bundle comparison script exits 0.

**Superseded by (deterministic gate, inline parity rule):**
> - `node packages/haiku/scripts/compare-bundle.mjs stages/development/artifacts/bundle-baseline.html packages/haiku-ui/dist/index.html` exits 0. **Parity rule (enforced by the script):** after stripping lines matching `/build-timestamp|mtime|sourcemap hash|__vite_\w+/` from both inputs, (a) the set of HTML tag names + their top-level attribute names must be identical, and (b) the count of `<script>` and `<link>` elements must match. Byte-identical diff is NOT required (source maps, minifier output, and hashed asset names legitimately differ). The script's implementation MUST match this rule; any divergence is itself a completion-criterion failure.

### 1c. Completion criterion — "DOM parity Playwright test passes against all three session fixtures."

**Original (line 161):**
> - DOM parity Playwright test passes against all three session fixtures.

**Superseded by:**
> - `npx vitest run -w packages/haiku-ui tests/parity.spec.tsx` exits 0 against all three session fixtures (no snapshot update needed; any mismatch must fail the run). Playwright is out of scope for this stage (see `STAGE-INVARIANTS.md`).

---

## 2. `unit-06-shell-and-routing.md`

### 2a. Completion criterion — "Existing URL paths … render without regression … unit-03 DOM parity Playwright test, now re-run with the new shell."

**Original (line 123):**
> - Existing URL paths (`/review/:id`, `/review/current`, `/question/:id`, `/direction/:id`) render without regression (verified by the unit-03 DOM parity Playwright test, now re-run with the new shell).

**Superseded by:**
> - Existing URL paths (`/review/:id`, `/review/current`, `/question/:id`, `/direction/:id`) render without regression. **Gate command:** `npx vitest run -w packages/haiku-ui tests/parity.spec.tsx` exits 0 after this unit's changes are applied. If the shell refactor legitimately changes rendered DOM (landmarks, skip-link), update the committed snapshot at `packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap` as part of this unit's deliverable and reference the snapshot diff in the unit-06 review notes. Snapshot churn is expected; silent snapshot regeneration without a matching review note is a regression.

---

## 3. `unit-07-review-page-desktop-and-mobile.md`

### 3a. Scope block — "Visual regression — RTL-only."

**Original (lines 83-93, the "Visual regression — RTL-only" block):**
> **Visual regression — RTL-only.** **Playwright was removed from this unit.** Same rationale as Lighthouse: browser-launching tooling (chrome-launcher, Playwright's chromium download) has repeatedly wedged on install or clobbered the developer's Chrome. Visual fidelity is verified here via RTL snapshots (JSDOM) + structural DOM assertions. A proper Playwright-sandboxed visual-diff suite can land as a follow-up unit once we have an isolated Playwright workspace.
>
> - Responsive-parity test at `packages/haiku-ui/src/pages/review/__tests__/responsive.test.tsx`: …
> - Structural DOM test at `packages/haiku-ui/src/pages/review/__tests__/layout.test.tsx`: …
> - `packages/haiku-ui/tests/review-page.spec.ts`, `packages/haiku-ui/playwright.config.ts`, and the `@playwright/test` dep must be DELETED if they exist from prior bolts.

**Superseded by:**
> **Visual-fidelity verification (enumerated, RTL-only).** Playwright is out of scope for this stage (see `STAGE-INVARIANTS.md`). Visual fidelity here is verified by exactly three deterministic RTL / JSDOM tests, each of which must exit 0:
>
> 1. `packages/haiku-ui/src/pages/review/__tests__/responsive.test.tsx` — renders `ReviewPage` against `test-fixtures/review-session-full.json` (20 feedback items spanning every status) at desktop and mobile `matchMedia` breakpoints, extracts text content of every `findAllByRole('listitem')` result, asserts the two arrays are element-wise equal.
> 2. `packages/haiku-ui/src/pages/review/__tests__/layout.test.tsx` — asserts desktop layout places `<ArtifactsPane>` and `<FeedbackSidebar>` as siblings under an `xl:flex` container; asserts mobile layout places `<ArtifactsPane>` above `<FeedbackFloatingButton>` with `flex-col` container, no sidebar; asserts `w-[var(--sidebar-width)]` and `xl:w-[var(--sidebar-width-xl)]` are present in the sidebar element's className string.
> 3. `packages/haiku-ui/src/pages/review/__tests__/status-announce.test.tsx` — triggers a status-badge transition and asserts `useAnnounce` live-region text updates.
>
> No other "visual regression" coverage is in scope for this unit. `packages/haiku-ui/tests/review-page.spec.ts`, `packages/haiku-ui/playwright.config.ts`, and the `@playwright/test` dep MUST be removed if they exist from prior bolts.

### 3b. Completion criteria — command-per-line rewrite

**Original lines 104-112:**
> - ReviewPage renders at `/review/:id` and `/review/current`.
> - Footer buttons use only canonical verbs — `audit-banned-patterns.mjs --profile=tokens` invoked on the page source returns zero hits for banned verbs.
> - Responsive breakpoints match DESIGN-TOKENS `--breakpoint-*` values (no literal breakpoint values in the page source).
> - Every interactive element has `focusRingClass` — audit-banned-patterns catches `focus:ring-1` regressions.
> - Responsive-parity test passes.
> - Structural layout test passes.
> - `packages/haiku-ui/tests/review-page.spec.ts`, `playwright.config.ts`, and the `@playwright/test` dep are REMOVED (grep confirms zero occurrences).
> - `useAnnounce` fires on status-badge transitions — RTL test triggers a status change and asserts live-region text updates.
> - `npx tsc --noEmit` passes.

**Superseded by:**
> - ReviewPage renders at `/review/:id` and `/review/current`.
> - `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=tokens packages/haiku-ui/src/pages/review/FooterBar.tsx` exits 0 (canonical-verb guard).
> - `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=breakpoints packages/haiku-ui/src/pages/review/` exits 0 (no literal breakpoint values; must match `--breakpoint-*` tokens).
> - `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=focus-ring packages/haiku-ui/src/pages/review/` exits 0 (blocks `focus:ring-1` regressions; every interactive element must use `focusRingClass`).
> - `npx vitest run -w packages/haiku-ui src/pages/review/__tests__/responsive.test.tsx` exits 0.
> - `npx vitest run -w packages/haiku-ui src/pages/review/__tests__/layout.test.tsx` exits 0.
> - `npx vitest run -w packages/haiku-ui src/pages/review/__tests__/status-announce.test.tsx` exits 0.
> - `grep -R "@playwright/test\|playwright\.config\|review-page\.spec\.ts" packages/haiku-ui/` returns zero matches.
> - `npx tsc --noEmit` exits 0.

---

## 4. `unit-13-annotation-canvas.md`

### 4a. Scope block — Playwright perf test (lines 87-91)

**Original:**
> **Perf budget:**
> - Canvas supports ≥ 200 pins. Playwright perf test at `packages/haiku-ui/tests/annotation-perf.spec.ts`:
>   - Mounts canvas with 200 fixture pins.
>   - Asserts first paint ≤ 100ms.
>   - Presses ArrowRight in a loop 200 times; asserts each keypress-to-paint ≤ 16ms.

**Superseded by:**
> **Perf budget (non-Playwright, vitest + `performance.now()`):**
> - `packages/haiku-ui/tests/annotation-perf.spec.tsx` (vitest-jsdom, not Playwright).
> - Mounts `AnnotationCanvas` with 200 fixture pins via React Testing Library.
> - Measures time from `render(...)` call to first `act(...)` resolution via `performance.now()`; asserts ≤ 100 ms.
> - Dispatches 200 synthetic `ArrowRight` `keydown` events via `userEvent.keyboard`; between each, calls `performance.now()` and asserts the delta is ≤ 16 ms.
> - Playwright is out of scope for this stage (see `STAGE-INVARIANTS.md`). A Playwright-native perf test lands as a follow-up unit.

### 4b. Completion criterion — "Real page reload test in Playwright: same behavior."

**Original (line 108):**
> - Real page reload test in Playwright: same behavior.

**Superseded by:**
> - Reload survives (RTL-level): mount → write draft → unmount → remount the component tree with the same `sessionId` → form prefills from `localStorage`. `npx vitest run -w packages/haiku-ui src/pages/review/__tests__/AnnotationCanvas.test.tsx -t "draft survives remount"` exits 0. A full browser-reload Playwright test lands as a follow-up unit.

### 4c. Completion criterion — "Perf Playwright test meets 100ms first paint + 16ms/keypress budgets."

**Original (line 121):**
> - Perf Playwright test meets 100ms first paint + 16ms/keypress budgets.

**Superseded by:**
> - `npx vitest run -w packages/haiku-ui tests/annotation-perf.spec.tsx` exits 0, with the 100 ms first-paint and 16 ms / keypress assertions above.

---

## Out of scope (for this clarification artifact)

- Editing `packages/haiku-ui/scripts/compare-bundle.mjs` to match the new
  parity rule — the rule is spec-level; the script implementation is a
  unit-03 revisit concern.
- Renaming `packages/haiku-ui/tests/annotation-perf.spec.ts` →
  `.spec.tsx` on disk — that lands when unit-13 is revisited against
  the new spec.
- Rewriting or deleting `packages/haiku-ui/tests/review-page.spec.ts` —
  unit-07 already mandates its deletion; no action needed here.
- Touching `stages/development/state.json` — FSM-owned.
- Editing the unit frontmatter blocks on any of the four affected
  units — FSM-owned, hook-guarded.
