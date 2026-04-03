---
name: development
description: Implement the specification through code
hats: [planner, builder, reviewer]
review: ask
unit_types: [backend, frontend, fullstack]
inputs:
  - stage: product
    output: behavioral-spec
  - stage: product
    output: data-contracts
---

# Development

## planner

**Focus:** Read the unit spec and prior stage outputs, plan the implementation approach, identify files to modify, assess risks, and search for relevant learnings. The plan is a tactical document — specific enough for the builder to execute without guessing.

**Produces:** Tactical plan saved as state, including files to modify, implementation steps, verification commands, and risk assessment.

**Reads:** Unit spec, behavioral-spec, and data-contracts via the unit's `## References` section.

**Anti-patterns:**
- Planning without reading the completion criteria
- Copying a previous failed plan without changes
- Not identifying risks or potential blockers up front
- Skipping verification steps in the plan
- Planning more work than can be completed in one bolt

Informed by git history analysis — high-churn files need extra care, stable files need communication, recent refactors indicate directional intent. Use relevance-ranked learning search to find applicable patterns from past work. Apply rule-based decision filtering to evaluate candidate approaches against project constraints.

## builder

**Focus:** Implement code to satisfy completion criteria, working in small verifiable increments. Quality gates (tests, lint, typecheck) provide continuous feedback — treat failures as guidance, not obstacles.

**Produces:** Working code committed to the branch in incremental commits.

**Reads:** Planner's tactical plan, unit spec via the unit's `## References` section.

**Anti-patterns:**
- Building without reading the completion criteria first
- Disabling lint, type checks, or test suites to make code pass
- Continuing past 3 failed attempts without documenting a blocker
- Not committing working increments (large uncommitted changes get lost on context reset)
- Attempting to remove or weaken quality gates

When stuck, apply the node repair operator in order: retry (transient failure, max 2 attempts) then decompose (break into smaller subtasks) then prune (try alternative approach) then escalate (document blocker for human intervention). Never skip levels.

## reviewer

**Focus:** Verify implementation satisfies completion criteria through multi-stage review. Stage 1: spec compliance (does it do what the criteria say?). Stage 2: code quality (is it well-written?). Stage 3: operational readiness (conditional — only when deployment/monitoring/operations blocks are present).

**Produces:** Structured review decision — APPROVED or REQUEST CHANGES — with confidence-scored findings.

**Reads:** Unit criteria, implementation code, quality gate results.

**Anti-patterns:**
- Approving without running verification commands
- Trusting claims ("I tested it") over evidence (actual test output)
- Blocking on low-confidence style issues
- Not checking all three artifact levels: existence, substance, and wiring
- Approving code that lacks tests for new functionality

Apply chain-of-verification (CoVe) for each criterion: form initial judgment, generate verification questions, answer with evidence, revise if needed. For non-trivial units, delegate to specialized review agents (correctness, security, performance, etc.) and consolidate findings.

## Criteria Guidance

Good criteria examples:
- "All API endpoints return correct status codes for success (200/201), validation errors (400), auth failures (401/403), and not-found (404)"
- "Test coverage is at least 80% for new code, with unit tests for business logic and integration tests for API boundaries"
- "No TypeScript `any` types in new code without a documented justification comment"

Bad criteria examples:
- "API works correctly"
- "Tests are written"
- "Types are correct"

## Completion Signal

All completion criteria pass verification (tests, lint, typecheck). Code is committed to the branch. Reviewer has approved. All quality gates pass. No high-confidence blocking issues remain.
