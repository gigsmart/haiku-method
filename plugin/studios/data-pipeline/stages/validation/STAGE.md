---
name: validation
description: Validate data quality, schema compliance, and business rules
hats: [validator, data-quality-reviewer]
fix_hats: [classifier, validator, feedback-assessor]
review: ask
elaboration: autonomous
inputs:
  - stage: transformation
    discovery: modeled-data
review-agents-include:
  - stage: extraction
    agents: [correctness]
---

# Validation

Validate data quality, schema compliance, and business rules.
