---
name: validation-report
location: .haiku/intents/{intent-slug}/knowledge/VALIDATION-REPORT.md
scope: intent
format: text
required: true
---

# Validation Report

Document quantitative verification of the migration. This output feeds the cutover stage as evidence for go/no-go decisions.

## Content Guide

Structure the report around verification categories:

- **Row-count reconciliation** — source vs. target counts per entity with discrepancy analysis
- **Checksum comparison** — hash-based verification for data integrity
- **Sample-based validation** — randomly sampled records with field-level diffs
- **Constraint verification** — unique keys, foreign keys, check constraints all satisfied in target
- **Regression test results** — downstream consumers produce identical output against migrated data
- **Performance benchmarks** — query latency comparison for critical paths (source vs. target)
- **Discrepancy register** — any differences found with root cause and resolution

## Quality Signals

- Reconciliation is quantitative, not qualitative — numbers, not opinions
- Sampling is random and statistically meaningful, not cherry-picked
- Records intentionally transformed or dropped are accounted for in reconciliation
- Performance benchmarks cover the critical query patterns, not just simple lookups
