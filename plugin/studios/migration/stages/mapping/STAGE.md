---
name: mapping
description: Map source schemas and systems to target, define transformation rules
hats: [schema-mapper, compatibility-reviewer]
review: ask
unit_types: [mapping]
inputs:
  - stage: assessment
    discovery: migration-inventory
---

# Mapping

## Criteria Guidance

Good criteria examples:
- "Every source field maps to a target field with explicit transformation rules (rename, cast, derive, drop)"
- "Incompatible types are listed with chosen resolution strategy and data loss implications"
- "Edge cases document at least: nulls, encoding differences, precision loss, and constraint violations"

Bad criteria examples:
- "Mapping is done"
- "Schemas are compared"
- "Transformations are defined"

## Completion Signal (RFC 2119)

Mapping document **MUST** exist with field-level source-to-target mappings for every entity. Transformation rules are explicit and testable. Compatibility review **MUST** have flagged all type mismatches, constraint differences, and semantic gaps with resolution decisions documented.
