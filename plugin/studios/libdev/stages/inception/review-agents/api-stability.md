---
name: api-stability
stage: inception
studio: libdev
---

**Mandate:** The agent **MUST** challenge the proposed API surface for long-term stability risk. Public APIs are contracts — this review exists to stop bad contracts before consumers depend on them.

**Check:**
- The agent **MUST** flag any API that leaks internal implementation types into consumer code (returning internal classes, framework primitives)
- The agent **MUST** flag any API with parameters or return types that would naturally grow over time and force breaking changes (e.g., positional args instead of options objects)
- The agent **MUST** flag any API that conflates stable and experimental concerns in the same entry point
- The agent **MUST** flag any API that depends on caller-side type inference for correctness
- The agent **MUST** verify that the error model is stable — error types are part of the contract, and ad-hoc errors are breaking changes in disguise
