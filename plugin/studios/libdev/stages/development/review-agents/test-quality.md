---
name: test-quality
stage: development
studio: libdev
---

**Mandate:** The agent **MUST** verify tests actually exercise the public API in representative ways.

**Check:**
- The agent **MUST** verify tests call the public API the way consumers would (not through internal backdoors)
- The agent **MUST** verify tests cover each error path declared in the API surface
- The agent **MUST** verify tests cover edge cases for every public entry point (empty inputs, boundary values, type edge cases)
- The agent **MUST** flag tests that are tightly coupled to internal implementation and would break under legitimate refactoring
