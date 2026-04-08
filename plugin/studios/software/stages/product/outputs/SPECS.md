---
name: specs
location: .haiku/intents/{intent-slug}/stages/product/artifacts/
scope: intent
format: text
required: true
---

# Product Specifications

Behavioral specs and data contracts produced by product units. Each unit MUST write its specifications to the intent's `knowledge/` directory.

## Expected Artifacts

- **Behavioral specs** — Given/When/Then scenarios for each user flow
- **Data contracts** — API schemas, request/response shapes, field types
- **Acceptance criteria** — testable conditions for each feature

## Quality Signals

- Every product unit produces at least one spec artifact
- Specs are specific enough to write tests from
- Data contracts include error responses, not just success cases
