---
name: migration-artifacts
location: (project source tree)
scope: repo
format: code
required: true
---

# Migration Artifacts

Idempotent migration scripts with integration tests and dry-run capabilities.

## Expected Artifacts

- **Migration scripts** -- idempotent scripts that re-running produces the same result without duplicates
- **Integration tests** -- happy path, null handling, encoding edge cases, and constraint violations
- **Dry-run mode** -- produces a diff report without writing to the target
- **Execution logs** -- each script run is logged with results

## Quality Signals

- Scripts are idempotent and logged
- Integration tests verify row counts, type fidelity, and referential integrity
- Dry-run output matches expectations from the mapping spec
- All mapping spec transformations are implemented
