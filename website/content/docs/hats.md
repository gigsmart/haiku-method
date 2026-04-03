---
title: The Hat System
description: Understanding the hat-based workflow system
order: 4
---

AI-DLC uses a "hat" metaphor to separate concerns. Each hat represents a distinct mindset, set of responsibilities, and communication style. Hats are organized into **workflows**, with different workflows using different hat combinations depending on the type of work being done.

## Why Hats?

The hat system prevents:

- **Context drift**: Accidentally switching between planning and building
- **Scope creep**: Building features that weren't planned
- **Quality shortcuts**: Skipping review to "just ship it"
- **Role confusion**: Trying to attack and defend code at the same time

By explicitly switching hats, you maintain focus and ensure each phase gets proper attention. Domain research happens during Mob Elaboration (`/ai-dlc:elaborate`), before execution begins.

## Core Hats

These hats form the backbone of the default execution workflow: **Planner -> Builder -> Reviewer**. They are also reused across other workflows.

### Planner

Creates tactical execution plans for upcoming bolts based on unit requirements.

- Reviews the current unit and identifies remaining completion criteria
- Creates a concrete, actionable plan for the next bolt
- Prioritizes high-impact criteria and breaks work into verifiable steps
- Flags potential blockers and suggests fallback approaches
- Saves the plan so the Builder can follow it without ambiguity

### Builder

Implements code to satisfy completion criteria using backpressure as feedback.

- Follows the Planner's plan and works in small, verifiable increments
- Runs backpressure checks (tests, lint, types) after each change
- Treats test failures and lint errors as implementation guidance
- Documents progress and blockers in the scratchpad
- Commits working increments and signals completion or iterates

### Reviewer

Verifies implementation satisfies completion criteria with code review and testing verification.

- Checks each completion criterion individually with programmatic verification
- Runs the full test suite and confirms all new code has corresponding tests
- Reviews code quality, security considerations, and edge case handling
- Provides specific, actionable feedback prioritized by severity
- Makes a clear APPROVE or REQUEST CHANGES decision with rationale

## Hypothesis Hats

Used in the hypothesis workflow for systematic bug investigation: **Observer -> Hypothesizer -> Experimenter -> Analyst**. This workflow applies the scientific method to debugging.

### Observer

Gathers data about a bug through systematic observation without jumping to conclusions.

- Attempts to reproduce the bug and documents exact reproduction steps
- Captures error messages, stack traces, and error codes
- Establishes a timeline of when the bug first appeared
- Reviews application and system logs for correlated errors
- Compiles observations without including conclusions -- data only

### Hypothesizer

Forms testable theories about bug causes based on observations.

- Reviews all Observer data and identifies key symptoms and patterns
- Generates at least three hypotheses covering both obvious and non-obvious causes
- Defines confirmation and refutation criteria for each hypothesis
- Prioritizes hypotheses by likelihood multiplied by ease of testing
- Documents a clear testing plan for the Experimenter

### Experimenter

Tests hypotheses systematically to identify root cause through controlled experiments.

- Designs minimal experiments that isolate a single variable
- Executes experiments following the design exactly and records all observations
- Compares results against confirmation/refutation criteria
- Iterates through hypotheses in priority order until root cause is found
- Returns to Hypothesizer with new data if all hypotheses are refuted

### Analyst

Evaluates experimental results and implements the fix based on confirmed root cause.

- Reviews experimental evidence and confirms the root cause explains all symptoms
- Designs a fix that addresses the root cause, not just symptoms
- Implements the fix with minimal, focused changes
- Adds a regression test that fails before the fix and passes after
- Verifies the original bug is resolved and no regressions are introduced

## TDD Hats

Used in the TDD workflow, which follows the classic Red-Green-Refactor cycle: **Test Writer -> Implementer -> Refactorer**.

### Test Writer

Creates failing tests that define expected behavior before implementation (RED phase).

- Selects one small, testable behavior and writes a test before any implementation
- Uses descriptive test names that read like specifications
- Verifies the test fails for the right reason (missing implementation, not syntax errors)
- Keeps tests focused on a single behavior
- Documents non-obvious test logic so other developers can understand intent

### Implementer

Writes minimal code to make failing tests pass (GREEN phase).

