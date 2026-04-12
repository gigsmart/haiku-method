---
name: unit-04-complex-prompts
type: backend
status: completed
inputs: ["knowledge/DISCOVERY.md"]
depends_on:
  - unit-01-prompts-infrastructure
bolt: 1
hat: reviewer
refs:
  - knowledge/SUPPORTING-PROMPTS-DISCOVERY.md
  - knowledge/BEHAVIORAL-SPEC.md
  - stages/design/artifacts/PROMPT-CATALOG.md
started_at: '2026-04-07T04:07:00Z'
completed_at: '2026-04-07T04:12:39Z'
---

# Complex Prompts

## Description

Implement 7 complex prompt handlers following Patterns B/C/D/F: autopilot, composite, operate, triggers, adopt, quick, pressure-testing.

## Completion Criteria

- [x] `haiku:autopilot` sets mode=autopilot on intent, returns haiku:resume-equivalent prompt
- [x] `haiku:composite` uses elicitation for multi-studio selection, validates 2+ studios
- [x] `haiku:operate` dispatches operation templates from studio's operations directory
- [x] `haiku:triggers` reads provider config and returns polling instructions
- [x] `haiku:adopt` returns reverse-engineering instructions with subagent coordination context
- [x] `haiku:quick` creates single-stage intent and returns abbreviated execution prompt
- [x] `haiku:pressure-testing` loads unit implementation and returns adversarial challenge prompt
- [x] All 7 prompts registered and appear in `prompts/list`
- [x] `npm run build` succeeds with no type errors
