---
name: development
description: Implement the specification through code
hats: [planner, builder, reviewer]
review: [external, ask]
elaboration: collaborative
inputs:
  - stage: inception
    discovery: discovery
  - stage: design
    discovery: design-brief
  - stage: design
    discovery: design-tokens
  - stage: design
    output: design-artifacts
  - stage: product
    discovery: acceptance-criteria
  - stage: product
    discovery: behavioral-spec
  - stage: product
    discovery: data-contracts
review-agents-include:
  - stage: design
    agents: [consistency, accessibility]
  - stage: product
    agents: [completeness]
---

# Development

## Criteria Guidance

Good criteria examples:
- "All API endpoints return correct status codes for success (200/201), validation errors (400), auth failures (401/403), and not-found (404)"
- "Test coverage is at least 80% for new code, with unit tests for business logic and integration tests for API boundaries"
- "No TypeScript `any` types in new code without a documented justification comment"

Bad criteria examples:
- "API works correctly"
- "Tests are written"
- "Types are correct"

## Completion Signal (RFC 2119)

All completion criteria **MUST** pass verification (tests, lint, typecheck). Code **MUST** be committed to the branch. Reviewer **MUST** have approved. All quality gates **MUST** pass. No high-confidence blocking issues **SHALL** remain.
