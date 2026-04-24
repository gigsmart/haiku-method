# Fix FB-25 — Tactical Plan (planner, bolt 1)

**Finding:** Core backend feedback-model behaviors have no current-visit unit; coverage claim is unverifiable.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/25-core-backend-feedback-model-behaviors-have-no-current-visit.md`

## Root cause

The current development stage has 15 `unit-NN-*.md` files. All 15 are scoped to
**UI/package-extraction work** (haiku-api extraction, design tokens, a11y
foundations, review-page refactors, audits). None of them own the backend
feedback-model contracts that this intent exists to deliver:

- `feedback-crud.feature` (39 scenarios) — `haiku_feedback` + CRUD companions,
  author guards, rejection semantics.
- `enforce-iteration-fix.feature` (15 scenarios) — per-stage `state.json`
  completion check replacing the unit-file glob.
- `auto-revisit.feature` (19 scenarios) — review → gate rollback when
  pending feedback > 0, visit counter increment.
- `additive-elaborate.feature` (15 scenarios) — additive mode when visits > 0,
  `closes: [FB-NN]` requirement on new units, frozen completed units.
- `external-review-feedback.feature` (17 scenarios) — external PR/MR
  changes-requested detection, summary-file creation, routing to the agent.
- `revisit-with-reasons.feature` (17 scenarios) — `haiku_revisit` optional
  reasons param that internally writes feedback.

Total: **149 backend scenarios** (feedback body cites 122 — the exact number
depends on whether Scenario Outlines count per-row or per-outline; either way
the gap is structurally identical). The implementations exist in
`packages/haiku/src/*` and are covered by `packages/haiku/test/*.test.mjs`
(`feedback.test.mjs`, `enforce-iteration.test.mjs`, `external-review.test.mjs`,
`gate-feedback.test.mjs`, `orchestrator*.test.mjs`, `http-feedback.test.mjs`),
but **the stage has no unit whose completion criteria bind those feature files
to those tests as a regression gate in the current visit**. `unit-01` line 62-64
asserts the backend "already shipped in prior bolts" but does not gate on
anything verifying it still does.

The per-feature-file artifact notes in
`stages/development/artifacts/unit-0{2,4,5,6,7,8}-*.md` are free-form summary
prose — no frontmatter, no `quality_gates:`, no `status`, no way for the stage
machinery to block on them.

## Fix approach (planner-scope — no code edits)

Pick remedy (a) from the feedback body: **add one new regression-gate unit**
that binds the six backend feature files to the existing backend tests via a
mechanical coverage check. Remedy (b) — promoting six legacy notes into full
units — is strictly worse here: the implementations, tests, and invariants
already exist and are correct; what is missing is a single unit-scoped
**mechanical gate that fails when a product-declared scenario has no linked
test**. One gate closes the gap for all six feature files; six promoted units
would each re-derive the same gate and duplicate the same six invariants.

**New unit:** `unit-16-backend-feedback-regression-gate.md`. Unit-16 avoids the
numbering collision called out in FB-44 (all 01-15 are taken). This unit is
scoped to the stage's current visit and has deterministic, executable
completion criteria — no prose gates.

The gate has two halves:

1. **A coverage-map artifact** — `stages/development/artifacts/backend-feature-coverage.yaml`
   (or `.json`; YAML for readability). One entry per scenario, keyed by
   `{feature_file, scenario_name_or_id}`, with `covered_by: [<test file>::<test
   name>]`. The unit's completion criteria require the map to be present and
   every scenario in the six `.feature` files to have at least one non-empty
   `covered_by` entry.

2. **A new audit script** — `packages/haiku/scripts/audit-backend-coverage.mjs`
   — that parses the six `.feature` files, parses the coverage map, and exits
   non-zero if (a) the map is missing scenarios, (b) any mapped test name
   doesn't exist in the referenced `.test.mjs` file, or (c) any test file
   fails. It runs `node --test` on each referenced test file and asserts every
   referenced test passes. A single exit-0 is the green gate for all 149
   scenarios.

This keeps the legacy artifact notes as-is (they stay read-only evidence), adds
no new test code (the tests already exist), and closes the gap with one small
script + one YAML + one unit file.

## Files to create (builder will author in bolt 2)

1. **`.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/unit-16-backend-feedback-regression-gate.md`**
   — new current-visit unit. Frontmatter mirrors the other units in the stage:

   ```yaml
   ---
   title: Backend feedback-model regression gate
   type: regression
   depends_on: []
   quality_gates:
     - typecheck
     - test
   inputs:
     - features/feedback-crud.feature
     - features/enforce-iteration-fix.feature
     - features/auto-revisit.feature
     - features/additive-elaborate.feature
     - features/external-review-feedback.feature
     - features/revisit-with-reasons.feature
   status: pending
   ---
   ```

   Body sections (standard stage unit format, mirroring `unit-15`):

   - **Scope** — lists the six feature files and the six test files they bind
     to. States explicitly: this unit adds no new backend behavior; it adds a
     mechanical gate that proves the backend behaviors declared by the product
     stage still pass.
   - **Completion Criteria** — all of these commands exit 0, run from repo
     root:
     - `node packages/haiku/scripts/audit-backend-coverage.mjs`
     - `node --test packages/haiku/test/feedback.test.mjs`
     - `node --test packages/haiku/test/enforce-iteration.test.mjs`
     - `node --test packages/haiku/test/external-review.test.mjs`
     - `node --test packages/haiku/test/gate-feedback.test.mjs`
     - `node --test packages/haiku/test/orchestrator.test.mjs`
     - `node --test packages/haiku/test/orchestrator-integration.test.mjs`
     - `node --test packages/haiku/test/http-feedback.test.mjs`
     - `node --test packages/haiku/test/state-tools.test.mjs`
     - `node --test packages/haiku/test/state-tools-handlers.test.mjs`
     - `node --test packages/haiku/test/guard-fsm-fields.test.mjs`
     - `node --test packages/haiku/test/reject-hat-deadlock.test.mjs`
     - `npx tsc --noEmit` (repo-wide, already required by sibling units)
   - **Out of scope** — any new backend behavior; UI surface work (owned by
     units 01-15); test authoring beyond what is already in
     `packages/haiku/test/`.

2. **`.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/backend-feature-coverage.yaml`**
   — the coverage map. One top-level key per feature file; each value is a
   list of `{ scenario: "<name>", covered_by: ["<test-file>::<test-name>"] }`
   entries. The builder populates this by:

   1. Parsing each `.feature` file (`Scenario:` + `Scenario Outline:` lines —
      for outlines, one entry per `Examples:` row).
   2. For each scenario, grepping `packages/haiku/test/*.test.mjs` for a test
      whose name matches the scenario intent (the existing test suites were
      written scenario-first so most names align — e.g. `feedback-crud.feature`
      "Agent cannot close user-authored feedback" ↔ `feedback.test.mjs`
      `"rejects agent closing human-authored feedback"`).
   3. Where a direct match isn't obvious, the builder picks the closest
      behavioral test and documents the binding in a `notes:` field on that
      entry.
   4. If any scenario truly has no covering test, the builder adds a
      `skip_reason:` field with a one-line justification (e.g. "covered by
      product-stage acceptance only, not backend behavior"). The audit script
      treats `skip_reason` as valid, but the `unit-16` review criteria require
      a human reviewer to eyeball the skip list — see §Review checklist in the
      unit body.

3. **`packages/haiku/scripts/audit-backend-coverage.mjs`** — a Node ESM script,
   zero new dependencies (uses only `node:fs`, `node:path`, `node:child_process`,
   and `yaml` if already in the root — otherwise parses YAML via a 30-line
   hand-rolled parser; coverage map has no deeply nested structures, so a
   minimal parser is fine). Responsibilities:

   - **Parse feature files.** Walk
     `.haiku/intents/universal-feedback-model-and-review-recovery/features/*.feature`;
     extract every `Scenario:` and `Scenario Outline:` + `Examples:` row. Emit
     a canonical `{feature, scenario}` set.
   - **Parse coverage map.** Load `backend-feature-coverage.yaml`; collapse to
     the same canonical set, with a `covered_by` or `skip_reason` annotation.
   - **Diff.** Any scenario in the feature set with no coverage-map entry →
     exit 1 with a report. Any coverage-map entry referencing a feature file
     or scenario that no longer exists → exit 1 with a report (catches drift
     when product renames a scenario).
   - **Validate test references.** For each non-skipped entry, confirm the
     referenced `test-file` exists and `grep` the test name as a substring of
     `it(` / `test(` / `describe(` names in that file. If no match, exit 1.
     (No need to actually run the test here — running happens in the next
     step — this just catches coverage-map typos.)
   - **Run tests.** For every unique test file mentioned in the coverage map,
     run `node --test <file>` via `child_process.spawnSync` and require exit
     code 0. Aggregate any failures into the final report.
   - **Summary output.** On exit-0, print one line per feature file:
     `feedback-crud.feature: 39/39 scenarios covered, all tests passing`.
   - **Flags.** `--map-only` skips the test-run step (for quick map validation
     during development). `--verbose` emits per-scenario diagnostics.

## Files to modify (none)

No existing `units/*.md`, `artifacts/*.md`, or `packages/haiku/src/*` files are
edited by this fix. This is purely additive:

- Existing unit 01's line 62-64 paragraph ("already shipped in prior bolts …")
  stays as-is; unit-16 is the explicit gate it was implicitly gesturing at.
- Legacy `artifacts/unit-02-crud-companion-tools.md` etc. stay as narrative
  evidence. FB-44 (the unit-numbering-collision finding) will separately
  handle renaming them — not this fix's scope.
- `stages/development/state.json` is touched only insofar as the FSM picks up
  unit-16; the builder does not hand-edit it.

## Implementation steps (for the builder in bolt 2)

1. **Re-read each feature file** to get exact scenario names and counts.
   Parallel-batch warning — the coverage map is authored once, so a clobber
   risk is minimal, but the audit script MUST source scenario names live from
   the `.feature` files, not from a hand-typed list, so upstream product edits
   don't silently drift.
2. **Write the audit script first** (`audit-backend-coverage.mjs`) with a
   dummy coverage map that maps every scenario to a single sentinel entry.
   Run it: it should exit 1 (map references scenarios that don't exist in the
   test file). This proves the script's negative-path works before any real
   mapping is done.
3. **Populate `backend-feature-coverage.yaml`** scenario-by-scenario. The
   simplest path: for each feature file, open the matching test file side by
   side and map scenario titles to existing test names. Use
   `--verbose --map-only` iteratively as you add entries.
4. **Resolve genuine gaps.** Any scenario with no covering test is a red
   flag — either (a) the backend lacks coverage (rare; audit-worthy finding
   that becomes new feedback, not new tests in this unit), or (b) the
   scenario is covered implicitly and needs a justified `skip_reason`. Err
   toward documenting a real test binding; `skip_reason` is a last resort.
5. **Write `unit-16-backend-feedback-regression-gate.md`** with the
   frontmatter and body shown above. `status: pending` so the FSM can pick it
   up. `depends_on: []` — this unit is a regression gate; it does not gate on
   other units in this visit.
6. **Run the full gate locally** from repo root:
   - `node packages/haiku/scripts/audit-backend-coverage.mjs` must exit 0.
   - All `node --test` invocations in the unit's Completion Criteria must
     exit 0.
   - `npx tsc --noEmit` must exit 0.
7. **Do NOT run `haiku_unit_start` / `haiku_unit_advance_hat`** — this is a
   fix-mode bolt, not unit execution. The FSM will pick up unit-16 on the
   next `haiku_run_next` tick once feedback FB-25 is closed.
8. **Commit** with message `haiku: fix FB-25 bolt 1 (planner)`. Do not push.

## Verification commands

```bash
# From repo root, after builder lands its changes:
node packages/haiku/scripts/audit-backend-coverage.mjs           # exit 0
node packages/haiku/scripts/audit-backend-coverage.mjs --verbose # human-readable
node --test packages/haiku/test/feedback.test.mjs                # exit 0
node --test packages/haiku/test/enforce-iteration.test.mjs       # exit 0
node --test packages/haiku/test/external-review.test.mjs         # exit 0
node --test packages/haiku/test/gate-feedback.test.mjs           # exit 0
node --test packages/haiku/test/orchestrator.test.mjs            # exit 0
node --test packages/haiku/test/orchestrator-integration.test.mjs # exit 0
node --test packages/haiku/test/http-feedback.test.mjs           # exit 0
npx tsc --noEmit                                                 # exit 0
```

All must exit 0. The planner hat does NOT run them; the builder does after
authoring the files.

## Risks

- **Scenario-to-test mapping is labor-intensive.** 149 scenarios × one
  lookup each ≈ 2-3 hours of careful work. The builder must resist the
  temptation to shortcut this with `skip_reason` en masse. A fuzzy-but-real
  binding (one test covers three scenarios) is fine; an empty binding is
  not. The audit script's `--verbose` output is the friend here.
- **Feature files use `Scenario Outline:` with `Examples:` tables.** Each
  row is logically a separate scenario. The parser must expand outlines
  or the coverage math will be wrong. Reference: `feedback-crud.feature`
  uses outlines for the author-guard matrix.
- **Product stage may rename scenarios later.** The audit script's drift
  check (coverage-map entries pointing at nonexistent scenarios) catches
  this — the gate will fail loudly on the next run, which is the correct
  behavior. Document this in the unit body so a future reviewer doesn't
  try to "fix" it by deleting the drift check.
- **`node --test` test names vs Gherkin scenario names.** Node's test names
  are free-form strings; Gherkin scenarios are structured. The coverage
  map's `covered_by: ["feedback.test.mjs::name-substring"]` treats the
  second half as a substring match, not exact. Document this explicitly
  in the audit script so the match logic can't silently accept
  over-broad substrings (e.g. `"feedback"` matching any test).
- **Parallel-batch clobber.** Unlikely — the files this plan creates are all
  new. But if another fix bolt has already landed a `unit-16-*.md` file
  (collision), pick the next free number (unit-17 etc.) and note the choice
  in the unit body.
- **No new tests.** This plan deliberately adds zero backend test code. The
  feedback body demands a unit that makes the coverage claim
  **verifiable**; running existing tests + a coverage map satisfies that
  without re-deriving 149 assertions. If a reviewer asks for more, the
  right response is new feedback calling out specific uncovered scenarios,
  not open-ended expansion of this fix.

## Out of scope

- Writing new backend tests. Existing tests are sufficient; the gate is
  about binding them, not expanding them.
- Renaming legacy artifact notes (`unit-02-crud-companion-tools.md` etc.).
  FB-44 owns that.
- Adding a Cucumber/BDD runner to the repo. Overkill for 149 scenarios that
  are already covered by scenario-shaped Node test names; adds a dev-dep
  and runtime for zero behavioral gain.
- Promoting the six legacy notes into full current-visit units. Explicitly
  rejected — duplicates invariants; one regression gate is strictly better.
- Editing `unit-01-extract-haiku-api-package.md`'s "already shipped" paragraph
  — unit-16 is the explicit gate it gestures at; rewording it would require
  re-running unit-01, which is already `status: completed`.

## Done when

- `stages/development/units/unit-16-backend-feedback-regression-gate.md`
  exists with the frontmatter and completion criteria shown above.
- `stages/development/artifacts/backend-feature-coverage.yaml` exists and
  every scenario in the six feature files has a `covered_by` or justified
  `skip_reason` entry.
- `packages/haiku/scripts/audit-backend-coverage.mjs` exists and exits 0
  when run from repo root with the default flags.
- All `node --test packages/haiku/test/*.test.mjs` commands in the unit's
  Completion Criteria exit 0.
- `npx tsc --noEmit` exits 0.
- Changes are committed with `haiku: fix FB-25 bolt 1 (planner)`; not
  pushed.
- FB-25's feedback body no longer applies: the stage has a current-visit
  unit whose mechanical gate binds the six product-declared feature files
  to passing backend tests. The assessor can verify coverage claims by
  re-running the audit script.
