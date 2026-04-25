# Operations Stage — Elaboration

## Criteria Guidance

### Good criteria — concrete and verifiable

- "Deployment pipeline runs `terraform plan` in CI and requires approval before `apply`"
- "Runbook covers: service restart, database failover, cache flush, and certificate rotation with step-by-step commands"
- "Alerts fire when error rate exceeds 1% over 5 minutes, with PagerDuty routing"
- "Health check endpoint responds within 5 seconds and verifies database connectivity"

### Bad criteria — vague (no clear check)

- "Deployment is automated"
- "Runbook exists"
- "Monitoring is set up"

