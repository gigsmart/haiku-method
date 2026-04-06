---
name: transformation
description: Transform and model data for the target schema
hats: [transformer, data-modeler]
review: ask
unit_types: [transformation]
inputs:
  - stage: extraction
    discovery: staged-data
---

# Transformation

## Criteria Guidance

Good criteria examples:
- "Transformation SQL is idempotent — re-running produces the same result without duplicates"
- "Data model follows the agreed dimensional modeling pattern with surrogate keys and SCD type documented per dimension"
- "All business logic (e.g., revenue recognition rules, status mappings) is centralized in named CTEs or macros, not scattered across queries"

Bad criteria examples:
- "Transformations are complete"
- "Data model looks good"
- "Business logic is implemented"

## Completion Signal

Transformation layer converts staged raw data into the target schema. All business rules are implemented and centralized. Data model is documented with entity relationships, grain definitions, and SCD strategies. Transformations are idempotent and produce deterministic output. Data modeler has verified grain consistency and join correctness.
