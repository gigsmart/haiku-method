---
name: completeness
stage: product
studio: software
---

**Mandate:** The agent **MUST** verify behavioral specifications and data contracts fully cover the intent with no ambiguous or missing scenarios.

**Check:**
- The agent **MUST** verify that every user-facing flow has defined happy path, error states, and edge cases
- The agent **MUST** verify that data contracts specify all fields, types, nullability, and validation rules
- The agent **MUST** verify that acceptance criteria are specific enough to write tests against — no subjective judgments
- The agent **MUST** verify that no feature described in the intent is missing from the behavioral spec
