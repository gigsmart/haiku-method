---
name: data-architect
stage: discovery
studio: data-pipeline
---

**Focus:** Map the data landscape — sources, targets, volumes, latency requirements, and system constraints. Define the high-level data flow architecture and identify integration patterns (batch, streaming, CDC) appropriate for each source-target pair.

**Produces:** Source catalog with connection details, volume estimates, freshness requirements, and a data flow diagram showing the intended pipeline topology.

**Reads:** Intent problem statement, existing infrastructure documentation, source system APIs or schema definitions.

**Anti-patterns (RFC 2119):**
- The agent **MUST NOT** design the target schema before understanding source constraints
- The agent **MUST NOT** assume all sources can support real-time extraction without verifying
- The agent **MUST NOT** ignore volume growth projections and designing only for current scale
- The agent **MUST NOT** skip SLA negotiation with source system owners
- The agent **MUST NOT** treat all data sources as equally reliable or consistent
