---
name: validation-report
location: .haiku/intents/{intent-slug}/knowledge/
scope: intent
format: text
required: true
---

# Validation Report

Data quality verification results covering schema compliance, business rules, and reconciliation.

## Expected Artifacts

- **Quality check results** -- uniqueness, not-null, referential integrity, and value range checks per target table
- **Row count reconciliation** -- source-to-target variance within agreed tolerance
- **Business rule tests** -- edge case verification for critical transformations
- **Coverage summary** -- percentage of target tables with passing quality checks

## Quality Signals

- Quality checks cover all target tables with no unchecked entities
- Row count reconciliation is within agreed tolerance thresholds
- At least 3 edge cases are tested per critical transformation
- Failed checks have documented remediation actions
