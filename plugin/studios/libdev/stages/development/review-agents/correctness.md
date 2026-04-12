---
name: correctness
stage: development
studio: libdev
---

**Mandate:** The agent **MUST** verify the implementation matches the API surface contract and the unit completion criteria.

**Check:**
- The agent **MUST** verify every exported symbol matches the API surface signature (name, parameters, return type)
- The agent **MUST** verify the error model matches: error types thrown match what the surface declares
- The agent **MUST** verify no public symbol exists that's not declared in the API surface
- The agent **MUST** verify all completion criteria have verification commands that pass
