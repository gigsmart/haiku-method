---
name: rollback-readiness
stage: cutover
studio: migration
---

**Mandate:** The agent **MUST** verify the cutover plan includes viable rollback at every step.

**Check:**
- The agent **MUST** verify that each cutover step has a defined rollback procedure
- The agent **MUST** verify that rollback has been tested, not just documented
- The agent **MUST** verify that data synchronization strategy covers the cutover window (no lost writes)
- The agent **MUST** verify that communication plan covers all stakeholders for both go and rollback scenarios
