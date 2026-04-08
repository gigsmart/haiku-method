---
name: source-catalog
location: .haiku/intents/{intent-slug}/stages/discovery/artifacts/
scope: intent
format: text
required: true
---

# Source Catalog

Comprehensive inventory of data sources with schemas, volumes, and SLA requirements.

## Expected Artifacts

- **Source inventory** -- connection details, schema snapshots, volume estimates, and freshness requirements for every source
- **Schema analysis** -- type conflicts, nullability patterns, and encoding issues across sources
- **SLA targets** -- latency, completeness, and error tolerance defined per target table
- **Data lineage map** -- source-to-target lineage for all intended data flows

## Quality Signals

- Every known source has connection details and schema documented
- SLA requirements are captured with specific thresholds, not vague expectations
- Schema analysis identifies all type mismatches and encoding inconsistencies
- Data lineage is mapped from source through to intended target
