---
name: development
description: Implement the library against the API contract from inception
hats: [planner, builder, reviewer]
review: [external, ask]
elaboration: collaborative
unit_types: [backend, fullstack]
inputs:
  - stage: inception
    discovery: discovery
  - stage: inception
    discovery: api-surface
---

# Development

Implement the library against the public API surface defined in inception.
Public API stability is a hard constraint — any change that breaks the
contract requires explicit review and a semver bump. Internal refactoring is
free; public signature changes are not.

## Completion Signal (RFC 2119)

Code **MUST** implement the full API surface from inception. Tests **MUST**
cover the public API and its documented error modes. Any deviation from the
inception contract **MUST** be flagged for review with a semver impact
assessment.
