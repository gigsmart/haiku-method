# Migrate Stage — Elaboration

## Criteria Guidance

### Good criteria — concrete and verifiable

- "Migration scripts are idempotent — re-running produces the same result without duplicating data"
- "Integration tests cover at least: happy path, null handling, encoding edge cases, and constraint violations"
- "Dry-run mode exists and produces a diff report without writing to the target"

### Bad criteria — vague (no clear check)

- "Scripts work"
- "Data is migrated"
- "Tests pass"

