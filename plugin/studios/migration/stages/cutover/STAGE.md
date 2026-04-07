---
name: cutover
description: Plan and execute the production cutover with rollback procedures
hats: [cutover-coordinator, rollback-engineer]
review: external
unit_types: [cutover]
inputs:
  - stage: validation
    discovery: validation-report
review-agents-include:
  - stage: migrate
    agents: [data-integrity]
  - stage: validation
    agents: [parity]
---

# Cutover

## Criteria Guidance

Good criteria examples:
- "Cutover runbook lists every step with owner, expected duration, and go/no-go checkpoint"
- "Rollback procedure is tested end-to-end and restores the source system to pre-migration state within the defined RTO"
- "Communication plan notifies all downstream consumers with maintenance window, expected impact, and escalation contacts"

Bad criteria examples:
- "Cutover plan exists"
- "Rollback is possible"
- "Stakeholders are notified"

## Completion Signal (RFC 2119)

Cutover runbook **MUST** exist with sequenced steps, owners, and checkpoints. Rollback procedure is tested and documented with point-of-no-return clearly marked. Communication plan **MUST** cover all stakeholders. Post-cutover verification checklist confirms the target system is serving production traffic correctly.
