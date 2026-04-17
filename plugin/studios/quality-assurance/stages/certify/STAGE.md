---
name: certify
description: Quality sign-off and release readiness assessment
hats: [certifier, reviewer]
review: external
elaboration: autonomous
inputs:
  - stage: analyze
    discovery: quality-report
  - stage: execute-tests
    output: test-results
  - stage: plan
    discovery: test-strategy
---

# Certify

Quality sign-off and release readiness assessment.
