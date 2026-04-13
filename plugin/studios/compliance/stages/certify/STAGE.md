---
name: certify
description: Prepare for and support external audit, address findings
hats: [audit-liaison, finding-resolver]
review: [external, await]
elaboration: autonomous
inputs:
  - stage: document
    discovery: evidence-package
review-agents-include:
  - stage: assess
    agents: [thoroughness]
  - stage: remediate
    agents: [effectiveness]
---

# Certify

## Criteria Guidance

Good criteria examples:
- "Audit readiness checklist confirms all evidence is current, accessible, and mapped to the auditor's request list"
- "Each auditor finding has a documented response with remediation evidence or a justified exception"
- "Finding resolution includes root cause analysis to prevent recurrence, not just a fix for the immediate gap"

Bad criteria examples:
- "Audit is prepared for"
- "Findings are resolved"
- "Certification is obtained"

## Completion Signal (RFC 2119)

Audit preparation package **MUST** be complete with all evidence organized per the auditor's request format. Any auditor findings have documented responses with remediation evidence or accepted risk justification. All finding resolutions include root cause analysis. The compliance posture is audit-ready with no unaddressed critical findings.
