---
name: behavioral-spec
location: .haiku/intents/{intent-slug}/features/
scope: intent
format: gherkin
required: true
---

# Behavioral Spec

Gherkin `.feature` files defining what the system does from the user's perspective. These files drive development — tests are written to verify these behaviors, and the features themselves can be executed by Cucumber-compatible test runners.

## Content Guide

Each `.feature` file should contain:

- **Feature** — descriptive name and summary of the capability
- **Background** — shared preconditions across scenarios (Given steps common to all)
- **Scenarios** — concrete examples covering:
  - Happy path — the expected successful flow
  - Error scenarios — validation failures, auth errors, not found, server errors
  - Edge cases — boundary conditions, concurrent access, empty states, maximum limits
- **Scenario Outlines** — parameterized scenarios for testing across multiple inputs

## Quality Signals

- Every feature has at least one error scenario, not just the happy path
- Scenarios are specific enough to execute as automated tests
- Actors are named roles, not generic "user"
- Edge cases cover boundaries (zero, one, max, empty, null)
- Steps use domain language consistent with acceptance criteria from the product hat
