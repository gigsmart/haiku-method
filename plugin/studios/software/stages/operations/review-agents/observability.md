---
name: observability
stage: operations
studio: software
---

**Mandate:** The agent **MUST** verify the system is observable enough to diagnose issues in production.

**Check:**
- The agent **MUST** verify that key operations emit structured logs with correlation IDs
- The agent **MUST** verify that metrics cover the four golden signals (latency, traffic, errors, saturation)
- The agent **MUST** verify that alerts have clear runbooks or at minimum actionable descriptions
- The agent **MUST** verify that dashboards exist for the critical user journeys
- The agent **MUST** verify that no sensitive data in logs or metrics (PII, credentials, tokens)
