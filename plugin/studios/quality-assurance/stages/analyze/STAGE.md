---
name: analyze
description: Analyze test results and compute quality metrics
hats: [analyst, statistician]
fix_hats: [analyst, feedback-assessor]
review: ask
elaboration: autonomous
inputs:
  - stage: execute-tests
    output: test-results
  - stage: plan
    discovery: test-strategy
---

# Analyze

Analyze test results and compute quality metrics.
