---
name: analyze
description: Analyze test results and compute quality metrics
hats: [analyst, statistician]
review: ask
elaboration: autonomous
unit_types: [results-analysis, quality-metrics]
inputs:
  - stage: execute-tests
    output: test-results
  - stage: plan
    discovery: test-strategy
---

# Analyze

## Criteria Guidance

Good criteria examples:
- "Quality report includes defect density, severity distribution, and trend analysis compared to previous releases"
- "Root cause analysis groups defects into categories (design, code, environment, data) with distribution percentages"
- "Risk assessment maps unresolved defects to business impact with recommendation for release, defer, or block"

Bad criteria examples:
- "Results are analyzed"
- "Metrics are computed"
- "Quality is assessed"

## Completion Signal (RFC 2119)

Quality report **MUST** exist with metrics computed, defect patterns analyzed, and risk assessment complete. Analyst **MUST** have identified systemic quality issues and their root causes. Statistician **MUST** have validated metric calculations and confirmed trend analysis is statistically sound.
