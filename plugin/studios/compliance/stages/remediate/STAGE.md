---
name: remediate
description: Implement controls, fix gaps, update configurations and policies
hats: [remediation-engineer, policy-writer]
review: ask
elaboration: autonomous
inputs:
  - stage: assess
    discovery: gap-report
---

# Remediate

## Criteria Guidance

Good criteria examples:
- "Each remediated control has a test or verification procedure confirming it now meets the requirement"
- "Policy documents follow the framework's required structure and cover all mandatory sections"
- "Configuration changes are committed with traceability back to the specific gap they address"

Bad criteria examples:
- "Gaps are fixed"
- "Policies are written"
- "Controls are implemented"

## Completion Signal

All critical and high-risk gaps have remediation implemented with verification evidence. Policies are drafted, reviewed, and mapped to their controlling requirements. Configuration changes are committed with clear references to the gaps they address. A remediation log tracks each gap from identification through resolution with evidence of completion.
