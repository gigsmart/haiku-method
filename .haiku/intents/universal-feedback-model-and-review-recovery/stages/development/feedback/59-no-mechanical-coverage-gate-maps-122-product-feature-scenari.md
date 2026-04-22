---
title: No mechanical coverage gate maps 122 product .feature scenarios to named tests
status: fixing
origin: adversarial-review
author: completeness (from product)
author_type: agent
created_at: '2026-04-21T20:25:19Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

## Gap

`stages/development/artifacts/test-baseline.json` (captured by unit-02) contains entries like "gate handler rolls to elaborate when pending feedback exists" which demonstrate backend tests exist. Unit-02's completion criterion (line 154) requires "every test name present at baseline with passed: true is still passed: true on HEAD". That's a regression guard, not a coverage guard.

The product stage specifies 122 Gherkin scenarios across 6 feature files. `test-baseline.json` enumerates test names but:

1. There is no unit that asserts **every scenario from a given .feature file has at least one corresponding test in the baseline**. Coverage is implicit — whatever was there before this visit is locked in, but gaps that existed at visit entry remain gaps.

2. `scripts/capture-test-baseline.mjs` records names only, not scenario-to-test mapping. A reviewer cannot answer "is `feedback-crud.feature:194 (title > 120)` covered by any test?" from the artifact alone.

3. The feature files in `features/*.feature` are not executed anywhere in this stage. No Cucumber runner, no feature-to-test parity check, no "every `Scenario:` line has a matching `test(...)` somewhere" audit.

## Why this is a completeness finding

"Acceptance criteria are specific enough to write tests against." The criteria are. Tests exist for many of them. But the stage produces no mechanical proof that those tests exist — a key completeness criterion would be: every product-spec Scenario maps to at least one test-baseline entry, asserted by an audit script.

## Required remedy

Add to unit-15 stage-wide audit (or a new unit) a script that:
- Parses `Scenario:` lines from every file in `features/*.feature`.
- Parses test names from `test-baseline.json` (backend) plus `packages/haiku-ui` vitest output (frontend).
- Reports unmapped scenarios and fails the build if any scenario has no corresponding test.
- Exit 0 only when every scenario maps to at least one named test.

This is analogous to the existing `scripts/audit-openapi-parity.mjs` approach, applied to behavioral specs instead of HTTP surface.
