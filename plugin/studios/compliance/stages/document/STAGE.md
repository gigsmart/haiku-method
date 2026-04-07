---
name: document
description: Create evidence packages, audit trails, and compliance documentation
hats: [evidence-collector, documentation-writer]
review: ask
elaboration: autonomous
unit_types: [evidence, documentation, audit-trail]
inputs:
  - stage: remediate
    discovery: remediation-log
---

# Document

## Criteria Guidance

Good criteria examples:
- "Evidence package includes at least one artifact per control demonstrating implementation with timestamps and provenance"
- "Audit trail links every control to its scope definition, assessment finding, remediation action, and verification evidence"
- "Documentation follows the framework's required format and is organized for efficient auditor navigation"

Bad criteria examples:
- "Evidence is collected"
- "Documentation is complete"
- "Audit trail exists"

## Completion Signal (RFC 2119)

Evidence package **MUST** exist with artifacts mapped to every in-scope control. Each piece of evidence **MUST** have clear provenance (source, date, collector). Audit trail connects scope through assessment, remediation, and verification in a continuous chain. Documentation is organized for external auditor consumption with a clear index and cross-references.
