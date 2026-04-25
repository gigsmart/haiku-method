# Fix FB-49 — Tactical Plan (planner, bolt 1)

**Finding:** Subjective gates in unit completion criteria violate "testable, no subjective judgment" mandate.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/49-subjective-gates-in-unit-completion-criteria-violate-testabl.md`

## TL;DR

Four current-visit unit specs carry completion criteria whose pass/fail outcome is either reviewer-graded ("parity"), references a test that no longer exists (unit-06 → unit-03's deleted Playwright test), has an unenumerated coverage boundary ("Visual regression — RTL-only"), or is internally contradictory across units (unit-07 deletes Playwright in the same stage where unit-13 still requires a Playwright perf test).

The planner-scope fix is a documentation edit — swap each subjective/contradictory criterion for a **deterministic command that exits 0 on pass**. The builder in the next bolt will edit the four unit spec files and add a new stage-level invariants file to resolve the cross-unit Playwright conflict.

## Root cause

The current-visit units were written at different times by different planners; the stage never ratified a single rule for "what runtime verification tools are in scope" or "what DOM parity means". As a result:

1. **unit-03 `Completion Criteria:160` — "Bundle comparison script exits 0."** The script's job (what counts as parity) is defined inside `compare-bundle.mjs`, not in the spec. Reviewers logged FB-04/05/06 when the builder's implementation of that rule was judged too loose; the criterion is executable but the definition of "parity" is reviewer-graded, so bolt-1 review was rejected subjectively. Either the rule needs to be written into the spec explicitly, or the criterion needs to be stated in DOM-structural terms that don't depend on byte-diff behavior.

2. **unit-06 `Completion Criteria:123` — references "unit-03 DOM parity Playwright test".** Unit-03's parity test was rewritten to an RTL/JSDOM snapshot test (`packages/haiku-ui/tests/parity.spec.tsx` + `__snapshots__/parity.spec.tsx.snap`), no longer Playwright. Unit-06 references a test that no longer exists as specified. The criterion is currently un-meetable on the literal reading.

3. **unit-07 `Scope:83` + `Completion Criteria:104-112` — "Visual regression — RTL-only" is a broad assertion.** The enumerated tests (`responsive.test.tsx`, `layout.test.tsx`, `status-announce.test.tsx`) are deterministic. But the overarching "visual regression" umbrella has no enumerated coverage boundary — it is implicitly defined by what the fixture happens to render, not by a written list of required UI invariants. Either strike the umbrella phrase (the enumerated tests are the coverage) or convert it to an explicit list.

4. **unit-13 `Scope:88-91` + `Completion Criteria:120` — Playwright perf test.** Unit-07 (same stage) explicitly deletes Playwright and the `@playwright/test` dep. Unit-13 then requires `packages/haiku-ui/tests/annotation-perf.spec.ts` to run under Playwright. The two units cannot both pass on the same repo state — whichever runs last undoes the other. In practice the perf test is not being executed (no Playwright binary installed), so the perf budget gate is theoretical rather than enforced.

There is also no **stage-level invariant** declaring whether Playwright is allowed in this stage. Each unit makes its own call and they disagree.

## Fix approach (planner-scope — documentation edits only)

The builder (bolt 2) will make two categories of change:

### Category A: Rewrite each ambiguous criterion into a deterministic executable gate

For each of the four cases, the new criterion must state **a single command that exits 0 on pass**, and (where the rule isn't self-evident) an inline definition of what the rule asserts. No reliance on reviewer judgment about what "parity" or "regression" means.

### Category B: Add a stage-level invariants file

A new file `stages/development/artifacts/STAGE-INVARIANTS.md` that declares the **Playwright rule for this stage**: Playwright is out of scope for every unit in this visit. Any unit whose spec currently names a `.spec.ts`/`.spec.tsx` file intended to run under Playwright must either move the test to RTL/JSDOM or mark the test as out of scope with an explicit follow-up unit reference. This is the explicit rule the feedback requests ("Cross-reference and reconcile the Playwright-removed (unit-07) vs Playwright-required (unit-13) conflict with an explicit rule at stage level.").

## Files to modify

### 1. `unit-03-extract-haiku-ui-package.md`

Replace line 160 completion criterion and tighten the `Byte-identical bundle verification` scope paragraph (lines 138-140).

**Current criterion (line 160):**
> - Bundle comparison script exits 0.

**Replacement (deterministic gate):**
> - `node packages/haiku/scripts/compare-bundle.mjs stages/development/artifacts/bundle-baseline.html packages/haiku-ui/dist/index.html` exits 0. **Parity rule (enforced by the script):** after stripping lines matching `/build-timestamp|mtime|sourcemap hash|__vite_\w+/` from both inputs, (a) the set of HTML tag names + their top-level attribute names must be identical, and (b) the count of `<script>` and `<link>` elements must match. Byte-identical diff is NOT required (source maps, minifier output, and hashed asset names legitimately differ). The script's implementation MUST match this rule; any divergence is itself a completion-criterion failure.

**Current scope line 143 (DOM parity test):**
> - Playwright test at `packages/haiku-ui/tests/parity.spec.ts` boots a test MCP against committed fixtures …

**Replacement:**
> - RTL/JSDOM parity test at `packages/haiku-ui/tests/parity.spec.tsx` renders the three fixtures (`packages/haiku-ui/test-fixtures/{review,question,direction}-session.json`) and asserts the rendered DOM matches committed snapshots at `packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap`. Volatile attributes (`data-reactid`, auto-generated id suffixes) are stripped via the shared transformer at `packages/haiku-ui/tests/dom-parity-transformer.ts`. Playwright is out of scope for this stage (see `stages/development/artifacts/STAGE-INVARIANTS.md`).

**Current criterion (line 161):**
> - DOM parity Playwright test passes against all three session fixtures.

**Replacement:**
> - `npx vitest run -w packages/haiku-ui tests/parity.spec.tsx` exits 0 against all three session fixtures (no snapshot update needed; any mismatch must fail the run).

### 2. `unit-06-shell-and-routing.md`

Replace line 123 completion criterion with a reference to unit-03's actual (RTL) parity test.

**Current criterion:**
> - Existing URL paths (`/review/:id`, `/review/current`, `/question/:id`, `/direction/:id`) render without regression (verified by the unit-03 DOM parity Playwright test, now re-run with the new shell).

**Replacement:**
> - Existing URL paths (`/review/:id`, `/review/current`, `/question/:id`, `/direction/:id`) render without regression. **Gate command:** `npx vitest run -w packages/haiku-ui tests/parity.spec.tsx` exits 0 after this unit's changes are applied. If the shell refactor legitimately changes rendered DOM (landmarks, skip-link), update the committed snapshot at `packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap` as part of this unit's deliverable and reference the snapshot diff in the unit-06 review notes. Snapshot churn is expected; silent snapshot-regeneration without a matching review note is a regression.

### 3. `unit-07-review-page-desktop-and-mobile.md`

Strike the broad "Visual regression — RTL-only" umbrella; keep only the enumerated tests that already exist. Rename the section for clarity.

**Current scope lines 83-93 (the "Visual regression — RTL-only" block):**

Replace the block with:

> **Visual-fidelity verification (enumerated, RTL-only).** Playwright is out of scope for this stage (see `stages/development/artifacts/STAGE-INVARIANTS.md`). Visual fidelity here is verified by exactly three deterministic RTL/JSDOM tests, each of which must exit 0:
>
> 1. `packages/haiku-ui/src/pages/review/__tests__/responsive.test.tsx` — renders `ReviewPage` against `test-fixtures/review-session-full.json` (20 feedback items spanning every status) at desktop and mobile `matchMedia` breakpoints, extracts text content of every `findAllByRole('listitem')` result, asserts the two arrays are element-wise equal.
> 2. `packages/haiku-ui/src/pages/review/__tests__/layout.test.tsx` — asserts desktop layout places `<ArtifactsPane>` and `<FeedbackSidebar>` as siblings under an `xl:flex` container; asserts mobile layout places `<ArtifactsPane>` above `<FeedbackFloatingButton>` with `flex-col` container, no sidebar; asserts `w-[var(--sidebar-width)]` and `xl:w-[var(--sidebar-width-xl)]` are present in the sidebar element's className string.
> 3. `packages/haiku-ui/src/pages/review/__tests__/status-announce.test.tsx` — triggers a status-badge transition and asserts `useAnnounce` live-region text updates.
>
> No other "visual regression" coverage is in scope for this unit. `packages/haiku-ui/tests/review-page.spec.ts`, `packages/haiku-ui/playwright.config.ts`, and the `@playwright/test` dep MUST be removed if they exist from prior bolts.

**Current completion criteria 104-112:**

Rewrite the list so each line names a single command that exits 0. Specifically:

- "Responsive-parity test passes." → `npx vitest run -w packages/haiku-ui src/pages/review/__tests__/responsive.test.tsx` exits 0.
- "Structural layout test passes." → `npx vitest run -w packages/haiku-ui src/pages/review/__tests__/layout.test.tsx` exits 0.
- "`useAnnounce` fires on status-badge transitions — RTL test triggers a status change and asserts live-region text updates." → `npx vitest run -w packages/haiku-ui src/pages/review/__tests__/status-announce.test.tsx` exits 0.
- Keep the three existing concrete criteria (banned-patterns audit, breakpoint literals check, focusRingClass coverage) but rewrite each as the literal command + expected exit code. Example: `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=tokens packages/haiku-ui/src/pages/review/FooterBar.tsx` exits 0.
- Keep the Playwright-removal criterion (line 110) verbatim — it is already deterministic.

### 4. `unit-13-annotation-canvas.md`

Replace the Playwright perf test + the two "Playwright" references in completion criteria with a non-Playwright measurement. The perf budget itself stays (100 ms first paint, 16 ms/keypress), but the measurement tool changes to `performance.now()` inside a vitest-jsdom environment.

**Current scope lines 88-91 (Playwright perf test):**

Replace with:

> **Perf budget (non-Playwright, vitest + `performance.now()`):**
> - `packages/haiku-ui/tests/annotation-perf.spec.tsx` (rename from `.spec.ts`, vitest-jsdom, not Playwright).
> - Mounts `AnnotationCanvas` with 200 fixture pins via React Testing Library.
> - Measures time from `render(...)` call to first `act(...)` resolution via `performance.now()`; asserts ≤ 100 ms.
> - Dispatches 200 synthetic `ArrowRight` `keydown` events via `userEvent.keyboard`; between each, calls `performance.now()` and asserts the delta is ≤ 16 ms.
> - Playwright is out of scope for this stage (see `stages/development/artifacts/STAGE-INVARIANTS.md`). A Playwright-native perf test lands as a follow-up unit.

**Current completion criteria line 108 (Real page reload test in Playwright):**

Replace with:

> - Reload survives (RTL-level): mount → write draft → unmount → remount the component tree with the same `sessionId` → form prefills from `localStorage`. `npx vitest run -w packages/haiku-ui src/pages/review/__tests__/AnnotationCanvas.test.tsx -t "draft survives remount"` exits 0. A full browser-reload Playwright test lands as a follow-up unit.

**Current completion criteria line 121 (Perf Playwright test meets budgets):**

Replace with:

> - `npx vitest run -w packages/haiku-ui tests/annotation-perf.spec.tsx` exits 0, with the 100 ms first-paint and 16 ms/keypress assertions above.

### 5. NEW: `stages/development/artifacts/STAGE-INVARIANTS.md`

Create this file. Declares stage-wide rules that bind every unit:

```markdown
# Development-Stage Invariants

