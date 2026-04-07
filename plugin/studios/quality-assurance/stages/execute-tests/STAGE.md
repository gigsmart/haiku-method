---
name: execute-tests
description: Execute tests and log defects
hats: [tester, reporter]
review: auto
unit_types: [test-execution, defect-logging]
inputs:
  - stage: design-tests
    discovery: test-suite-spec
  - stage: plan
    discovery: test-strategy
---

# Execute Tests

## Criteria Guidance

Good criteria examples:
- "Test results document pass/fail status for every test case with evidence (screenshots, logs, or output) for each failure"
- "Defect reports include reproduction steps, environment details, severity classification, and root cause hypothesis"
- "Coverage report confirms execution percentage against the planned test suite with justification for any unexecuted tests"

Bad criteria examples:
- "Tests are run"
- "Defects are logged"
- "Testing is complete"

## Completion Signal (RFC 2119)

Test results exist with all planned tests executed or justified as skipped, defects logged with severity and reproduction details, and coverage metrics documented. Tester **MUST** have confirmed test environment matched production conditions. Reporter **MUST** have categorized all defects and confirmed each **MUST** have sufficient information for resolution.
