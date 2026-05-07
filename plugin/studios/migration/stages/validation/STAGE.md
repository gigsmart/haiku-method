---
name: validation
description: Verify data integrity, functional parity, and performance
hats: [validator, regression-tester, verifier]
fix_hats: [classifier, validator, feedback-assessor]
review: ask
elaboration: autonomous
inputs:
  - stage: migrate
    discovery: migration-artifacts
review-agents-include:
  - stage: mapping
    agents: [accuracy]
---

# Validation

Verify data integrity, functional parity, and performance.
