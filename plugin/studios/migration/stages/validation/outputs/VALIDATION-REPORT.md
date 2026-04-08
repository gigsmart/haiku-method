---
name: validation-report
location: .haiku/intents/{intent-slug}/stages/validation/artifacts/
scope: intent
format: text
required: true
---

# Validation Report

Data integrity, functional parity, and performance verification results.

## Expected Artifacts

- **Row-count reconciliation** -- source-to-target comparison for every entity
- **Spot-check results** -- randomly sampled records compared with field-level diff
- **Performance benchmarks** -- target query latency compared to source for critical paths
- **Parity assessment** -- functional equivalence verified between source and target

## Quality Signals

- Row-count reconciliation shows zero or acceptable discrepancy per entity
- At least 100 randomly sampled records are compared per entity
- Performance benchmarks show target latency within acceptable range of source
- All critical functional paths are verified for parity
