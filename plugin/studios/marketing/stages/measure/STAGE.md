---
name: measure
description: Track KPIs, analyze performance, and generate insights and recommendations
hats: [analyst, report-writer]
review: auto
unit_types: [analysis, report]
inputs:
  - stage: launch
    discovery: campaign-log
---

# Measure

## Criteria Guidance

Good criteria examples:
- "Performance report compares actual KPIs against campaign goals with variance analysis"
- "Channel-level breakdown identifies top and bottom performers with specific metrics"
- "Recommendations are data-backed with projected impact if implemented"

Bad criteria examples:
- "Metrics are reported"
- "Performance is analyzed"
- "Recommendations are provided"

## Completion Signal (RFC 2119)

Performance report **MUST** exist with KPI actuals vs. targets, channel-level breakdown, and audience segment analysis. Analyst **MUST** have identified what worked, what didn't, and why. Report writer **MUST** have packaged findings into actionable recommendations with prioritization for future campaigns.
