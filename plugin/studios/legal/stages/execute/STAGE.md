---
name: execute
description: Finalize documents and coordinate signatures
hats: [closer, administrator, verifier]
fix_hats: [classifier, closer, feedback-assessor]
review: await
elaboration: autonomous
inputs:
  - stage: review
    discovery: review-findings
  - stage: draft
    output: draft-document
---

# Execute

Finalize documents and coordinate signatures.
