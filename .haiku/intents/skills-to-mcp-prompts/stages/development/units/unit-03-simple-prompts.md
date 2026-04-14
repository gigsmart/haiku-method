---
name: unit-03-simple-prompts
status: completed
inputs:
  - knowledge/DISCOVERY.md
depends_on:
  - unit-01-prompts-infrastructure
bolt: 1
hat: reviewer
refs:
  - knowledge/SUPPORTING-PROMPTS-DISCOVERY.md
  - knowledge/BEHAVIORAL-SPEC.md
  - stages/design/artifacts/PROMPT-CATALOG.md
started_at: '2026-04-07T04:06:44Z'
completed_at: '2026-04-07T04:13:36Z'
---

# Simple + Medium Prompts

## Description

Implement 9 prompt handlers following Pattern A (state read) and Pattern E (subcommand dispatch): dashboard, backlog, capacity, release-notes, scaffold, migrate, seed, ideate, setup.

## Completion Criteria

- [x] `haiku:dashboard` reads active intents and returns formatted status overview
- [x] `haiku:backlog` dispatches add/list/review/promote based on `action` argument
- [x] `haiku:capacity` reads completed intents and returns bolt counts + stage durations
- [x] `haiku:release-notes` reads CHANGELOG.md and returns formatted output
- [x] `haiku:scaffold` returns scaffold instructions for the specified type + name
- [x] `haiku:migrate` returns instructions to run the migration binary
- [x] `haiku:seed` dispatches plant/list/check based on `action` argument
- [x] `haiku:ideate` returns brainstorming prompt with area context
- [x] `haiku:setup` uses elicitation for provider configuration (with fallback)
- [x] All 9 prompts registered and appear in `prompts/list`
- [x] `npm run build` succeeds with no type errors
