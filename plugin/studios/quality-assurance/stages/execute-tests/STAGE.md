---
name: execute-tests
description: Execute tests and log defects
hats: [tester, reporter, verifier]
fix_hats: [classifier, tester, feedback-assessor]
review: auto
elaboration: autonomous
inputs:
  - stage: design-tests
    discovery: test-suite-spec
  - stage: plan
    discovery: test-strategy
---

# Execute Tests

Execute tests and log defects.
