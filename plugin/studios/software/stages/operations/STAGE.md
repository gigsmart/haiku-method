---
name: operations
description: Deployment, monitoring, and operational readiness
hats: [ops-engineer, sre]
review: auto
elaboration: autonomous
unit_types: [ops]
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

## Criteria Guidance

Good criteria examples:
- "Deployment pipeline runs `terraform plan` in CI and requires approval before `apply`"
- "Runbook covers: service restart, database failover, cache flush, and certificate rotation with step-by-step commands"
- "Alerts fire when error rate exceeds 1% over 5 minutes, with PagerDuty routing"
- "Health check endpoint responds within 5 seconds and verifies database connectivity"

Bad criteria examples:
- "Deployment is automated"
- "Runbook exists"
- "Monitoring is set up"

## Completion Signal (RFC 2119)

Deployment pipeline **MUST** be defined and validated (builds, plans, and applies successfully). Monitoring **MUST** cover key metrics (latency, error rate, throughput). Runbook **MUST** exist for common failure modes with step-by-step remediation commands. SLOs **MUST** be defined with alert thresholds and error budgets.
