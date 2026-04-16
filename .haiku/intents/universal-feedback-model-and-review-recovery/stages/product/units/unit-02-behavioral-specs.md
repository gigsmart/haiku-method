---
title: Behavioral specs in Gherkin
type: spec
depends_on:
  - unit-01-acceptance-criteria
quality_gates: []
inputs:
  - knowledge/DISCOVERY.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - knowledge/DATA-CONTRACTS.md
status: active
bolt: 1
hat: product
started_at: '2026-04-16T14:36:27Z'
hat_started_at: '2026-04-16T14:36:27Z'
outputs:
  - knowledge/DATA-CONTRACTS.md
---

# Behavioral Specs in Gherkin

Finalize the 6 `.feature` files produced during discovery. Validate that every P0 acceptance criterion maps to at least one Gherkin scenario, scenarios use domain language consistently, and each feature has happy path + error + edge case coverage.

## Completion Criteria

- 6 `.feature` files exist at `features/` with valid Gherkin syntax
- feedback-crud.feature: covers create, list, update, delete, reject with author guards
- auto-revisit.feature: covers pending-feedback gate check, rollback to elaborate, visits increment
- enforce-iteration-fix.feature: covers per-stage status check, regression test for the cowork bug
- additive-elaborate.feature: covers visits > 0 mode, closes: [FB-NN] validation, frozen units
- review-ui-feedback.feature: covers changes_requested → feedback files, CRUD endpoints, inline annotations
- external-review-feedback.feature: covers GitHub/GitLab changes-requested detection, comment routing
- Each feature has ≥ 1 happy path, ≥ 3 error scenarios, ≥ 2 edge cases
- Domain language matches ACCEPTANCE-CRITERIA.md terminology
