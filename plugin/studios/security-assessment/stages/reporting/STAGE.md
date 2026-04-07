---
name: reporting
description: Formal findings report with severity ratings, reproduction steps, remediation guidance, and executive summary
hats: [report-writer, remediation-advisor]
review: external
elaboration: autonomous
unit_types: [finding, executive-summary, remediation-plan]
inputs:
  - stage: post-exploitation
    discovery: impact-assessment
---

# Reporting

## Criteria Guidance

Good criteria examples:
- "Each finding includes severity rating (CVSS), affected asset, reproduction steps, evidence artifacts, and specific remediation guidance"
- "Executive summary communicates overall risk posture in business terms understandable by non-technical stakeholders"
- "Remediation plan prioritizes fixes by risk-reduction impact and includes both quick wins and strategic improvements"

Bad criteria examples:
- "Report is written"
- "Findings are documented"
- "Remediation is suggested"

## Completion Signal (RFC 2119)

Final report **MUST** exist with executive summary, detailed technical findings, and remediation plan. Each finding **MUST** have a severity rating, reproduction steps, evidence, and specific remediation guidance. Executive summary communicates risk posture in business terms. Remediation plan is prioritized by impact with clear ownership suggestions. Report **MUST** **MUST** have been reviewed for accuracy, completeness, and appropriate classification of sensitive details.
