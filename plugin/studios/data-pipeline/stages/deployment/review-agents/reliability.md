---
name: reliability
stage: deployment
studio: data-pipeline
---

**Mandate:** The agent **MUST** verify the deployed pipeline is resilient and observable in production.

**Check:**
- The agent **MUST** verify that failure recovery is defined: retry policies, dead-letter queues, alerting
- The agent **MUST** verify that monitoring covers pipeline health, data freshness, and quality metrics
- The agent **MUST** verify that backfill procedures exist for when historical data needs reprocessing
- The agent **MUST** verify that resource sizing accounts for peak volumes, not just average load
