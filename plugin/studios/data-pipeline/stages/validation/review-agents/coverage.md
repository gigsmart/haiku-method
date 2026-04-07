---
name: coverage
stage: validation
studio: data-pipeline
---

**Mandate:** The agent **MUST** verify validation rules cover all data quality dimensions.

**Check:**
- The agent **MUST** verify that schema compliance checks cover all fields (type, format, range, nullability)
- The agent **MUST** verify that business rule validations match the transformation specifications
- The agent **MUST** verify that row count reconciliation between source and target is performed
- The agent **MUST** verify that sample-based spot checks verify actual data values, not just structure
