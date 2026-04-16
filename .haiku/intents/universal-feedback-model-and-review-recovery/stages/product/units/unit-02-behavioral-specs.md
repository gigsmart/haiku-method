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
status: completed
bolt: 1
hat: validator
started_at: '2026-04-16T14:36:27Z'
hat_started_at: '2026-04-16T14:42:54Z'
outputs:
  - knowledge/DATA-CONTRACTS.md
  - knowledge/COVERAGE-MAPPING.md
completed_at: '2026-04-16T14:44:42Z'
---

# Behavioral Specs in Gherkin

Finalize the 7 `.feature` files produced during discovery (6 original + 1 added for revisit-with-reasons). Validate that every P0 acceptance criterion maps to at least one Gherkin scenario, scenarios use domain language consistently, and each feature has happy path + error + edge case coverage.

## Completion Criteria

- 7 `.feature` files exist at `features/` with valid Gherkin syntax
- feedback-crud.feature: covers create, list, update, delete, reject with author guards, tool rename (US-09), default author values
- auto-revisit.feature: covers pending-feedback gate check, rollback to elaborate, visits increment, subagent findings trigger, session restart persistence
- enforce-iteration-fix.feature: covers per-stage status check, regression test for the cowork bug
- additive-elaborate.feature: covers visits > 0 mode, closes: [FB-NN] validation, frozen units
- review-ui-feedback.feature: covers changes_requested -> feedback files, CRUD endpoints, inline annotations, approve-with-pending confirmation, status changes from UI, sorting
- external-review-feedback.feature: covers GitHub/GitLab changes-requested detection, comment routing
- revisit-with-reasons.feature: covers reasons parameter, stopgap behavior, feedback gate integration, validation errors
- Each feature has >= 1 happy path, >= 3 error scenarios, >= 2 edge cases
- Domain language matches ACCEPTANCE-CRITERIA.md terminology
