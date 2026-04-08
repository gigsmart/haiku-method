---
name: cutover-runbook
location: .haiku/intents/{intent-slug}/stages/cutover/artifacts/
scope: intent
format: text
required: true
---

# Cutover Runbook

Step-by-step cutover plan with rollback procedures and communication plan.

## Expected Artifacts

- **Runbook** -- every step with owner, expected duration, and go/no-go checkpoint
- **Rollback procedure** -- tested end-to-end, restores source system within defined RTO
- **Communication plan** -- downstream consumers notified with maintenance window and escalation contacts
- **Cutover verification** -- post-cutover checks confirming successful migration

## Quality Signals

- Every step has an owner and go/no-go checkpoint
- Rollback procedure is tested end-to-end before cutover
- Communication plan covers all downstream consumers
- Post-cutover verification confirms production is healthy
