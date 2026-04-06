---
name: migration-artifacts
location: .haiku/intents/{intent-slug}/knowledge/MIGRATION-ARTIFACTS.md
scope: intent
format: text
required: true
---

# Migration Artifacts

Document the implemented migration scripts, adapters, and test results. This output feeds the validation stage for integrity verification.

## Content Guide

Structure the artifacts around the implementation:

- **Script inventory** — list of migration scripts with purpose, execution order, and dependencies
- **Adapter documentation** — data adapters and transformation logic with interface contracts
- **Dry-run results** — output from executing scripts in dry-run mode against representative data
- **Integration test results** — test coverage summary with pass/fail for happy path, edge cases, and failure scenarios
- **Idempotency verification** — evidence that re-running scripts produces consistent results
- **Execution plan** — recommended order, parallelism, and checkpointing strategy
- **Known limitations** — any gaps between the mapping spec and what was implemented, with rationale

## Quality Signals

- Every script is idempotent and produces execution logs
- Dry-run mode exists and its output matches expectations from the mapping spec
- Integration tests cover happy path, nulls, encoding, constraints, and failure recovery
- No script hardcodes environment-specific values
