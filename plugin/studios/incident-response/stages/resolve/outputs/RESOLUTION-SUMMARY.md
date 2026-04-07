---
name: resolution-summary
location: .haiku/intents/{intent-slug}/knowledge/
scope: intent
format: text
required: true
---

# Resolution Summary

Permanent fix documentation with regression tests and deployment plan.

## Expected Artifacts

- **Fix description** -- how the permanent fix addresses root cause, not just the symptom
- **Regression tests** -- tests that would catch this specific failure mode
- **Deployment plan** -- rollout strategy with monitoring criteria
- **Mitigation removal** -- confirmation that the temporary mitigation can be safely removed

## Quality Signals

- Fix addresses the root cause, not just the symptom the mitigation covered
- Regression tests exist that would have caught this incident
- Deployment plan includes canary or staged rollout with rollback criteria
- Code review is complete before deployment
