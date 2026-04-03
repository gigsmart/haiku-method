---
name: runbook
location: .haiku/intents/{intent-slug}/knowledge/RUNBOOK.md
scope: intent
format: text
required: true
---

# Runbook

Operational runbook for handling failure scenarios. Written for the person who gets paged at 3 AM — every entry should be actionable without needing to read the codebase.

## Content Guide

Organize by failure scenario. For each entry:

- **Symptom description** — what the oncall sees (alert text, dashboard signal, user report)
- **Diagnostic steps** — specific commands to run to confirm the issue and assess severity
- **Remediation steps** — specific commands or actions to fix the problem
- **Escalation criteria** — when to page additional people, and who
- **Rollback procedure** — how to revert if the remediation makes things worse

Common scenarios to cover:
- Service restart (graceful and forced)
- Database failover
- Cache invalidation
- Dependency failure handling (upstream service down)
- Certificate rotation
- Intent-specific operational scenarios

## Quality Signals

- Every step has a specific command, not a vague instruction ("restart the service" vs. `kubectl rollout restart deployment/api -n production`)
- Diagnostic steps come before remediation — understand before acting
- Escalation criteria are specific ("if error rate exceeds 5% after restart, page the database oncall")
- Rollback procedures are tested, not theoretical
