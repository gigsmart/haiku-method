---
name: migration-inventory
location: .haiku/intents/{intent-slug}/knowledge/MIGRATION-INVENTORY.md
scope: intent
format: text
required: true
---

# Migration Inventory

Document the complete catalog of artifacts in scope for migration. This output feeds the mapping stage as its foundational context.

## Content Guide

Structure the inventory around the migration scope:

- **Source system overview** — platform, version, architecture summary
- **Artifact catalog** — schemas, tables, services, jobs, integrations with size/volume estimates
- **Dependency graph** — which artifacts depend on which, migration ordering constraints
- **Risk register** — categorized risks with severity, likelihood, and mitigation strategies
- **Data volume estimates** — row counts, storage sizes, growth rates
- **Downstream consumers** — systems that read from or depend on the source
- **Migration ordering constraints** — what must move first, what can move in parallel

## Quality Signals

- Every artifact is accounted for, including ancillary systems (caches, queues, cron jobs)
- Dependencies are verified against the live system, not just documentation
- Risks have concrete mitigations, not just descriptions
- Volume estimates inform the migration strategy (bulk vs. incremental vs. streaming)
