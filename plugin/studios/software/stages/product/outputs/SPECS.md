---
name: specs
location: .haiku/intents/{intent-slug}/
scope: intent
format: mixed
required: true
---

# Product Specifications

Behavioral specs and data contracts produced by product units. The specification hat writes `.feature` files in Gherkin syntax; the product hat writes acceptance criteria documents.

## Expected Artifacts

- **Behavioral specs** — `.feature` files with Gherkin scenarios (Feature/Scenario/Given/When/Then)
- **Data contracts** — API schemas, request/response shapes, field types
- **Acceptance criteria** — testable conditions for each feature, structured by variability dimension

## Quality Signals

- Every product unit produces at least one spec artifact
- Behavioral specs are valid Gherkin syntax executable by a Cucumber-compatible runner
- Data contracts include error responses, not just success cases
