---
name: validation
description: Validate data quality, schema compliance, and business rules
hats: [validator, data-quality-reviewer]
review: ask
unit_types: [validation]
inputs:
  - stage: transformation
    discovery: modeled-data
review-agents-include:
  - stage: extraction
    agents: [correctness]
---

# Validation

## Criteria Guidance

Good criteria examples:
- "Data quality checks cover uniqueness, not-null constraints, referential integrity, and accepted value ranges for every target table"
- "Row count reconciliation between source and target is within the agreed tolerance (e.g., < 0.1% variance)"
- "Business rule tests verify at least 3 known edge cases per critical transformation (e.g., timezone handling, currency conversion, null propagation)"

Bad criteria examples:
- "Data quality is validated"
- "Tests pass"
- "Business rules are checked"

## Completion Signal (RFC 2119)

Validation suite **MUST** cover schema compliance, uniqueness, referential integrity, accepted value ranges, and row count reconciliation. Business rule tests verify edge cases. Data quality reviewer **MUST** have confirmed test coverage is sufficient and all critical paths have assertions. Validation results are logged with pass/fail/warning status per check.
