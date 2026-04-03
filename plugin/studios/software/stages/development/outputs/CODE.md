---
name: code
location: (project source tree)
scope: repo
format: code
required: true
---

# Code

Implementation output — code written directly to the project source tree. This is not a document to be authored; it is the working software that satisfies the unit's completion criteria.

## Content Guide

- **Follow existing project patterns** for file organization, naming conventions, and module boundaries
- **Include appropriate tests** alongside implementation — unit tests for business logic, integration tests for API boundaries
- **Commit working increments** with clear messages describing what changed and why
- **Match the behavioral spec** — the code should implement what the spec describes, not a reinterpretation

## Completion

This output is "complete" when all unit completion criteria pass verification and the reviewer approves. There is no separate document to produce — the code in the repository is the output.

## Quality Signals

- Tests pass and cover the new functionality
- Lint and typecheck pass without suppressions
- Code follows existing project conventions
- Commits are incremental and well-described
