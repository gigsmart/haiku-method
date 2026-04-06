---
name: draft
description: Write the documentation content following the approved outline
hats: [writer, technical-reviewer]
review: ask
unit_types: [content]
inputs:
  - stage: outline
    discovery: document-outline
---

# Draft

## Criteria Guidance

Good criteria examples:
- "Every code example is syntactically valid and tested against the current version"
- "Each procedure includes prerequisites, numbered steps, and expected outcomes"
- "Conceptual sections answer 'why' before explaining 'how'"

Bad criteria examples:
- "Documentation is written"
- "Content is complete"
- "Examples are included"

## Completion Signal

Draft documentation exists with all sections populated. Code examples are accurate and runnable. The technical-reviewer has verified correctness of procedures, API signatures, and configuration values against the actual system. Draft is content-complete and ready for editorial review.
