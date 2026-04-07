---
name: findings-report
location: .haiku/intents/{intent-slug}/knowledge/
scope: intent
format: text
required: true
---

# Findings Report

Formal security assessment report with severity ratings, reproduction steps, and remediation plan.

## Expected Artifacts

- **Executive summary** -- overall risk posture in business terms for non-technical stakeholders
- **Technical findings** -- each with severity (CVSS), affected asset, reproduction steps, and evidence
- **Remediation plan** -- prioritized by risk-reduction impact with quick wins and strategic improvements
- **Remediation guidance** -- specific fix recommendations per finding with ownership suggestions

## Quality Signals

- Each finding has severity rating, reproduction steps, evidence, and remediation guidance
- Executive summary communicates risk in business terms
- Remediation plan is prioritized by impact with clear ownership suggestions
- Report is reviewed for accuracy and appropriate classification of sensitive details
