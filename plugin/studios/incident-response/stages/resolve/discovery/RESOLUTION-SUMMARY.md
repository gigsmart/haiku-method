---
name: resolution-summary
location: .haiku/intents/{intent-slug}/knowledge/RESOLUTION-SUMMARY.md
scope: intent
format: text
required: true
---

# Resolution Summary

Record of the permanent fix, its testing, and deployment. This output feeds the postmortem stage with the technical closure needed for a complete incident narrative.

## Content Guide

Document the permanent resolution:

- **Fix description** — what was changed and why, with references to specific code, configuration, or infrastructure changes
- **Root cause addressed** — how the fix prevents the specific root cause from recurring
- **Difference from mitigation** — how the permanent fix differs from the temporary mitigation and why the mitigation alone was insufficient
- **Regression tests** — tests added that would catch this failure mode, with evidence they fail without the fix
- **Deployment details** — rollout strategy, monitoring criteria, and rollback plan
- **Mitigation cleanup** — status of removing temporary mitigations (completed, scheduled, or blocked)
- **Related improvements** — any additional hardening or defensive changes made alongside the primary fix

## Quality Signals

- Fix addresses the root cause, not just the symptom that triggered the incident
- Regression tests are specific to this failure mode, not generic
- Deployment plan reflects the risk level — not just "merge and deploy"
- Mitigation cleanup has a clear timeline and owner
