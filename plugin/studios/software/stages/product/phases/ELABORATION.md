---
skip: [design-direction, wireframes]
add: []
wireframe_fidelity: skip
criteria_focus: product
---

# Product Stage — Elaboration

## Criteria Guidance

Every acceptance criterion **MUST** be paired with a command or condition that proves it. Product criteria are verified by **behavioral testing** — automated tests (e.g. Cucumber `.feature` scenarios, integration tests, contract tests) that assert the system behaves as specified. The FSM rejects prose-only criteria; if a criterion can't be expressed as a behavioral test scenario or a structural check, it's a spec gap — surface it via `ask_user_visual_question`, do not paper over with prose.

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

### Bad criteria — specific but unverifiable

- "Behavior is intuitive" — needs a usability-test pass with a stated success-rate threshold
- "Performance is acceptable" — needs a numeric threshold AND a measurement command (e.g. `p95 latency < 200ms`)
- "Error messages are user-friendly" — needs a UX-review pass or a literal allow-list of acceptable phrasings
- "Coverage is comprehensive" — needs a structural check counting scenarios against the user-facing capability list, not a subjective judgment
