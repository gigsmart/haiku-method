---
title: Backend feedback-model regression gate
type: regression
depends_on: []
closes:
  - FB-25
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
model: sonnet
---

# Backend feedback-model regression gate

Single current-visit unit that binds the six product-declared backend
feature files to the existing backend test suites as a mechanical gate.
Every product scenario must have at least one non-empty `covered_by`
binding (or a justified `skip_reason`) in
`stages/development/artifacts/backend-feature-coverage.yaml`, and every
referenced test must pass.

No new backend behavior is introduced by this unit — the implementations
already exist in `packages/haiku/src/*` and are tested by
`packages/haiku/test/*.test.mjs`. What this unit adds is the
**verifiability** of the coverage claim that the UI-focused units 01–15
implicitly rely on (per unit-01 L62–64, which asserts the backend
"already shipped in prior bolts"). One audit script plus one YAML map plus
this unit file closes the structural gap FB-25 identified.

## Scope

- **Feature files gated** (source of truth, intent-scope, owned by the
  product stage):
  - `features/feedback-crud.feature` — 39 scenarios.
  - `features/enforce-iteration-fix.feature` — 15 scenarios.
  - `features/auto-revisit.feature` — 19 scenarios.
  - `features/additive-elaborate.feature` — 15 scenarios.
  - `features/external-review-feedback.feature` — 17 scenarios.
  - `features/revisit-with-reasons.feature` — 17 scenarios.
  - Total: **122 scenarios** (matches the count in FB-25; Scenario
    Outlines in the current revision do not use `Examples:` tables, so
    outline rows do not multiply the count).
- **Test suites exercised** (subset of `packages/haiku/test/*.test.mjs`,
  selected via `covered_by` bindings in the coverage map):
  - `feedback.test.mjs` — CRUD, author-guards, slug, numbering.
  - `enforce-iteration.test.mjs` — per-stage state.json completion.
  - `gate-feedback.test.mjs` — gate-phase pending-feedback rollback,
    `haiku_revisit` schema, `feedback_revisit` payload.
  - `external-review.test.mjs` — GitHub/GitLab external-review
    detection, summary-feedback write.
  - `orchestrator.test.mjs` — `haiku_revisit` schema, `closes:` DAG
    handling.
  - `orchestrator-integration.test.mjs` — review-to-feedback routing,
    `closes:` frontmatter parsing.
- **Audit script owned by this unit**:
  `packages/haiku/scripts/audit-backend-coverage.mjs`. Parses the six
  feature files, parses `backend-feature-coverage.yaml`, diffs the two,
  validates every `covered_by` pointer, and runs the referenced test
  files via `npx tsx` (package convention). Exit 0 is the green gate.
- **Coverage map owned by this unit**:
  `stages/development/artifacts/backend-feature-coverage.yaml`. One
  entry per scenario keyed by `scenario: "<title>"` with a non-empty
  `covered_by:` list or a documented `skip_reason:`. Uses a restricted
  YAML subset (top-level feature-file keys, `- scenario:` list entries,
  `covered_by:` block lists, `notes:` / `skip_reason:` folded scalars)
  that the audit script parses without an external YAML dependency.

## Out of scope

- Any new backend behavior. The implementations exist and are correct;
  this unit is a binding gate, not a feature.
- Writing new backend tests. Existing tests are sufficient to cover the
  122 scenarios; the coverage map ties them together.
- Renaming legacy artifact notes under
  `stages/development/artifacts/unit-0{2,4,5,6,7,8}-*.md` — owned by
  FB-44.
- Promoting those legacy notes into per-feature-file units — explicitly
  rejected by the FB-25 tactical plan as strictly worse than one
  regression gate.
- Adding a Cucumber/BDD runner to the repo. Overkill for 122 scenarios
  covered by scenario-shaped Node test names; adds a dev-dep and runtime
  for zero behavioral gain.
- Editing `unit-01-extract-haiku-api-package.md` L62–64 ("already
  shipped in prior bolts") — this unit is the explicit gate that
  paragraph implicitly gestures at. Re-running unit-01 (which is
  `status: completed`) is not worth the churn.
- UI surface work — owned by units 01–15.
- HTTP-layer-specific regressions (`http-feedback.test.mjs`). The
  HTTP layer is a separate gate and its scenarios are not product-
  declared backend feedback-model behaviors; some HTTP tests have
  pre-existing failures tracked under other findings.

## Completion Criteria

All of the following commands must exit 0, run from the repo root:

- `node packages/haiku/scripts/audit-backend-coverage.mjs` — parses the
  six feature files, validates the coverage map, and runs every
  referenced test file. Single exit-0 is the green gate for all 122
  scenarios.
- `node packages/haiku/scripts/audit-backend-coverage.mjs --map-only` —
  static check without test execution. Must also exit 0 (proves the map
  is structurally sound in isolation).
- `npx tsc --noEmit` from `packages/haiku/` — typecheck passes
  repo-wide as for every other unit in this stage.

The audit script is the single source of truth for the 122-scenario
regression gate. It fails loudly if:

1. Product renames or adds a scenario in any of the six feature files
   without updating the coverage map.
2. A `covered_by` binding points at a test file or name-substring that
   does not exist.
3. Any referenced test file exits non-zero.

## Review checklist (for the feedback-assessor)

- [ ] `backend-feature-coverage.yaml` has exactly one entry per scenario
      in the six feature files (122 entries total).
- [ ] Every entry has either a non-empty `covered_by:` list or a
      `skip_reason:` describing why the scenario is not verifiable from
      backend tests alone.
- [ ] `skip_reason` count is bounded and justified — the plan budgets
      ≤ 8 total; the current map uses 8 across three feature files
      (3 in feedback-crud, 2 in additive-elaborate, 3 in
      revisit-with-reasons).
- [ ] `node packages/haiku/scripts/audit-backend-coverage.mjs` exits 0
      from a clean repo checkout.
- [ ] The audit script's drift check (coverage-map entries pointing at
      nonexistent scenarios) is exercised — rename any scenario in a
      feature file and re-run; the gate should fail. Revert the rename
      when done.

## References

- FB-25 feedback:
  `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/25-core-backend-feedback-model-behaviors-have-no-current-visit.md`
- FB-25 tactical plan:
  `stages/development/artifacts/fix-FB-25-tactical-plan.md`
- Coverage map:
  `stages/development/artifacts/backend-feature-coverage.yaml`
- Audit script:
  `packages/haiku/scripts/audit-backend-coverage.mjs`
