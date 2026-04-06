---
name: deployment
description: Deploy pipelines to production with monitoring and alerting
hats: [pipeline-engineer, sre]
review: external
unit_types: [deployment]
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

## Criteria Guidance

Good criteria examples:
- "Pipeline DAG is registered in the orchestrator with correct dependencies, retry policies, and SLA-based alerting"
- "Monitoring covers pipeline runtime, row counts per stage, data freshness, and error rates with alerts routed to the on-call channel"
- "Runbook documents manual recovery steps for the 3 most likely failure modes (source unavailable, schema drift, transformation timeout)"

Bad criteria examples:
- "Pipeline is deployed"
- "Monitoring is set up"
- "Documentation exists"

## Completion Signal

Pipeline is deployed to the production orchestrator with correct scheduling, dependencies, and retry policies. Monitoring dashboards show pipeline health, data freshness, and row count trends. Alerting is configured for SLA breaches and pipeline failures. Runbook exists with recovery procedures for common failure scenarios. SRE has verified the deployment meets operational readiness criteria.
