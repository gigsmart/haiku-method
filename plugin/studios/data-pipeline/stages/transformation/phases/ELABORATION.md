# Transformation Stage — Elaboration

## Criteria Guidance

### Good criteria — concrete and verifiable

- "Transformation SQL is idempotent — re-running produces the same result without duplicates"
- "Data model follows the agreed dimensional modeling pattern with surrogate keys and SCD type documented per dimension"
- "All business logic (e.g., revenue recognition rules, status mappings) is centralized in named CTEs or macros, not scattered across queries"

### Bad criteria — vague (no clear check)

- "Transformations are complete"
- "Data model looks good"
- "Business logic is implemented"

