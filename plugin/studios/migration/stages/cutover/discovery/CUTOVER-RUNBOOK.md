---
name: cutover-runbook
location: .haiku/intents/{intent-slug}/knowledge/CUTOVER-RUNBOOK.md
scope: intent
format: text
required: true
---

# Cutover Runbook

Document the production cutover plan, rollback procedure, and post-cutover verification. This is the final deliverable of the migration studio.

## Content Guide

Structure the runbook around execution phases:

- **Pre-cutover checklist** — prerequisites verified before starting
- **Cutover steps** — sequenced steps with owner, expected duration, and go/no-go checkpoints
- **Traffic routing plan** — how traffic shifts from source to target
- **Point of no return** — the step after which rollback becomes significantly more expensive
- **Rollback procedure** — step-by-step restoration to pre-migration state with RTO verification
- **Post-cutover verification** — checks confirming the target is serving correctly
- **Communication plan** — stakeholder notifications for maintenance window, completion, and escalation
- **Escalation contacts** — who to reach for each category of issue

## Quality Signals

- Every step has an explicit owner and go/no-go criteria
- Rollback procedure is tested end-to-end, not theoretical
- Point of no return is clearly marked and understood by all participants
- Post-cutover verification reuses validation checks from the validation stage
