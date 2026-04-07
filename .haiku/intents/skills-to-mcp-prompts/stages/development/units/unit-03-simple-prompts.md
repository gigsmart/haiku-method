---
name: unit-03-simple-prompts
type: backend
status: pending
depends_on:
  - unit-01-prompts-infrastructure
bolt: 0
hat: ""
refs:
  - knowledge/SUPPORTING-PROMPTS-DISCOVERY.md
  - knowledge/BEHAVIORAL-SPEC.md
  - stages/design/artifacts/PROMPT-CATALOG.md
---

# Simple + Medium Prompts

## Description

Implement 9 prompt handlers following Pattern A (state read) and Pattern E (subcommand dispatch): dashboard, backlog, capacity, release-notes, scaffold, migrate, seed, ideate, setup.

## Completion Criteria

- [ ] `haiku:dashboard` reads active intents and returns formatted status overview
- [ ] `haiku:backlog` dispatches add/list/review/promote based on `action` argument
- [ ] `haiku:capacity` reads completed intents and returns bolt counts + stage durations
- [ ] `haiku:release-notes` reads CHANGELOG.md and returns formatted output
- [ ] `haiku:scaffold` returns scaffold instructions for the specified type + name
- [ ] `haiku:migrate` returns instructions to run the migration binary
- [ ] `haiku:seed` dispatches plant/list/check based on `action` argument
- [ ] `haiku:ideate` returns brainstorming prompt with area context
- [ ] `haiku:setup` uses elicitation for provider configuration (with fallback)
- [ ] All 9 prompts registered and appear in `prompts/list`
- [ ] `npm run build` succeeds with no type errors
