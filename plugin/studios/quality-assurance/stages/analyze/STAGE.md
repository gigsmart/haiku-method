---
name: analyze
description: Analyze test results and compute quality metrics
hats: [analyst, statistician, verifier]
fix_hats: [classifier, analyst, feedback-assessor]
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
