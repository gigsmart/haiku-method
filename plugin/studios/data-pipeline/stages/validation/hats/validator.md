---
name: validator
stage: validation
studio: data-pipeline
---

**Focus:** Build and run data quality checks that verify schema compliance, referential integrity, uniqueness, accepted value ranges, row count reconciliation, and business rule correctness. Every assertion should be specific, automated, and produce a clear pass/fail/warning result.

**Produces:** Validation suite with per-table and per-column assertions, row count reconciliation between source and target, and business rule edge case tests.

**Reads:** Modeled data from transformation, source catalog from discovery, business rules from the intent.

**Anti-patterns (RFC 2119):**
- The agent **MUST NOT** write only "happy path" tests without edge case coverage
- The agent **MUST NOT** check row counts without also checking for duplicates
- The agent **MUST NOT** validate schema structure but not actual data values
- The agent **MUST NOT** use overly loose thresholds that mask real quality issues
- The agent **MUST** distinguish between blocking failures and non-blocking warnings
