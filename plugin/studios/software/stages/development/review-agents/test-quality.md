---
name: test-quality
stage: development
studio: software
---

**Mandate:** The agent **MUST** verify tests actually validate behavior, not just exercise code paths.

**Check:**
- The agent **MUST** verify that tests assert on behavior and outcomes, not implementation details
- The agent **MUST** verify that test names describe the scenario and expected result
- The agent **MUST** verify that edge cases from the behavioral spec have corresponding tests
- The agent **MUST** verify that no tests that always pass (tautological assertions, mocked everything)
- The agent **MUST** verify that integration tests cover system boundaries (API, database, external services)
- The agent **MUST** verify that test data is realistic, not minimal placeholder values
