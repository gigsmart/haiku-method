# Fix FB-59 — Tactical Plan (planner, bolt 1)

**Finding:** No mechanical coverage gate maps the product stage's 149 `Scenario:` lines (feedback body says "122" — see §Scope delta below) in `features/*.feature` to named tests in the repo. `test-baseline.json` is a regression guard (locks in existing passes), not a coverage guard.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/59-no-mechanical-coverage-gate-maps-122-product-feature-scenari.md`

## TL;DR

The builder adds one new audit script — `packages/haiku/scripts/audit-scenario-coverage.mjs` — plus wires it into the stage-wide `audit:stage-wide` composite in `packages/haiku-ui/package.json` and the unit-15 completion-criteria list. The script:

1. Parses every `^\s*Scenario:\s*(.+)$` (and `Scenario Outline:`) line out of `.haiku/intents/universal-feedback-model-and-review-recovery/features/*.feature`.
2. Reads test names out of:
   - `stages/development/artifacts/test-baseline.json` (backend — `packages/haiku` pass/fail baseline; canonical source for backend test names).
   - Vitest discovery over `packages/haiku-ui` (`vitest list --json` or `vitest run --reporter=json --silent`) — captured fresh each run, not from a baseline (frontend tests are fast).
3. For each scenario, normalizes the title (lowercase, strip punctuation, collapse whitespace) and searches the normalized corpus of all test names (backend + frontend) for a substring or whole-title match.
4. Emits a per-feature-file report of unmapped scenarios and exits non-zero if any scenario has zero mapped tests.
5. Records the mapping in `stages/development/artifacts/scenario-coverage.json` so the reviewer (and this stage's feedback-assessor) can read the machine-checked result directly.

The template is `packages/haiku-api/scripts/audit-openapi-parity.mjs` per the feedback body — same pattern: emit a contract surface, probe, reconcile, report missing entries, non-zero exit on gap.

## Scope delta: 122 vs 149

The feedback title claims 122 scenarios but seven feature files currently hold 149 `Scenario:` lines (15 + 19 + 15 + 17 + 39 + 27 + 17 via `grep -c ^\s*Scenario: features/*.feature`). The delta is the 12 scenarios the specification hat added in validator-hat bolt r2 (`knowledge/COVERAGE-MAPPING.md` line 7: *"Specification hat added 12 new scenarios in bolt 1 to close coverage gaps"*) plus additional `revisit-with-reasons.feature` scenarios that post-dated the feedback. The audit script uses the **live** file contents — 149 is correct today; the feedback's "122" was accurate at feedback-creation time. This is not a conflict: the remedy (mechanical coverage gate) applies regardless of the current count.

## Root cause

Three facts compose the gap:

1. **Regression guard ≠ coverage guard.** `capture-test-baseline.mjs` records names for regression detection; `legacy-crud-companion-tools.md §Completion Criteria` (renamed by FB-44) locks in *passes* but makes no claim that every scenario has a test.
2. **Feature files are read-only specs.** No Cucumber runner exists in the project — the project uses Vitest everywhere (planner verified: `rg "cucumber|@cucumber" package.json packages/*/package.json` returns zero matches). The `features/*.feature` files are acceptance specs referenced by `knowledge/COVERAGE-MAPPING.md` but never executed.
3. **`COVERAGE-MAPPING.md` is prose, not a gate.** It's a hand-curated human-readable matrix (`knowledge/COVERAGE-MAPPING.md §2`). It does not fail a build on drift — if a new scenario is added to a `.feature` file and no test mentions its title, nothing breaks.

The remedy is a deterministic executable that fills slot (3) — a lint-style audit that runs in CI, matches live feature scenarios against live test-name corpora, and exits non-zero on any orphan scenario.

## File changes

### New script

1. **Create** `packages/haiku/scripts/audit-scenario-coverage.mjs`

   Template: `packages/haiku-api/scripts/audit-openapi-parity.mjs` (same module format, error handling pattern, 30s budget guard).

   Sketch (final authoritative form lives in the builder hat):

   ```js
   #!/usr/bin/env node
   // audit-scenario-coverage.mjs — asserts every `Scenario:` line in
   // .haiku/intents/universal-feedback-model-and-review-recovery/features/*.feature
   // has at least one matching test name across (a) the backend pass/fail baseline
   // in stages/development/artifacts/test-baseline.json and (b) the live Vitest
   // test corpus in packages/haiku-ui.
   //
   // Exit 0 iff every scenario maps to ≥ 1 test. Exit 1 with per-orphan report.
   // Writes stages/development/artifacts/scenario-coverage.json so the reviewer
   // can re-read the mapping without re-running the script.
   //
   // Budget: 30s wall-clock (matches audit-openapi-parity.mjs convention).

   import { execSync } from "node:child_process"
   import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs"
   import { dirname, join, resolve } from "node:path"
   import { fileURLToPath } from "node:url"

   const here = dirname(fileURLToPath(import.meta.url))
   const repoRoot = resolve(here, "..", "..", "..")
   const intentRoot = join(repoRoot, ".haiku/intents/universal-feedback-model-and-review-recovery")
   const featureDir = join(intentRoot, "features")
   const baselineFile = join(intentRoot, "stages/development/artifacts/test-baseline.json")
   const coverageOut = join(intentRoot, "stages/development/artifacts/scenario-coverage.json")
   const BUDGET_MS = 30_000

   function parseScenarios(featurePath) {
     // Match: "Scenario: <title>" and "Scenario Outline: <title>" (case-exact).
     // Ignore commented-out lines (leading "#" after optional whitespace).
     const lines = readFileSync(featurePath, "utf8").split("\n")
     const out = []
     for (let i = 0; i < lines.length; i++) {
       const m = lines[i].match(/^\s*Scenario(?:\s+Outline)?:\s*(.+?)\s*$/)
       if (m) out.push({ file: featurePath, line: i + 1, title: m[1] })
     }
     return out
   }

   function normalize(s) {
     return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
   }

   async function collectFrontendTests() {
     // Vitest supports `--reporter=json` with a list-only mode via
     // `vitest list --reporter=json`. Run in packages/haiku-ui with a cwd pin.
     // On failure, fall back to grep-parsing `it(...)` / `test(...)` / `describe(...)`.
     const pkgUi = join(repoRoot, "packages/haiku-ui")
     try {
       const out = execSync("npx vitest list --reporter=json --run", {
         cwd: pkgUi, encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe"],
       })
       const parsed = JSON.parse(out)
       return parsed.tests ?? [] // shape: [{ name, file }, ...]
     } catch {
       return grepItNames(pkgUi)
     }
   }

   // ...match loop, report, writeFile(scenario-coverage.json), exit code.
   ```

   The script emits human-readable output to stdout on failure and JSON to `scenario-coverage.json` always.

   Matching policy (documented in the script header):
   - **Case-insensitive, punctuation-insensitive** substring match. A test named `"agent cannot close human-authored"` maps the scenario `"Agent cannot set status to closed on human-authored"` if and only if the normalized scenario title is a substring of a normalized test name OR vice versa (bidirectional substring).
   - **Alias escape hatch:** an allowlist file at `stages/development/artifacts/scenario-coverage-aliases.json` maps a scenario title to one or more alternative canonical test-name substrings. Used when a scenario's prose title diverges from the test name but the coverage is real (e.g., scenario "GitHub PR changes-requested creates a summary feedback file" paired with test "external review PR creates summary feedback").
   - **Explicit ignore:** same aliases file carries an `ignore` array — scenarios that are intentionally spec-only (documentation scenarios, aspirational ones tagged `@pending` in the feature) are excluded with a written reason. The script prints the count of ignored scenarios so reviewers can audit the ignore list size.

2. **Create** `packages/haiku/scripts/audit-scenario-coverage.aliases.example.json`

   A placeholder example alias file to seed the format in the first commit. The actual aliases file at `stages/development/artifacts/scenario-coverage-aliases.json` gets populated during first-run triage.

### Wiring

3. **`packages/haiku-ui/package.json` — append to `audit:stage-wide` composite:**

   ```json
   "audit:stage-wide": "... && node ../haiku/scripts/audit-scenario-coverage.mjs"
   ```

   (The existing composite concatenates with `&&` — this follows the same pattern. See the unit-15 plan §Implementation Steps step 10.)

4. **`packages/haiku/package.json` — add top-level script:**

   ```json
   "audit:scenario-coverage": "node scripts/audit-scenario-coverage.mjs"
   ```

   Separate entry for local dev invocation + composite reuse.

5. **`.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/unit-15-stagewide-audit.md — §Completion Criteria:**

   Add one bullet:

   ```markdown
   - `node packages/haiku/scripts/audit-scenario-coverage.mjs` (sub-second; fails on any scenario with no mapped test)
   ```

   And reference in §Scope under a new sub-bullet under "New audit scripts owned by this unit" — but since unit-15 is already `status: completed`, the planner's preferred path is to land this under unit-15's artifacts (`stages/development/artifacts/scenario-coverage.json`) and the audit script in `packages/haiku/scripts/` without re-opening the unit spec. The unit-15 §Completion Criteria addition happens only if unit-15's feedback-assessor rejects closure; otherwise the stage-wide composite is the source of truth.

### New baseline file

6. **`stages/development/artifacts/scenario-coverage.json`** — written by the first successful run. Format:

   ```json
   {
     "recorded_at": "<ISO>",
     "head": "<git sha>",
     "total_scenarios": 149,
     "mapped": 140,
     "unmapped": 9,
     "ignored": 0,
     "by_feature": {
       "additive-elaborate.feature": { "total": 15, "mapped": 15, "unmapped": [] },
       "feedback-crud.feature": { "total": 39, "mapped": 37, "unmapped": ["<title-1>", "<title-2>"] },
       "...": { }
     },
     "unmapped_scenarios": [
       { "file": "feedback-crud.feature", "line": 194, "title": "..." }
     ]
   }
   ```

   First-run expected outcome: the audit fails (unmapped > 0) because (a) some scenarios genuinely have no test yet, and (b) some legitimately-covered scenarios need alias entries. The builder's job on bolt 1 is to land the script and the initial alias file populated with the obvious matches; any genuinely uncovered scenarios get filed as fresh FB items per the stage's adversarial-review convention (they are **not** this fix's responsibility to implement tests for — the fix's responsibility is the gate).

   **Acceptance signal for this fix:** the script exists, runs to completion, writes `scenario-coverage.json`, and the exit code (zero or non-zero) reflects the current truth. It is OK for the first run to exit 1 with a list of unmapped scenarios — that's the audit doing its job. It is NOT OK for the script to exit 0 by ignoring everything.

## Implementation Steps (builder, bolt 1)

1. **Step 1 — create `packages/haiku/scripts/audit-scenario-coverage.mjs`** following the sketch above. Use `audit-openapi-parity.mjs` structure verbatim for the budget-guard, error-formatting, and exit-code conventions. Keep the scenario parser a plain regex over lines (no Gherkin AST library — the project has no dependency on `@cucumber/gherkin` and adding one is out of scope for a coverage audit).

2. **Step 2 — run the script locally** from the worktree root. Observe the unmapped count. Triage the top orphans:
   - If a scenario has an obvious matching test (different wording), add it to the seed alias file.
   - If a scenario is genuinely uncovered, record the title in `scenario-coverage.json` under `unmapped_scenarios` (the script does this automatically) and leave it; filing follow-up fixes is out of scope for this finding.

3. **Step 3 — commit the script, alias file, and generated `scenario-coverage.json`** as a single commit: `haiku: fix FB-59 bolt 1 (planner)` (per the hat prompt line 50 template). No push.

4. **Step 4 — wire the script into `packages/haiku-ui/package.json audit:stage-wide`** AND `packages/haiku/package.json audit:scenario-coverage`. Run `node packages/haiku/scripts/audit-scenario-coverage.mjs` from repo root to confirm invocation path resolves.

5. **Step 5 — if unit-15's feedback-assessor still rejects on this bolt**, the follow-up planner bolt amends `unit-15-stagewide-audit.md §Completion Criteria` to list the new script inline. Not in scope for bolt 1 — the stage-wide composite wiring + first-run `scenario-coverage.json` on disk is the evidence the feedback-assessor needs.

## Verification commands

Each MUST exit as indicated. Invoke from the worktree root.

- `grep -c "^[[:space:]]*Scenario" .haiku/intents/universal-feedback-model-and-review-recovery/features/*.feature` → 149 total (or current true count).
- `node packages/haiku/scripts/audit-scenario-coverage.mjs` → exits 0 if all scenarios map, else exits 1 with per-orphan report AND writes `stages/development/artifacts/scenario-coverage.json`.
- `test -f .haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/scenario-coverage.json` → exit 0 (file exists after first run).
- `jq '.total_scenarios, .mapped, .unmapped' .haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/scenario-coverage.json` → returns integers; sanity check: `mapped + unmapped + ignored == total_scenarios`.
- `npx tsc --noEmit` repo-wide → exit 0 (no tsc regressions from the new JS module).
- `grep -l "audit-scenario-coverage" packages/haiku-ui/package.json packages/haiku/package.json` → returns both files.

## Risks

1. **Vitest `list --reporter=json` output shape drift.** Vitest has changed its list subcommand schema between minor releases. **Mitigation:** the script falls back to grep-parsing `it(...)` / `test(...)` names if the JSON parse fails. Grep parsing is less precise (collects commented-out calls, etc.) but it degrades gracefully rather than erroring.

2. **Substring-match false positives.** Scenario "Agent cannot delete human-authored" will match test "cannot delete" — which might live in an unrelated file. **Mitigation:** the match is bidirectional substring with normalization; false positives are logged (a scenario-to-test-name resolution in `scenario-coverage.json` lists the matched test file path). If the reviewer spots a suspicious match, they file a follow-up; the alias file can tighten the match to full-title-equality for a specific scenario.

3. **`test-baseline.json` staleness.** The baseline was captured at a prior HEAD; between captures, new tests exist only in the live Vitest run. **Mitigation:** the script pulls **live** backend tests via `npm --prefix packages/haiku test -- --reporter=json --run` if the baseline is older than a threshold (default: 7 days, configurable by `--max-baseline-age-days=N`). First-bolt implementation can ship with just baseline reads; the "live" path lands as a follow-up if needed.

4. **Feature-file path hard-coding.** The script hard-codes `.haiku/intents/universal-feedback-model-and-review-recovery/features/*.feature`. **Mitigation:** this is correct for this intent; the script lives **inside** this intent's development stage. If the intent slug changes, the script's constants file (top of file, all-caps `INTENT_SLUG = "..."`) is a single-line edit. Not a risk for this fix.

5. **149 vs 122 delta.** The feedback body cites 122; current count is 149 (see §Scope delta). **Mitigation:** the plan treats the number as the **live** count and not a magic constant. The script has no hard-coded total; it asserts `unmapped === 0` relative to the live count each run. The feedback-assessor reads the updated count in `scenario-coverage.json` and confirms the gate is mechanical rather than numeric-pinned.

6. **First run failure blocks CI.** If the first run exits 1 because some scenarios are genuinely uncovered, the composite `audit:stage-wide` goes red. **Mitigation:** the seed alias file generated in step 2 covers the known-covered cases; any remaining orphans are filed as new feedback under this stage (not FB-59) before the `audit:stage-wide` composite is required to be green. The fix lands the **gate**, not the resolution of every historic coverage gap — those are separate findings per the adversarial-review convention.

## Out of scope (expressly)

- **Adding a Gherkin runner (Cucumber-js).** Unit-15's tactical plan line 181 explicitly rules this out: *"Cucumber step definitions. The project uses vitest, not cucumber-js."* Any scenario-to-step mapping happens via the audit's scenario-title ↔ test-name reconciliation, not via Cucumber step definitions.
- **Writing tests for currently-unmapped scenarios.** The fix's scope is the audit; if the first run reports 9 unmapped scenarios, each becomes its own follow-up feedback item under this stage, authored by the reviewer or by an adversarial-review subagent on a subsequent visit.
- **Amending the unit-15 spec** (`units/unit-15-stagewide-audit.md`). The unit is `status: completed`; amending it re-opens the FSM state. The fix lands in `packages/haiku/scripts/` and `stages/development/artifacts/` only, with `package.json` wiring. If the feedback-assessor insists on unit-15 spec edits, that's a bolt-2 escalation.
- **Modifying `test-baseline.json`.** It is a regression baseline, not the source of truth for coverage. The new `scenario-coverage.json` artifact is the coverage truth.

## Completion signal

Fix is ready for feedback-assessor when:

1. `packages/haiku/scripts/audit-scenario-coverage.mjs` exists and is executable.
2. `packages/haiku-ui/package.json` `audit:stage-wide` includes the new script in the composite.
3. `packages/haiku/package.json` exposes `audit:scenario-coverage` for standalone invocation.
4. `stages/development/artifacts/scenario-coverage.json` exists and reflects the true live count of scenarios with `mapped + unmapped + ignored == total_scenarios`.
5. Running the script exits zero (all scenarios mapped via tests or alias file) OR exits non-zero with a machine-readable orphan list the human reviewer can act on.
6. Commit on the current branch with message `haiku: fix FB-59 bolt 1 (planner)`; no push.
