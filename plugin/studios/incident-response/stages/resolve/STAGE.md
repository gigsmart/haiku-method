---
name: resolve
description: Implement permanent fix with proper testing and review
hats: [engineer, reviewer]
review: ask
elaboration: autonomous
inputs:
  - stage: mitigate
    discovery: mitigation-log
---

# Resolve

## Criteria Guidance

Good criteria examples:
- "Fix addresses the root cause identified in investigation, not just the symptom the mitigation covered"
- "Test coverage includes a regression test that would have caught this incident before it reached production"
- "Deployment plan includes canary or staged rollout with rollback criteria"

Bad criteria examples:
- "Code is fixed"
- "Tests pass"
- "Deployed to production"

## Completion Signal (RFC 2119)

Permanent fix is implemented and addresses the root cause, not just the symptom. Regression tests exist that would catch this specific failure mode. Code review **MUST** be complete. Deployment plan specifies rollout strategy and monitoring criteria. Resolution summary documents the fix, how it differs from the mitigation, and confirms the mitigation can be safely removed.
