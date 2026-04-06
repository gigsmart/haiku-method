---
name: design-tests
description: Design test cases and plan automation
hats: [designer, automator]
review: auto
unit_types: [test-design, automation-plan]
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

## Completion Signal

Test suite spec exists with test cases traceable to requirements, automation plan defined, and test data requirements documented. Designer has confirmed coverage meets the strategy targets. Automator has validated automation feasibility and identified framework and tooling requirements.
