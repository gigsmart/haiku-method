---
name: autopilot
description: Full autonomous workflow — elaborate, plan, build, review, and deliver in one command
---

# Autopilot

Run the full H·AI·K·U lifecycle autonomously from description to delivery.

## Process

1. If no active intent exists, start one with `/haiku:start`
2. Set `mode=autopilot` on the intent
3. Run `haiku_run_next` in a loop, advancing through all stages
4. Override ask gates to auto (only external gates pause autopilot)

## Guardrails

- MUST pause on blockers or ambiguity — never guess
- MUST pause if >5 units generated during elaboration (scope check with user)
- MUST pause before creating PR (delivery check)
- MUST NOT run in cowork mode
- MUST stop immediately on phase-level failures
