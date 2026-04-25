---
skip: [design-direction, wireframes]
add: []
wireframe_fidelity: skip
criteria_focus: product
---

# Product Stage — Elaboration

## Criteria Guidance

Product criteria are verified by **behavioral testing** — automated tests (e.g. Cucumber `.feature` scenarios, integration tests, contract tests) that assert the system behaves as specified.

### Good criteria — concrete and verifiable

When generating criteria for this stage, focus on behavioral verification:

- Detailed behavioral specs that describe what the system does, not how it is built
- Acceptance criteria for every user-facing scenario, each expressible as a Given/When/Then test
- Edge cases, error paths, and boundary conditions explicitly covered
- Data contracts, validation rules, and state transitions specified with concrete examples
- Integration points and external dependency behavior documented (with mock or contract-test specifications)
- Behavioral specs precise enough for a developer to implement without follow-up questions

### Bad criteria — vague (no clear check)

- "Works correctly" — under what conditions? With what input?
- "Handles errors" — which errors? What's the expected response?
- "Data is validated" — against which schema? What error format?

### Bad criteria — product-specific unverifiable

(In addition to the universal unverifiable shapes called out in the FSM contracts.)

- "Behavior is intuitive" — needs a usability-test pass with a stated success-rate threshold
- "Coverage is comprehensive across the user-facing capability list" — needs a structural check counting scenarios against the capability list, not a subjective judgment
