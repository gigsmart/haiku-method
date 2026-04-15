---
name: unit-03b-complex-prompts
status: completed
depends_on:
  - unit-01-prompts-server
bolt: 1
hat: decomposer
refs:
  - knowledge/DISCOVERY.md
  - knowledge/PROMPTS-SERVER-DISCOVERY.md
  - knowledge/SUPPORTING-PROMPTS-DISCOVERY.md
started_at: '2026-04-07T02:53:00Z'
completed_at: '2026-04-07T02:53:00Z'
---

# Complex Supporting Prompts

## Description

Implement 7 complex prompts that follow Pattern B (elicitation + side effect), Pattern C (mode setting + chain), Pattern D (external binary), or Pattern F (subagent orchestration): composite, autopilot, operate, triggers, adopt, quick, pressure-testing.

## Completion Criteria

- [x] `haiku:autopilot` sets mode=continuous, chains to haiku:resume
- [x] `haiku:composite` uses elicitation for multi-studio selection, validates 2+ studios
- [x] `haiku:operate` dispatches operation templates from the studio's operations directory
- [x] `haiku:triggers` polls configured providers, returns events as structured context
- [x] `haiku:adopt` reads existing feature, returns reverse-engineering instructions with subagent coordination
- [x] `haiku:quick` accepts stage + task, returns single-stage prompt with abbreviated elaboration
- [x] `haiku:pressure-testing` loads unit implementation, returns adversarial challenge prompt
- [x] All 7 prompts registered and surface as slash commands
