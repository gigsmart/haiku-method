---
name: correctness
stage: extraction
studio: data-pipeline
---

**Mandate:** The agent **MUST** verify extraction logic faithfully captures source data without loss or corruption.

**Check:**
- The agent **MUST** verify that all fields from the source schema are accounted for (extracted or explicitly excluded with justification)
- The agent **MUST** verify that incremental extraction handles late-arriving data and schema evolution
- The agent **MUST** verify that error handling covers connection failures, timeouts, and malformed records
- The agent **MUST** verify that extraction does not impose excessive load on source systems
