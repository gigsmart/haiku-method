---
name: severity-accuracy
stage: triage
studio: incident-response
---

**Mandate:** The agent **MUST** verify severity classification and blast radius assessment are accurate.

**Check:**
- The agent **MUST** verify that severity level matches the observed impact (users affected, data at risk, revenue impact)
- The agent **MUST** verify that blast radius assessment accounts for downstream dependencies, not just the failing component
- The agent **MUST** verify that escalation path is appropriate for the severity level
- The agent **MUST** verify that no under-classification to avoid process overhead
