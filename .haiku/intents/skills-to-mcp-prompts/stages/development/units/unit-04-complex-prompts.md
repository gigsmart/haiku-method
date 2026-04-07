---
name: unit-04-complex-prompts
type: backend
status: active
depends_on:
  - unit-01-prompts-infrastructure
bolt: 1
hat: planner
refs:
  - knowledge/SUPPORTING-PROMPTS-DISCOVERY.md
  - knowledge/BEHAVIORAL-SPEC.md
  - stages/design/artifacts/PROMPT-CATALOG.md
started_at: '2026-04-07T04:07:00Z'
---

# Complex Prompts

## Description

Implement 7 complex prompt handlers following Patterns B/C/D/F: autopilot, composite, operate, triggers, adopt, quick, pressure-testing.

## Completion Criteria

- [ ] `haiku:autopilot` sets mode=autopilot on intent, returns haiku:run-equivalent prompt
- [ ] `haiku:composite` uses elicitation for multi-studio selection, validates 2+ studios
- [ ] `haiku:operate` dispatches operation templates from studio's operations directory
- [ ] `haiku:triggers` reads provider config and returns polling instructions
- [ ] `haiku:adopt` returns reverse-engineering instructions with subagent coordination context
- [ ] `haiku:quick` creates single-stage intent and returns abbreviated execution prompt
- [ ] `haiku:pressure-testing` loads unit implementation and returns adversarial challenge prompt
- [ ] All 7 prompts registered and appear in `prompts/list`
- [ ] `npm run build` succeeds with no type errors
