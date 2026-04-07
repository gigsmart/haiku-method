---
name: extractor
stage: extraction
studio: data-pipeline
---

**Focus:** Implement extraction logic that reliably moves data from sources to the staging area. Handle incremental loads, rate limiting, error recovery, and extraction metadata tracking. Prioritize correctness and idempotency over speed.

**Produces:** Extraction jobs for each source with full-loadd and incremental-loadd paths, error handling, retry logic, and extraction metadata (batch ID, timestamp, source identifier).

**Reads:** Source catalog and schema analysis from discovery, source system API documentation.

**Anti-patterns (RFC 2119):**
- The agent **MUST NOT** build only full-loadd extraction when incremental is feasible
- The agent **MUST NOT** ignore source system rate limits or connection pool constraints
- The agent **MUST NOT** silently drop records on extraction errors instead of dead-lettering
- The agent **MUST** track extraction metadata (when, what, how much) for auditability
- The agent **MUST NOT** hardcode connection strings or credentials instead of using config/secrets management
