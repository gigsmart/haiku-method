---
name: assessment
description: Inventory what's being migrated, identify risks and dependencies
hats: [migration-analyst, risk-assessor]
review: auto
unit_types: [assessment]
inputs: []
---

# Assessment

## Criteria Guidance

Good criteria examples:
- "Inventory covers all source tables/services with row counts and dependency mappings"
- "Risk register identifies at least 3 categories (data loss, downtime, compatibility) with severity ratings"
- "Dependency graph shows which systems must migrate in sequence vs. parallel"

Bad criteria examples:
- "Assessment is complete"
- "Risks are documented"
- "Systems are inventoried"

## Completion Signal (RFC 2119)

Migration inventory **MUST** exist with a complete catalog of source artifacts (schemas, services, data stores, integrations). Risk register identifies each risk with severity, likelihood, and mitigation strategy. Dependency graph shows migration ordering constraints and parallel opportunities.
