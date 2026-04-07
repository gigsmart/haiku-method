---
name: unit-04-delete-skills
type: backend
status: completed
depends_on:
  - unit-02-core-prompts
  - unit-03-supporting-prompts
  - unit-03b-complex-prompts
  - unit-05-docs-update
bolt: 1
hat: decomposer
refs:
  - knowledge/DISCOVERY.md
  - knowledge/PROMPTS-SERVER-DISCOVERY.md
  - knowledge/DELETE-SKILLS-DISCOVERY.md
started_at: '2026-04-07T02:50:41Z'
completed_at: '2026-04-07T02:52:03Z'
---

# Delete Plugin Skills

## Description

Remove all plugin skill files now that MCP prompts replace them. Delete deprecated stubs entirely. Update CLAUDE.md and any references. Verify all internal skills are properly absorbed.

## Completion Criteria

- [x] `plugin/skills/` directory deleted entirely
- [x] Deprecated skills deleted: elaborate, execute, construct, resume, cleanup, compound
- [x] Internal skill `fundamentals` content embedded in prompt base context
- [x] Internal skill `completion-criteria` logic verified in orchestrator (no skill file dependency)
- [x] Internal skill `backpressure` enforcement verified via hooks (no skill file dependency)
- [x] Internal skill `blockers` handling verified in orchestrator (no skill file dependency)
- [x] `followup` functionality verified as folded into `haiku:new` prompt
- [x] `reset` functionality available as MCP tool (not a prompt)
- [x] CLAUDE.md Key File Locations updated: `plugin/skills/*/SKILL.md` references removed
- [x] CLAUDE.md Concept-to-Implementation table updated: skill references → prompt module references
- [x] Binary size verified under 1.5MB
