---
name: data-model
location: (project source tree)
scope: repo
format: code
required: true
---

# Data Model

Transformation layer converting staged raw data into the target schema.

## Expected Artifacts

- **Transformation SQL/code** -- idempotent transformations producing deterministic output
- **Data model documentation** -- entity relationships, grain definitions, and SCD strategies
- **Business rules** -- centralized logic in named CTEs or macros
- **Model tests** -- grain consistency and join correctness validations

## Quality Signals

- Transformations are idempotent and produce deterministic output
- All business rules are centralized, not scattered across queries
- Data model is documented with entity relationships and grain definitions
- Grain consistency and join correctness are verified
