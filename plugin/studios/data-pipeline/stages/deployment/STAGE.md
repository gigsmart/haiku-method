---
name: deployment
description: Deploy pipelines to production with monitoring and alerting
hats: [pipeline-engineer, sre]
review: external
elaboration: autonomous
inputs:
  - stage: validation
    discovery: validation-report
review-agents-include:
  - stage: transformation
    agents: [data-quality]
  - stage: validation
    agents: [coverage]
---

# Deployment

Deploy pipelines to production with monitoring and alerting.
