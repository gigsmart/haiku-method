---
name: data-integrity
stage: migrate
studio: migration
---

**Mandate:** The agent **MUST** verify migration scripts preserve data integrity.

**Check:**
- The agent **MUST** verify that row counts reconcile between source and target
- The agent **MUST** verify that foreign key relationships are maintained after migration
- The agent **MUST** verify that no data truncation from field size differences
- The agent **MUST** verify that idempotency: running the migration twice does not corrupt data
- The agent **MUST** verify that error handling captures and reports failed records without halting the entire migration
