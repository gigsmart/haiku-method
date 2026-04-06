---
name: operations
description: Deployment, monitoring, and operational readiness
hats: [ops-engineer, sre]
review: auto
unit_types: [ops, backend]
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

## Completion Signal

Deployment pipeline defined and validated (builds, plans, and applies successfully). Monitoring covers key metrics (latency, error rate, throughput). Runbook exists for common failure modes with step-by-step remediation commands. SLOs defined with alert thresholds and error budgets.
