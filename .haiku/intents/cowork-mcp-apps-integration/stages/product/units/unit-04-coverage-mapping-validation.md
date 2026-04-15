---
title: Validate coverage mapping — every criterion → AC + spec
type: validation
model: sonnet
depends_on:
  - unit-01-finalize-acceptance-criteria
  - unit-02-finalize-feature-files
  - unit-03-finalize-data-contracts
inputs:
  - intent.md
  - knowledge/COVERAGE-MAPPING.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - knowledge/DATA-CONTRACTS.md
status: completed
bolt: 1
hat: validator
started_at: '2026-04-15T14:26:02Z'
hat_started_at: '2026-04-15T14:31:29Z'
outputs:
  - knowledge/COVERAGE-MAPPING.md
completed_at: '2026-04-15T14:32:46Z'
---

# Validate coverage mapping

## Scope

The `coverage-mapping` artifact at `knowledge/COVERAGE-MAPPING.md` was produced as a scaffold during elaboration — every row's `AC reference` and `Spec reference` columns are currently `TBD: ...`. This unit fills them in after units 01–03 finalize their respective documents, then runs the validator hat to produce an APPROVED or GAPS FOUND verdict.

In scope:
- Walk the matrix row-by-row. For each unit criterion, find the matching AC item(s) in `ACCEPTANCE-CRITERIA.md` and the matching scenario(s) in `features/*.feature`.
- Replace every `TBD: ` placeholder with a concrete reference.
- Mark each row's `Status` column as `mapped` or `gap`.
- Populate the `## Gaps Found` section with any criterion that has no AC or spec mapping. Name the responsible hat (product, specification, or upstream design/inception) and what they need to fix.
- Populate the `## Scope Creep` section with any AC or spec item that doesn't trace back to a unit criterion.
- Update the `## Validation Decision` section: `APPROVED` if zero gaps, `GAPS FOUND` otherwise.

Out of scope:
- Modifying `ACCEPTANCE-CRITERIA.md`, the `.feature` files, or `DATA-CONTRACTS.md` — those are upstream artifacts at this point. If a gap requires changes to them, write the gap into the `## Gaps Found` section and return; the user / a follow-up bolt addresses it.
- Modifying unit specs.

## Completion Criteria

1. **Zero `TBD: ` strings remain** in the matrix. `! rg -n '^TBD: ' knowledge/COVERAGE-MAPPING.md` exits with no matches.
2. **Every row has `Status: mapped|gap`.** No `pending`. Verified by `! grep -E 'Status:\s*pending' knowledge/COVERAGE-MAPPING.md`.
3. **Validation decision is set** to `APPROVED` or `GAPS FOUND`. Verified by `grep -E '^status: (APPROVED|GAPS FOUND)' knowledge/COVERAGE-MAPPING.md`.
4. **Gaps section is populated** if the decision is `GAPS FOUND`. If `APPROVED`, the section reads `(none)`.
5. **Scope creep section is populated** with at least a `(none)` placeholder.
6. **Every gap names a responsible hat** and a specific upstream artifact to amend. Verified by manual review.
