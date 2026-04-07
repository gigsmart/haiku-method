---
name: risk-coverage
stage: assessment
studio: migration
---

**Mandate:** The agent **MUST** verify all migration risks and dependencies are identified.

**Check:**
- The agent **MUST** verify that every system, data store, and integration in the migration scope is inventoried
- The agent **MUST** verify that dependencies between migrated components are mapped (migration order matters)
- The agent **MUST** verify that risk assessment covers data loss, downtime, and functional regression scenarios
- The agent **MUST** verify that rollback feasibility is assessed for each component
