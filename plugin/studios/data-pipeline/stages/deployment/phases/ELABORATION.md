# Deployment Stage — Elaboration

## Criteria Guidance

### Good criteria — concrete and verifiable

- "Pipeline DAG is registered in the orchestrator with correct dependencies, retry policies, and SLA-based alerting"
- "Monitoring covers pipeline runtime, row counts per stage, data freshness, and error rates with alerts routed to the on-call channel"
- "Runbook documents manual recovery steps for the 3 most likely failure modes (source unavailable, schema drift, transformation timeout)"

### Bad criteria — vague (no clear check)

- "Pipeline is deployed"
- "Monitoring is set up"
- "Documentation exists"

