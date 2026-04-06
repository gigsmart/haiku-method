---
name: test-suite-spec
location: .haiku/intents/{intent-slug}/knowledge/TEST-SUITE-SPEC.md
scope: intent
format: text
required: true
---

# Test Suite Spec

Test case inventory with requirement traceability and automation plan.

## Content Guide

Structure the spec for efficient test execution:

- **Traceability matrix** -- mapping of test cases to requirements
- **Test cases** -- for each: ID, description, preconditions, steps, expected results, pass/fail criteria
- **Test data requirements** -- data sets needed including boundary conditions and edge cases
- **Automation plan** -- which tests to automate, framework, and tooling requirements
- **Coverage analysis** -- coverage targets vs planned coverage with gap justification
- **Execution priority** -- test execution order based on strategy priorities

## Quality Signals

- Every requirement has at least one associated test case
- Test cases have explicit expected results, not just steps
- Automation candidates are selected based on ROI analysis
- Coverage meets the targets defined in the test strategy
