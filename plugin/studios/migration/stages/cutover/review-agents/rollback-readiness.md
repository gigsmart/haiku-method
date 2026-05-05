---
model: opus
interpretation: lens
---
**Mandate:** The agent **MUST** verify the cutover plan includes viable rollback at every step.

**Check:**
- The agent **MUST** verify that each cutover step has a defined rollback procedure
- The agent **MUST** verify that the rollback procedure references a **prior validation-stage rehearsal record** (the validation stage owns rollback testing; cutover only proceeds if that test passed). If no rehearsal record exists, that's a hard reject — but the fix is to run validation, not to test rollback inside cutover.
- The agent **MUST** verify that data synchronization strategy covers the cutover window (no lost writes)
- The agent **MUST** verify that communication plan covers all stakeholders for both go and rollback scenarios
