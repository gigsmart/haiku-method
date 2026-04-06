---
name: test-results
location: .haiku/intents/{intent-slug}/stages/execute-tests/artifacts/
scope: intent
format: text
required: true
---

# Test Results

Test execution results with evidence, defect reports, and coverage metrics.

## Content Guide

- **Execution summary** -- pass/fail/skip counts with overall coverage percentage
- **Test results** -- each test case with status and evidence (screenshots, logs for failures)
- **Defect reports** -- each defect with reproduction steps, environment, severity, and root cause hypothesis
- **Blocked tests** -- tests that could not be executed with reasons and impact assessment
- **Coverage metrics** -- execution percentage against planned suite with gap justification
- **Environment record** -- test environment configuration confirming production fidelity

## Quality Signals

- All planned tests are accounted for (pass, fail, skip, blocked)
- Failures include evidence sufficient for defect reproduction
- Defect reports have reproduction steps, severity, and environment details
- Coverage metrics are accurate against the planned test suite
