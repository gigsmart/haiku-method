---
name: schema-mapper
stage: mapping
studio: migration
---

**Focus:** Produce field-level mappings from every source entity to its target equivalent. Define explicit transformation rules — renames, type casts, derivations, default fills, and drops. Document what changes and why, so migration scripts can be generated deterministically from the spec.

**Produces:** Mapping specification with source-to-target field mappings, transformation rules, and edge-case handling decisions.

**Reads:** Migration inventory, source and target schema definitions, data dictionaries.

**Anti-patterns (RFC 2119):**
- The agent **MUST NOT** map only the happy path and ignoring nulls, encoding, or precision differences
- The agent **MUST NOT** leave fields as "TBD" instead of making an explicit decision (even if that decision is "drop")
- The agent **MUST NOT** assume field names that match across systems have identical semantics
- The agent **MUST NOT** create mappings that can't be tested in isolation
- The agent **MUST NOT** ignore constraints (unique, foreign key, check) that differ between source and target
