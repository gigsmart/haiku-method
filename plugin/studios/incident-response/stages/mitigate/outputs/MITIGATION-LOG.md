---
name: mitigation-log
location: .haiku/intents/{intent-slug}/stages/mitigate/artifacts/
scope: intent
format: text
required: true
---

# Mitigation Log

Record of immediate actions taken to stop user-facing impact.

## Expected Artifacts

- **Actions taken** -- exact commands or config changes applied with timestamps
- **Verification** -- confirmation that user-facing impact has stopped using the same detection signals
- **Rollback plan** -- documented procedure in case the mitigation itself causes regression
- **Known side effects** -- any side effects of the mitigation called out

## Quality Signals

- Mitigation actions are documented with exact details and timestamps
- Impact cessation is verified using the same metrics that triggered the incident
- A rollback plan exists for the mitigation itself
- Side effects are explicitly documented
