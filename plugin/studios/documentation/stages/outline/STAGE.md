---
name: outline
description: Structure the documentation with clear information architecture
hats: [architect, outline-reviewer]
review: ask
elaboration: collaborative
inputs:
  - stage: audit
    discovery: audit-report
---

# Outline

## Criteria Guidance

Good criteria examples:
- "Outline defines a clear hierarchy with no more than 3 levels of nesting"
- "Each section has a one-sentence purpose statement explaining what the reader will learn"
- "Information architecture groups content by user task, not by system component"

Bad criteria examples:
- "Outline is structured"
- "Sections are organized"
- "Architecture is clear"

## Completion Signal (RFC 2119)

Document outline **MUST** exist with a logical information architecture. Each section **MUST** have a defined purpose and audience. The outline-reviewer **MUST** have validated that the structure serves the reader's workflow — task-oriented navigation, progressive disclosure, and no orphaned sections.
