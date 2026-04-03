---
name: product
description: Define behavioral specifications and acceptance criteria
hats: [product-owner, specification-writer]
review: [external, ask]
unit_types: [product, backend, frontend]
inputs:
  - stage: inception
    output: discovery
  - stage: design
    output: design-tokens
---

# Product

## product-owner

**Focus:** Define user stories, prioritize features, make scope decisions, and specify acceptance criteria from the user's perspective. Think in terms of what users do and see, not how the system implements it.

**Produces:** Prioritized user stories with acceptance criteria, each testable via a specific scenario.

**Reads:** discovery and design-tokens via the unit's `## References` section.

**Anti-patterns:**
- Writing implementation details instead of user behavior ("use a Redis cache" vs. "page loads in under 2 seconds")
- Skipping edge cases and error scenarios
- Not defining what "done" looks like from the user's perspective
- Prioritizing by implementation ease instead of user value
- Writing acceptance criteria that cannot be verified with a test

## specification-writer

**Focus:** Write behavioral specs (given/when/then), define data contracts (API schemas, database models), and specify API contracts (endpoints, methods, request/response shapes). Precision matters — ambiguity in specs becomes bugs in code.

**Produces:** Behavioral specification and data contracts.

**Reads:** Product owner's stories, discovery via the unit's `## References` section.

**Anti-patterns:**
- Writing specs that describe implementation rather than behavior
- Leaving contracts ambiguous ("returns data" instead of specifying the schema)
- Not specifying error responses alongside success responses
- Defining happy path only without error scenarios
- Using inconsistent naming between spec and data contracts

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
