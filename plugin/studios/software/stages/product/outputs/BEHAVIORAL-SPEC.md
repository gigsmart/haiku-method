---
name: behavioral-spec
location: .haiku/intents/{intent-slug}/knowledge/BEHAVIORAL-SPEC.md
scope: intent
format: text
required: true
---

# Behavioral Spec

Behavioral specification defining what the system does from the user's perspective. This output drives development — tests are written to verify these behaviors.

## Content Guide

Organize by user flow. For each flow:

- **Title** — descriptive name for the flow
- **Actor** — who performs the action (user role, system, external service)
- **Preconditions** — what must be true before the flow starts
- **Happy path** — Given/When/Then for the expected successful scenario
- **Error scenarios** — Given/When/Then for each error case (validation failure, auth error, not found, server error, etc.)
- **Edge cases** — boundary conditions, concurrent access, empty states, maximum limits
- **Acceptance criteria** — specific, testable conditions that must hold

Cross-reference design tokens and discovery output where relevant (e.g., "error message uses `color-error` token").

## Quality Signals

- Every flow has at least one error scenario, not just the happy path
- Given/When/Then scenarios are specific enough to write a test from
- Actors are named roles, not generic "user"
- Edge cases cover boundaries (zero, one, max, empty, null)
