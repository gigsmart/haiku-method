---
name: data-quality
stage: transformation
studio: data-pipeline
---

**Mandate:** The agent **MUST** verify transformations produce correct, consistent output that matches the target schema.

**Check:**
- The agent **MUST** verify that type conversions handle edge cases (nulls, empty strings, timezone differences, encoding)
- The agent **MUST** verify that business logic transformations match the documented rules exactly
- The agent **MUST** verify that deduplication logic is deterministic and handles all key collision scenarios
- The agent **MUST** verify that referential integrity is maintained across related entities
