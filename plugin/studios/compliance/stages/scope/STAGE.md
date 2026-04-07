---
name: scope
description: Define the compliance framework, identify applicable controls, and map to systems
hats: [compliance-analyst, scope-definer]
review: auto
unit_types: [framework-mapping, system-inventory]
inputs: []
---

# Scope

## Criteria Guidance

Good criteria examples:
- "Control mapping identifies all applicable controls from the target framework with justification for any exclusions"
- "System inventory lists every in-scope service, data store, and integration with its data classification"
- "Scope boundary document clearly defines what is in-scope and out-of-scope with rationale for each decision"

Bad criteria examples:
- "Scope is defined"
- "Controls are mapped"
- "Systems are inventoried"

## Completion Signal (RFC 2119)

Control mapping **MUST** exist linking framework requirements to specific systems and owners. System inventory **MUST** be complete with data classification for each asset. Scope boundaries **MUST** be documented with explicit inclusion/exclusion rationale. All applicable regulatory obligations **MUST** be identified and prioritized.