- Reads and understands exactly what the failing test expects
- Writes only enough code to make the test pass -- nothing more
- Resists premature optimization, generalization, and abstraction
- Runs the full test suite to confirm no regressions
- Leaves cleanup to the Refactorer -- ugly but working is the goal

### Refactorer

Improves code quality while keeping tests green (REFACTOR phase).

- Identifies duplication, unclear naming, and opportunities to simplify
- Makes one small change at a time and runs tests after each change
- Renames variables and functions to reveal intent
- Extracts repeated code into functions using appropriate abstractions
- Knows when to stop -- perfection is the enemy of progress

## Adversarial Hats

Used in the adversarial workflow for security-focused development: **Planner -> Builder -> Red Team -> Blue Team -> Reviewer**. The Planner, Builder, and Reviewer hats work the same as in the core workflow; the adversarial hats add an attack-and-defend cycle before final review.

### Red Team

Attempts to break the implementation through security testing and vulnerability discovery.

- Enumerates the attack surface: inputs, API parameters, headers, auth boundaries
- Tests for injection vulnerabilities (SQL injection, XSS, command injection, path traversal)
- Attempts authentication bypass and privilege escalation (horizontal and vertical)
- Checks for information disclosure in errors, logs, and URL parameters
- Documents every finding with severity rating and reproduction steps -- does not fix anything

### Blue Team

Fixes vulnerabilities identified by Red Team with proper security controls and tests.

- Prioritizes findings by severity, addressing Critical and High issues first
- Fixes root causes using secure coding patterns, not just symptoms
- Adds security tests that reproduce each vulnerability (fail before fix, pass after)
- Implements defense in depth with multiple layers of protection
- Re-runs Red Team attacks to verify all previous attacks now fail

## Design Hat

Used in the design workflow: **Planner -> Designer -> Reviewer**. The Planner and Reviewer hats work the same as in the core workflow.

### Designer

Creates visual designs, UI mockups, and user experience flows.

- Clarifies the design problem and identifies user goals and pain points
- Generates multiple design alternatives and presents trade-offs
- Incorporates user feedback and documents design decisions
- Specifies responsive behavior, interaction states, and accessibility requirements
- Creates design specifications referencing named tokens from the project's design system

## Integration Hat

Used for cross-workflow, intent-level validation after all units in an intent are complete.

### Integrator

Final intent-level validation that verifies all units work together on the merged intent branch.

- Confirms the merged intent branch is clean with all unit branches merged
- Runs the full backpressure suite (tests, lint, types) on the combined codebase
- Verifies intent-level success criteria that span multiple units
- Checks cross-unit boundaries, shared state, APIs, and data flows for integration gaps
- Makes a clear ACCEPT or REJECT decision, identifying specific units for rework if needed

## Hat Transitions

Hat transitions depend on the workflow being used. Each workflow defines its own sequence:

- **Core**: Planner -> Builder -> Reviewer
- **Hypothesis**: Observer -> Hypothesizer -> Experimenter -> Analyst
- **TDD**: Test Writer -> Implementer -> Refactorer (repeating per behavior)
- **Adversarial**: Planner -> Builder -> Red Team -> Blue Team -> Reviewer
- **Design**: Planner -> Designer -> Reviewer

Within any workflow, you can transition backward when needed:

- **Builder -> Planner**: When the plan needs revision based on new discoveries
- **Reviewer -> Builder**: When review identifies issues to fix
- **Experimenter -> Hypothesizer**: When all hypotheses are refuted and new theories are needed
- **Analyst -> Observer**: When the fix fails and more data collection is required

The key is making transitions *intentional*. Don't drift -- explicitly switch. See the [Workflows](/docs/workflows) documentation for details on each workflow's full lifecycle.

## Tips for Effective Hat Usage

1. **Announce your hat**: Start each phase by explicitly stating which hat you're wearing
2. **Stay in character**: Resist the urge to jump ahead to building while planning
3. **Trust the process**: Even when you "know" the answer, earlier phases often reveal surprises
4. **Respect the boundaries**: Red Team documents vulnerabilities but does not fix them; Blue Team fixes but does not discover new ones
5. **Let backpressure guide you**: Tests, lint, and types are feedback mechanisms, not obstacles