This file declares rules that bind every unit in the development stage.
Units MUST NOT contradict these invariants. If a unit spec and an invariant
disagree, the invariant wins and the unit spec must be corrected.

## Runtime-verification tools

**Playwright is out of scope for this stage.** Reason: the browser-launching
tooling (`chrome-launcher`, Playwright's chromium auto-download) has repeatedly
wedged on install or clobbered developers' local Chrome profiles on this
codebase. A proper Playwright-sandboxed suite will land as a follow-up unit
once an isolated Playwright workspace exists.

Consequences:
- No unit spec may require `.spec.ts`/`.spec.tsx` files executed via
  `@playwright/test`.
- Any unit currently referencing a "Playwright test" MUST convert the test
  to RTL/JSDOM (vitest) or declare the test out of scope with an explicit
  follow-up-unit reference.
- The `@playwright/test` dep, `playwright.config.ts`, and any Playwright
  spec files introduced by prior bolts MUST be absent from the final
  stage state. Grep check (must return zero outside this invariants file):
  `grep -R "@playwright/test\|playwright\.config" packages/`.

**Headless Lighthouse (chrome-launcher) is out of scope for this stage**
for the same reason. A11y verification happens via `axe-core` inside RTL
tests (see unit-06's axe-core gate).

## Parity / visual-regression coverage

Every "parity" or "visual-regression" criterion MUST state:

1. A single command that exits 0 on pass.
2. The enumerated assertion the command makes (either inline, or by
   pointing at a specific test file + test name).

"Parity" is never a reviewer judgment. If the rule can't be reduced to a
deterministic check, the criterion itself is broken and must be rewritten.

## Perf budgets

Perf numeric budgets (e.g. 16 ms/keypress, 100 ms first paint) must be
measured via `performance.now()` inside a vitest-jsdom test, not via
Playwright, for the duration of this stage.

## DOM parity snapshots

DOM-parity tests that rely on committed snapshots (e.g.
`tests/parity.spec.tsx`, `src/pages/review/__tests__/*.test.tsx`) MUST:

- Use the shared transformer at `packages/haiku-ui/tests/dom-parity-transformer.ts`
  to strip volatile attributes (`data-reactid`, auto-generated id suffixes).
- Regenerate the snapshot intentionally (never silently) when a unit's
  changes legitimately alter rendered DOM. Snapshot diffs MUST be documented
  in that unit's review notes.
```

## Implementation steps (for the builder in bolt 2)

1. **Read each unit spec fresh** immediately before editing. Parallel-fix chains may have already edited the same line ranges (FB-05, FB-06, FB-07 all touch unit-03/unit-07/unit-13). Do not trust the line numbers in the feedback body verbatim — re-locate each target block by its surrounding text.
2. **Edit `units/unit-03-extract-haiku-ui-package.md`** per §1 above. Three edits: (a) scope line 143 Playwright → RTL, (b) completion-criterion line 160 bundle-comparison rule, (c) completion-criterion line 161 Playwright → vitest.
3. **Edit `units/unit-06-shell-and-routing.md`** per §2 above. One edit at line 123.
4. **Edit `units/unit-07-review-page-desktop-and-mobile.md`** per §3 above. Rewrite the "Visual regression — RTL-only" block (lines 83-93); rewrite completion criteria 104-112 as command-based exit-code gates.
5. **Edit `units/unit-13-annotation-canvas.md`** per §4 above. Rewrite the Playwright perf test block (lines 88-91); rewrite completion criteria lines 108 and 121.
6. **Create `stages/development/artifacts/STAGE-INVARIANTS.md`** per §5 above. Verbatim content as shown.
7. **Grep verify** that no remaining unit spec contains the word "Playwright" as a *required* test (mentions in "out of scope" / "follow-up unit" phrasing are fine):
   ```bash
   grep -n "Playwright" .haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/unit-*.md
   ```
   Every hit should be either (a) inside an "out of scope" / "follow-up" phrase, (b) inside a `reason:` field in frontmatter history, or (c) inside the STAGE-INVARIANTS.md cross-reference phrase `(see stages/development/artifacts/STAGE-INVARIANTS.md)`.
8. **Do NOT touch unit frontmatter.** Specifically do not modify `status`, `bolt`, `hat`, `iterations`, `outputs`, or `completed_at`. These are FSM-owned fields and the fix is out of scope for them.
9. **Do NOT edit `packages/haiku-ui/` source code or test files.** The underlying test file renames (`.spec.ts` → `.spec.tsx`) and the `compare-bundle.mjs` rule implementation are out of scope for this fix — they land when the unit-03 / unit-13 specs are revisited. This fix is a documentation alignment, not a test-rewrite.

## Verification commands

```bash
# From the worktree root:

# 1. Unit specs were edited in place.
git diff --stat .haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/
# Expect 4 files changed, no frontmatter line changes.

# 2. Stage invariants file exists.
ls -la .haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/STAGE-INVARIANTS.md

# 3. Every remaining "Playwright" mention in unit specs is inside an
#    "out of scope" / "follow-up" / invariants cross-reference phrase.
grep -n "Playwright" .haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/*.md

# 4. Every new completion criterion states a command. Quick heuristic:
#    count criteria lines that start with `npx ` or `node `.
grep -cE "^\- (npx|node|grep) " .haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/unit-0{3,6,7,}*.md \
                                  .haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/unit-13-*.md

# 5. Commit check: message matches the mandated format.
git log -1 --pretty=%B
# Expect: "haiku: fix FB-49 bolt 1 (planner)"
```

All five checks must pass. The grep in (3) must show zero Playwright references that require execution — only phrases like "out of scope", "follow-up unit", or "see stages/development/artifacts/STAGE-INVARIANTS.md" are allowed.

## Risks

- **Parallel-chain clobber.** Multiple FB-NN chains may be editing the same unit spec files at overlapping times. The builder must `git diff` each target file before editing and again immediately before staging. If another chain has already touched a target block, re-apply this fix's edits on top of the new state rather than reverting.
- **Line-number drift.** The line numbers in the feedback body (160, 123, 84-92, 88-91) may no longer match the current file contents by bolt 2. Edits MUST be anchored on the surrounding text, not on line numbers.
- **Snapshot churn cascade.** Rewriting unit-06's gate from "Playwright parity test" to "vitest parity.spec.tsx" does NOT require regenerating the snapshot now — the snapshot already exists at `packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap`. But it DOES mean future shell changes (unit-06 re-executions) have an obligation to update that snapshot intentionally. The invariants file documents this.
- **Apparent contradiction with unit-06 frontmatter `outputs:` list.** Unit-06's frontmatter outputs list includes `parity.spec.tsx` but does not mention Playwright. No frontmatter edit is needed — only the body text references Playwright.
- **Over-scoping temptation.** The feedback mentions four specific criteria. The fix covers exactly those four plus the stage-invariants file. Do NOT expand to rewrite other unit specs' criteria — those are separate findings (FB-03 for bundle-size, FB-05 for the 500 KB ceiling, etc.). Staying in scope is a completion-criterion for THIS fix.
- **Frontmatter sensitivity.** `units/unit-NN-*.md` files include YAML frontmatter that the FSM parses. Editing inside the frontmatter block (between the two `---` markers) can break FSM state. All edits are confined to the body (below the second `---`).

## Out of scope

- Editing `packages/haiku-ui/scripts/compare-bundle.mjs` to match the new parity rule — the rule is spec-level; the script implementation is a unit-03 revisit concern.
- Renaming `packages/haiku-ui/tests/annotation-perf.spec.ts` → `.spec.tsx` on disk — that's a test-file rewrite that lands when unit-13 is revisited against the new spec.
- Rewriting `packages/haiku-ui/tests/review-page.spec.ts` — unit-07's existing criterion already mandates its deletion; no change needed here.
- Adding a new follow-up unit for the Playwright-sandboxed suite — the invariants file names this as a future unit; actually creating it is an intent-level action.
- Touching `stages/development/state.json`. FSM-owned.
- Updating the stage's gate/outputs list in `state.json` or in any STUDIO/STAGE.md metadata. Intent-scope only.

## Done when

- Four unit spec body texts have been edited to replace ambiguous/contradictory criteria with deterministic command-based gates.
- `stages/development/artifacts/STAGE-INVARIANTS.md` exists and states the Playwright-is-out-of-scope rule at stage level.
- Grep of unit specs shows zero Playwright references that mandate execution (only "out of scope" / "follow-up" / invariants cross-refs remain).
- Every new completion-criterion line is a literal command (starts with `npx`, `node`, `grep`, or similar) plus the expected exit code / match behavior.
- Commit is on branch `haiku/universal-feedback-model-and-review-recovery/development` with message `haiku: fix FB-49 bolt 1 (planner)`. No push.
