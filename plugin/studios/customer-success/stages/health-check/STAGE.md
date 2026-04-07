---
name: health-check
description: Monitor account health, identify risks, and create action plans
hats: [health-monitor, risk-analyst]
review: ask
elaboration: autonomous
unit_types: [health-assessment, risk-mitigation]
inputs:
  - stage: adoption
    discovery: usage-report
---

# Health Check

## Criteria Guidance

Good criteria examples:
- "Health scorecard rates account across at least 5 dimensions (usage, engagement, support sentiment, stakeholder access, contract alignment) with evidence for each rating"
- "Risk assessment identifies specific churn indicators with severity levels and mitigation timelines"
- "Action plan includes owner assignments and measurable success criteria for each remediation item"

Bad criteria examples:
- "Account health is assessed"
- "Risks are identified"
- "Action plan exists"

## Completion Signal (RFC 2119)

Health report **MUST** exist with a scored health assessment across multiple dimensions. Risk analyst **MUST** have identified and severity-ranked all churn risks with specific leading indicators. Each risk **MUST** have a concrete mitigation plan with success criteria. Escalation paths **MUST** be documented for critical risks. Report provides a clear recommendation: healthy, at-risk, or critical.
