---
name: security
description: Threat modeling, security review, and vulnerability assessment
hats: [threat-modeler, red-team, blue-team, security-reviewer]
review: [external, ask]
elaboration: autonomous
inputs:
  - stage: inception
    discovery: discovery
  - stage: product
    discovery: behavioral-spec
  - stage: product
    discovery: data-contracts
  - stage: development
    output: code
  - stage: development
    discovery: architecture
review-agents-include:
  - stage: development
    agents: [security, architecture]
  - stage: operations
    agents: [reliability]
gate-protocol:
  timeout: 72h
  timeout-action: escalate
  escalation: comms
  conditions:
    - "no HIGH findings from review agents"
---

# Security

Threat modeling, security review, and vulnerability assessment.
