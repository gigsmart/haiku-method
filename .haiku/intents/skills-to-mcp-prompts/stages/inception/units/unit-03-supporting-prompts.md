---
name: unit-03-supporting-prompts
status: completed
depends_on:
  - unit-01-prompts-server
bolt: 1
hat: decomposer
refs:
  - knowledge/DISCOVERY.md
  - knowledge/PROMPTS-SERVER-DISCOVERY.md
  - knowledge/SUPPORTING-PROMPTS-DISCOVERY.md
started_at: '2026-04-07T02:33:48Z'
completed_at: '2026-04-07T02:50:17Z'
---

# Supporting Prompts — Simple + Medium

## Description

Implement 9 simpler prompts that follow Pattern A (state read + instruction return) or Pattern E (subcommand dispatch): dashboard, backlog, capacity, release-notes, scaffold, migrate, seed, ideate, setup.

## Completion Criteria

- [x] `haiku:dashboard` returns current intent status as formatted context (read-only)
- [x] `haiku:backlog` dispatches add/list/review/promote subcommands
- [x] `haiku:capacity` reads completed intents and returns bolt counts + stage durations
- [x] `haiku:release-notes` reads CHANGELOG.md and returns formatted output
- [x] `haiku:scaffold` accepts type + name, returns scaffold instructions for studios/stages/hats
- [x] `haiku:migrate` returns instructions to run the migration binary
- [x] `haiku:seed` dispatches plant/list/check subcommands
- [x] `haiku:ideate` reads area context and returns brainstorming prompt
- [x] `haiku:setup` uses elicitation for provider configuration
- [x] All 9 prompts registered and surface as slash commands
