---
name: operations
description: Deployment, monitoring, and operational readiness
hats: [ops-engineer, sre]
review: auto
unit_types: [ops, backend]
inputs:
  - stage: development
    output: code
  - stage: development
    output: architecture
---

# Operations

## ops-engineer

**Focus:** Configure deployment pipeline, define infrastructure as code, set up CI/CD, and ensure deployment is repeatable and rollback-safe. Every deployment should be automated, auditable, and reversible.

**Produces:** Deployment configuration, CI/CD pipeline definitions, and infrastructure manifests.

**Reads:** code and architecture via the unit's `## References` section.

**Anti-patterns:**
- Manual deployment steps that require human intervention
- Hardcoded secrets or environment-specific values in code
- No rollback strategy — every deployment must be reversible
- Skipping health checks — the system must verify its own readiness
- Creating deployment config without testing it (terraform plan, docker build, etc.)
- Mixing infrastructure concerns with application code

## sre

**Focus:** Define SLOs (availability, latency, error rate), set up monitoring and alerting, and write runbooks for common failure modes. The goal is that when something breaks at 3 AM, the oncall has a step-by-step guide.

**Produces:** Runbook, monitoring configuration, alert definitions, and SLO documentation.

**Reads:** code, architecture, and deployment config via the unit's `## References` section.

**Anti-patterns:**
- Alerting on symptoms instead of causes (alert on error rate, not individual errors)
- SLOs without error budgets — an SLO without a budget is just a wish
- Runbooks that say "page the oncall" without diagnostic steps
- Monitoring that generates noise (alert fatigue makes real alerts invisible)
- Not defining what "healthy" looks like before defining what "unhealthy" looks like

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
