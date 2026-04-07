---
name: track
description: Monitor progress, track risks, and manage issues
hats: [tracker, risk-monitor]
review: auto
elaboration: autonomous
unit_types: [status-tracking, risk-management]
inputs:
  - stage: plan
    discovery: project-plan
---

# Track

## Criteria Guidance

Good criteria examples:
- "Status report shows each work package's planned vs actual progress with variance explanation for any item more than 10% off track"
- "Risk register updates include probability and impact reassessments with triggering conditions for each mitigation action"
- "Issue log documents each issue's root cause, owner, target resolution date, and escalation path"

Bad criteria examples:
- "Progress is tracked"
- "Risks are monitored"
- "Issues are logged"

## Completion Signal (RFC 2119)

Status report **MUST** exist with progress metrics, updated risk register, and issue log. Tracker **MUST** have confirmed all active work packages have current status. Risk-monitor **MUST** have reassessed risk probability and impact based on current project conditions and flagged any risks approaching trigger thresholds.
