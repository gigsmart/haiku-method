---
name: operations
description: Deployment, monitoring, and operational readiness
hats: [ops-engineer, sre, verifier]
fix_hats: [classifier, ops-engineer, feedback-assessor]
review: auto
elaboration: autonomous
inputs:
  - stage: inception
    discovery: discovery
  - stage: product
    discovery: behavioral-spec
  - stage: development
    output: code
  - stage: development
    discovery: architecture
review-agents-include:
  - stage: development
    agents: [security]
---

# Operations

Deployment, monitoring, and operational readiness.
