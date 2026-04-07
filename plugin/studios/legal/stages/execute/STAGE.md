---
name: execute
description: Finalize documents and coordinate signatures
hats: [closer, administrator]
review: await
unit_types: [execution, signature]
inputs:
  - stage: review
    discovery: review-findings
  - stage: draft
    output: draft-document
---

# Execute

## Criteria Guidance

Good criteria examples:
- "Final document incorporates all critical and important review findings with change log documenting each modification"
- "Signature coordination checklist confirms all required signatories, their authority, and execution order"
- "Executed document is stored with complete audit trail including all draft versions and review comments"

Bad criteria examples:
- "Document is signed"
- "Execution is done"
- "Filing is complete"

## Completion Signal (RFC 2119)

Executed document **MUST** exist with all review findings incorporated, signatures obtained from all required parties, and document filed in the appropriate repositories. Closer **MUST** have confirmed all conditions precedent are satisfied. Administrator **MUST** have **MUST** be verified proper execution formalities and document retention.
