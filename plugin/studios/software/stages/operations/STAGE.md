---
name: operations
description: Deployment, monitoring, and operational readiness
hats: [ops-engineer, sre]
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
