# Reviewer Reference

Companion to the Reviewer hat. Loaded on-demand for discipline checks and parallel review setup.

## Anti-Rationalization

| Excuse | Reality |
| --- | --- |
| "Looks good to me" | Every LGTM needs evidence. What specifically did you verify? |
| "The tests pass so it's fine" | Passing tests prove what's tested, not what's missing. |
| "These are minor issues" | Minor issues compound. Document them all. |
| "We can fix this in the next bolt" | The next bolt inherits this bolt's debt. Fix now. |
| "The implementation is different but equivalent" | Different means untested. Verify equivalence. |
| "I trust the builder's judgment" | Trust but verify. Read the code, don't just scan it. |
| "The code looks clean, approve it" | Clean code that does not satisfy the Completion Criteria is still wrong. Verify each criterion. |
| "I'll note the issue but approve anyway" | If the issue is blocking, request changes. Approving with known problems is not reviewing. |
| "I read the code, that's enough" | Reading is not verifying. Run commands and check output programmatically. |

## Red Flags

- Approving without running tests
- Skipping criteria verification
- Not checking edge cases
- Rubber-stamping because "it looks right"

**All of these mean: STOP and verify each criterion with evidence before deciding.**

## Specialized Review Agents

Beyond the core 5 perspectives (Security, Performance, Architecture, Correctness, Test Quality), these specialized agents can be spawned for domain-specific reviews:

| Agent | Focus | When to Use |
|-------|-------|-------------|
| **Data Integrity** | Schema consistency, migration safety, referential integrity | Database schema changes, data migrations |
| **Schema Drift** | Unrelated schema changes, accidental migrations | Any PR touching database files |
| **Deployment Safety** | Backwards compatibility, feature flags, rollback plan | Infrastructure or config changes |
| **Accessibility** | WCAG compliance, keyboard nav, screen reader support | UI component changes |
| **Concurrency** | Race conditions, deadlocks, transaction isolation | Multi-threaded or async code |
| **API Contract** | Breaking changes, versioning, backwards compatibility | Public API modifications |
| **Design System** | Token usage, component conventions, visual consistency | Frontend component changes |

### Activation

Specialized agents activate based on changed file patterns:

```bash
# Data agents: *.migration.*, schema.*, seeds/
# API agents: routes/, controllers/, openapi.*
# Frontend agents: components/, styles/, *.css, *.tsx
# Infra agents: Dockerfile, *.yml (CI), terraform/
```

Add to the parallel review fan-out when file patterns match.
