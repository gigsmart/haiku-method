---
name: migration-inventory
location: .haiku/intents/{intent-slug}/stages/assessment/artifacts/
scope: intent
format: text
required: true
---

# Migration Inventory

Complete catalog of source artifacts with risk register and dependency graph.

## Expected Artifacts

- **Source catalog** -- all schemas, services, data stores, and integrations to be migrated
- **Risk register** -- risks categorized by type (data loss, downtime, compatibility) with severity ratings
- **Dependency graph** -- migration ordering constraints and parallel opportunities
- **Volume estimates** -- row counts and data sizes for each source artifact

## Quality Signals

- Inventory covers all source artifacts with no undiscovered systems
- Risk register identifies at least 3 categories with severity and mitigation strategies
- Dependency graph shows which systems must migrate in sequence vs parallel
- Each risk has a mitigation strategy documented
