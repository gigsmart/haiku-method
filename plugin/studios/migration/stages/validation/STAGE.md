---
name: validation
description: Verify data integrity, functional parity, and performance
hats: [validator, regression-tester]
review: ask
unit_types: [validation]
inputs:
  - stage: migrate
    discovery: migration-artifacts
review-agents-include:
  - stage: mapping
    agents: [accuracy]
---

# Validation

## Criteria Guidance

Good criteria examples:
- "Row-count reconciliation shows zero discrepancy between source and target for every entity"
- "Spot-check validation compares at least 100 randomly sampled records per entity with field-level diff"
- "Performance benchmarks show target query latency within 10% of source for critical paths"

Bad criteria examples:
- "Data looks correct"
- "Validation is complete"
- "Performance is acceptable"

## Completion Signal

Validation report exists with quantitative reconciliation results (row counts, checksum comparisons, sample diffs). Functional parity tests confirm that downstream consumers produce identical results against the migrated data. Performance benchmarks are within defined thresholds.
