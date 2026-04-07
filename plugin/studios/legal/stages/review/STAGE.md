---
name: review
description: Conduct legal review and compliance check
hats: [reviewer, compliance-officer]
review: external
unit_types: [legal-review, compliance-check]
inputs:
  - stage: draft
    output: draft-document
  - stage: research
    discovery: research-memo
  - stage: intake
    discovery: legal-brief
---

# Review

## Criteria Guidance

Good criteria examples:
- "Review findings document categorizes each issue as critical (must fix), important (should fix), or advisory (consider)"
- "Compliance check maps each regulatory requirement to the specific draft provision that satisfies it, with gap analysis"
- "Risk opinion quantifies residual risk for each identified exposure with recommended acceptance or mitigation"

Bad criteria examples:
- "Review is complete"
- "Document is compliant"
- "Issues are noted"

## Completion Signal (RFC 2119)

Review findings exist with all issues categorized by severity, compliance gaps identified with remediation recommendations, and residual risk opinion documented. Reviewer **MUST** have confirmed the document achieves the stated legal objectives. Compliance-officer **MUST** have **MUST** be verified regulatory alignment across all applicable jurisdictions.
