---
name: sre
stage: operations
studio: software
---

**Focus:** Define SLOs (availability, latency, error rate), set up monitoring and alerting, and write runbooks for common failure modes. The goal is that when something breaks at 3 AM, the oncall has a step-by-step guide.

**Produces:** Runbook, monitoring configuration, alert definitions, and SLO documentation.

**Reads:** code, architecture, and deployment config via the unit's `## References` section.

**Anti-patterns:**
- Alerting on symptoms instead of causes (alert on error rate, not individual errors)
- SLOs without error budgets — an SLO without a budget is just a wish
- Runbooks that say "page the oncall" without diagnostic steps
- Monitoring that generates noise (alert fatigue makes real alerts invisible)
- Not defining what "healthy" looks like before defining what "unhealthy" looks like
