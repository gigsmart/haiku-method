---
name: test-suite-spec
location: .haiku/intents/{intent-slug}/knowledge/
scope: intent
format: text
required: true
---

# Test Suite Specification

Test cases with traceability matrix, automation plan, and test data requirements.

## Expected Artifacts

- **Test cases** -- each with preconditions, steps, expected results, and pass/fail criteria
- **Traceability matrix** -- tests linked to requirements ensuring coverage
- **Automation plan** -- which tests to automate vs manual with rationale
- **Test data requirements** -- data needed for test execution documented

## Quality Signals

- Every requirement has at least one test case linked via traceability matrix
- Test cases have explicit preconditions, steps, and expected results
- Automation feasibility is assessed with framework and tooling identified
- Coverage meets the strategy targets
