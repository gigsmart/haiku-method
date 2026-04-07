---
name: correctness
stage: development
studio: software
---

**Mandate:** The agent **MUST** verify the implementation correctly satisfies the behavioral specification and completion criteria.

**Check:**
- The agent **MUST** verify that all acceptance criteria from the behavioral spec are implemented, not approximated
- The agent **MUST** verify that error handling covers the specified error states, not just the happy path
- The agent **MUST** verify that data validation matches the data contracts exactly (types, nullability, ranges)
- The agent **MUST** verify that no logic errors, off-by-one mistakes, or silent failures
- The agent **MUST** verify that edge cases specified in the product stage are handled
