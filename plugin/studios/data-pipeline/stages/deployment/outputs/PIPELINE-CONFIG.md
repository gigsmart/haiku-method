---
name: pipeline-config
location: (project source tree)
scope: repo
format: code
required: true
---

# Pipeline Configuration

Production pipeline deployment with monitoring, alerting, and runbook.

## Expected Artifacts

- **Pipeline DAG** -- registered in orchestrator with dependencies, retry policies, and SLA-based alerting
- **Monitoring setup** -- runtime, row counts, data freshness, and error rate tracking with alert routing
- **Runbook** -- manual recovery steps for the most likely failure modes
- **Deployment verification** -- confirmation that pipeline runs successfully in production

## Quality Signals

- Pipeline DAG has correct dependencies and retry policies
- Monitoring covers all critical pipeline health metrics
- Runbook documents recovery for at least 3 failure scenarios
- Alerts route to the correct on-call channel
