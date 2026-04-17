# Transformation Stage — Elaboration

## Criteria Guidance

Good criteria examples:
- "Transformation SQL is idempotent — re-running produces the same result without duplicates"
- "Data model follows the agreed dimensional modeling pattern with surrogate keys and SCD type documented per dimension"
- "All business logic (e.g., revenue recognition rules, status mappings) is centralized in named CTEs or macros, not scattered across queries"

Bad criteria examples:
- "Transformations are complete"
- "Data model looks good"
- "Business logic is implemented"
