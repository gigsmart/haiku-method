---
name: analysis
description: Perform variance analysis and track financial performance
hats: [analyst, auditor]
review: auto
unit_types: [variance, performance-tracking]
inputs:
  - stage: budget
    discovery: budget-plan
  - stage: forecast
    discovery: forecast-model
---

# Analysis

## Criteria Guidance

Good criteria examples:
- "Variance report explains every deviation greater than 5% from budget with root cause and corrective action"
- "Performance metrics include both leading and lagging indicators with trend analysis over at least 3 periods"
- "Each finding is categorized as structural (requires budget revision), timing (self-correcting), or operational (requires action)"

Bad criteria examples:
- "Variances are explained"
- "Performance is tracked"
- "Analysis is complete"

## Completion Signal (RFC 2119)

Variance report **MUST** exist with root cause analysis for all material deviations, performance trends documented, and corrective actions identified. Auditor **MUST** have **MUST** be verified data accuracy and methodology consistency. Analyst **MUST** have confirmed findings are actionable for the reporting stage.
