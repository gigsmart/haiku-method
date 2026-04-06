---
name: mitigation-log
location: .haiku/intents/{intent-slug}/knowledge/MITIGATION-LOG.md
scope: intent
format: text
required: true
---

# Mitigation Log

Record of all mitigation actions taken, their effects, and how to reverse them. This output feeds the resolve stage so the permanent fix can be built with full context of the temporary measures in place.

## Content Guide

Document every action taken to stop the bleeding:

- **Actions taken** — exact commands, config changes, rollback versions, or feature flags toggled, with timestamps
- **Rationale** — why this mitigation was chosen over alternatives
- **Verification results** — before/after metrics showing the mitigation's effect
- **Rollback plan** — how to reverse each mitigation action if it causes its own problems
- **Known side effects** — any degraded functionality, reduced capacity, or disabled features resulting from the mitigation
- **Remaining risk** — what the mitigation does NOT address and what could still go wrong
- **Cleanup required** — what temporary measures need to be removed once a permanent fix is in place

## Quality Signals

- Every action has a timestamp, an actor, and a reversal procedure
- Verification uses the same metrics that detected the incident
- Side effects are explicitly documented, not discovered later
- The mitigation is clearly labeled as temporary, with cleanup expectations
