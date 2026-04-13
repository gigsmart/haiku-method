---
name: design-tests
description: Design test cases and plan automation
hats: [designer, automator]
review: auto
elaboration: autonomous
inputs:
  - stage: plan
    discovery: test-strategy
---

# Design Tests

## Criteria Guidance

Good criteria examples:
- "Test suite spec includes test cases for every requirement with traceability matrix linking tests to requirements"
- "Each test case has explicit preconditions, steps, expected results, and pass/fail criteria"
- "Automation feasibility assessment identifies which tests to automate, which to run manually, and the rationale"

Bad criteria examples:
- "Test cases are designed"
- "Automation is planned"
- "Tests are ready"

## Completion Signal (RFC 2119)

Test suite spec **MUST** exist with test cases traceable to requirements, automation plan defined, and test data requirements documented. Designer **MUST** have confirmed coverage meets the strategy targets. Automator **MUST** have validated automation feasibility and identified framework and tooling requirements.
