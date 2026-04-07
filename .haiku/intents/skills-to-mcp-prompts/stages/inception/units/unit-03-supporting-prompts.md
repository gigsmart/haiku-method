---
name: unit-03-supporting-prompts
type: backend
status: completed
depends_on:
  - unit-01-prompts-server
bolt: 1
hat: decomposer
refs:
  - knowledge/DISCOVERY.md
  - knowledge/PROMPTS-SERVER-DISCOVERY.md
started_at: '2026-04-07T02:33:48Z'
completed_at: '2026-04-07T02:50:17Z'
---

# Supporting + Reporting + Niche Prompts

## Description

Implement the remaining 16 prompts: composite, autopilot, setup, migrate, scaffold, operate, triggers, dashboard, backlog, capacity, release-notes, adopt, quick, seed, ideate, pressure-testing.

These are simpler than the core prompts — most just read state and return instructions. Some (like dashboard, backlog) are read-only.

## Completion Criteria

- [x] All 16 supporting prompts implemented and registered
- [x] Each returns well-formed PromptMessage[] with context
- [x] `haiku:autopilot` sets mode=continuous and chains to run
- [x] `haiku:composite` validates 2+ studios selected
- [x] `haiku:dashboard` returns current intent status as formatted context
- [x] `haiku:migrate` runs the migration binary
- [x] All prompts surface as slash commands in Claude Code
