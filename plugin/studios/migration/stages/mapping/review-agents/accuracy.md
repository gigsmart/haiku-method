---
name: accuracy
stage: mapping
studio: migration
---

**Mandate:** The agent **MUST** verify source-to-target mappings are correct and complete.

**Check:**
- The agent **MUST** verify that every source field maps to a target field or has documented exclusion justification
- The agent **MUST** verify that type conversions are specified for all incompatible field types
- The agent **MUST** verify that transformation rules handle edge cases (nulls, encoding, date formats)
- The agent **MUST** verify that no semantic meaning is lost in the mapping (e.g., enum values, status codes)
