---
name: product
description: Define behavioral specifications and acceptance criteria
hats: [product-owner, specification-writer]
review: [external, ask]
unit_types: [product, backend, frontend]
inputs:
  - stage: inception
    discovery: discovery
  - stage: design
    discovery: design-brief
  - stage: design
    discovery: design-tokens
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

## Completion Signal

Behavioral spec exists with user flows and error scenarios. Data contracts define all API schemas with field types and validation rules. Every acceptance criterion has a testable given/when/then scenario. Product owner has approved scope.
