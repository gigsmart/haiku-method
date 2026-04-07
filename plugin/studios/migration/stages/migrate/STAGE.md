---
name: migrate
description: Implement migration scripts, adapters, and data transforms
hats: [migration-engineer, integration-tester]
review: ask
elaboration: autonomous
unit_types: [implementation]
inputs:
  - stage: mapping
    discovery: mapping-spec
---

# Migrate

## Criteria Guidance

Good criteria examples:
- "Migration scripts are idempotent — re-running produces the same result without duplicating data"
- "Integration tests cover at least: happy path, null handling, encoding edge cases, and constraint violations"
- "Dry-run mode exists and produces a diff report without writing to the target"

Bad criteria examples:
- "Scripts work"
- "Data is migrated"
- "Tests pass"

## Completion Signal

Migration scripts exist and execute against a non-production target. Each script is idempotent and logged. Integration tests verify row counts, type fidelity, constraint satisfaction, and referential integrity. Dry-run output matches expectations from the mapping spec.
