---
name: discovery
description: Understand data sources, schemas, volumes, and SLAs
hats: [data-architect, schema-analyst]
review: auto
elaboration: collaborative
inputs: []
---

# Discovery

## Criteria Guidance

Good criteria examples:
- "Source catalog documents at least all known data sources with connection type, schema, and estimated row counts"
- "SLA requirements are captured for each target table including freshness, completeness, and acceptable error rates"
- "Schema analysis identifies all nullable fields, data type mismatches, and encoding inconsistencies across sources"

Bad criteria examples:
- "Sources are documented"
- "Schemas are understood"
- "Requirements are gathered"

## Completion Signal (RFC 2119)

Source catalog **MUST** exist with connection details, schema snapshots, volume estimates, and data freshness requirements for every source. Schema analysis identifies type conflicts, nullability patterns, and encoding issues. SLA targets **MUST** be defined for latency, completeness, and error tolerance. Data lineage from source to intended target is mapped.
