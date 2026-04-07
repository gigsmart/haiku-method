---
name: certify
description: Quality sign-off and release readiness assessment
hats: [certifier, reviewer]
review: external
elaboration: autonomous
unit_types: [certification, release-readiness]
inputs:
  - stage: analyze
    discovery: quality-report
  - stage: execute-tests
    output: test-results
  - stage: plan
    discovery: test-strategy
---

# Certify

## Criteria Guidance

Good criteria examples:
- "Certification report confirms all exit criteria from the test strategy are met with evidence for each criterion"
- "Known issues list documents every unresolved defect with risk acceptance rationale signed by the product owner"
- "Release readiness checklist covers functional quality, performance benchmarks, security scan results, and regression status"

Bad criteria examples:
- "Quality is certified"
- "Release is ready"
- "Sign-off is obtained"

## Completion Signal (RFC 2119)

Certification report **MUST** exist with all exit criteria evaluated, known issues documented with risk acceptance, and release readiness assessment complete. Certifier **MUST** have confirmed the product meets the quality bar defined in the test strategy. Reviewer **MUST** have validated the certification evidence and approved or rejected release readiness.
