---
name: unit-06-docs-update
type: frontend
status: active
depends_on:
  - unit-05-delete-skills
bolt: 1
hat: planner
refs:
  - knowledge/DELETE-SKILLS-DISCOVERY.md
started_at: '2026-04-07T04:18:33Z'
---

# Website Documentation Update

## Description

Update website docs to reflect migration from skills to MCP prompts. Remove deprecated command references, update CLI reference.

## Completion Criteria

- [ ] Deprecated commands removed from docs: elaborate, execute, resume, cleanup, compound
- [ ] Internal skills no longer listed as commands: fundamentals, completion-criteria, blockers, backpressure
- [ ] Getting-started guide references only valid MCP prompt commands
- [ ] No references to `plugin/skills/` in `website/content/docs/`
