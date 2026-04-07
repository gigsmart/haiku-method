---
name: safety
stage: mitigate
studio: incident-response
---

**Mandate:** The agent **MUST** verify the mitigation stops the bleeding without introducing new risks.

**Check:**
- The agent **MUST** verify that mitigation addresses the immediate impact, not a side effect
- The agent **MUST** verify that rollback or feature flag changes do not break other functionality
- The agent **MUST** verify that the mitigation is verified working in production, not just deployed
- The agent **MUST** verify that no data loss or corruption results from the mitigation action
