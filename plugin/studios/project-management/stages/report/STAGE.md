---
name: report
description: Create stakeholder updates and project dashboards
hats: [reporter, communicator]
review: ask
elaboration: autonomous
unit_types: [stakeholder-report, dashboard]
inputs:
  - stage: track
    discovery: status-report
  - stage: plan
    discovery: project-plan
  - stage: charter
    discovery: project-charter
---

# Report

## Criteria Guidance

Good criteria examples:
- "Executive dashboard shows project health with red/amber/green indicators backed by quantitative thresholds, not subjective judgment"
- "Stakeholder report tailors detail level to audience — executives get 1-page summary, team leads get work-package detail"
- "Forecast section projects completion based on current velocity, not the original plan"

Bad criteria examples:
- "Report is generated"
- "Dashboard is updated"
- "Stakeholders are informed"

## Completion Signal (RFC 2119)

Project dashboard **MUST** exist with health indicators, progress visualization, and forecast. Reporter **MUST** have confirmed all metrics are current and accurately represent project state. Communicator **MUST** have tailored reports to each stakeholder audience and flagged items requiring stakeholder decisions or escalation.
