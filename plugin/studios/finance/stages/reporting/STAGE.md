---
name: reporting
description: Create financial reports and dashboards for stakeholders
hats: [reporter, visualizer]
review: ask
elaboration: autonomous
unit_types: [report, dashboard]
inputs:
  - stage: analysis
    discovery: variance-report
  - stage: budget
    discovery: budget-plan
  - stage: forecast
    discovery: forecast-model
---

# Reporting

## Criteria Guidance

Good criteria examples:
- "Executive summary distills the top 3 financial headlines with supporting data and recommended actions"
- "Dashboard visualizations use consistent scales, labeled axes, and highlight thresholds or targets"
- "Each report section maps to a specific stakeholder audience with appropriate detail level"

Bad criteria examples:
- "Reports are generated"
- "Dashboard looks good"
- "Stakeholders are informed"

## Completion Signal (RFC 2119)

Financial reports exist tailored to each stakeholder audience, dashboards visualize key metrics with trend context, and executive summary highlights material findings with recommendations. Visualizer **MUST** have ensured data presentation is clear and accurate. Reporter **MUST** have confirmed all required disclosures are included.
