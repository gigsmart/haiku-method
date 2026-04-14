---
name: product
description: Define behavioral specifications and acceptance criteria
hats: [product, specification, validator]
review: [external, ask]
elaboration: collaborative
inputs:
  - stage: inception
    discovery: discovery
  - stage: design
    discovery: design-brief
  - stage: design
    discovery: design-tokens
outputs:
  - discovery: acceptance-criteria
    hat: product
  - discovery: behavioral-spec
    hat: specification
  - discovery: data-contracts
    hat: specification
  - discovery: coverage-mapping
    hat: validator
---

# Product

## Criteria Guidance

Good criteria examples:
- "Behavioral spec covers happy path and at least 3 error scenarios per user flow"
- "Data contracts define request/response schemas with field types, required/optional, and validation rules"
- "Each acceptance criterion is testable with a specific scenario (Given X, When Y, Then Z)"

Bad criteria examples:
- "Specs are written"
- "API is specified"
- "Criteria are clear"

## Completion Signal (RFC 2119)

Acceptance criteria **MUST** cover all user-facing scenarios with edge cases. Behavioral spec `.feature` files **MUST** exist with scenarios for happy paths and error flows. Data contracts **MUST** define all API schemas with field types and validation rules. Validator hat **MUST** have produced an APPROVED coverage mapping with no gaps.
