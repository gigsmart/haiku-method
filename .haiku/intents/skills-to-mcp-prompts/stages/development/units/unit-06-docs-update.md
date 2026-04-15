---
name: unit-06-docs-update
type: frontend
status: completed
inputs: ["knowledge/DISCOVERY.md"]
depends_on:
  - unit-05-delete-skills
bolt: 1
hat: reviewer
refs:
  - knowledge/DELETE-SKILLS-DISCOVERY.md
started_at: '2026-04-07T04:18:33Z'
completed_at: '2026-04-07T04:21:19Z'
---

# Website Documentation Update

## Description

Update website docs to reflect migration from skills to MCP prompts. Remove deprecated command references, update CLI reference.

## Completion Criteria

- [x] Deprecated commands removed from docs: elaborate, execute, resume, cleanup, compound
- [x] Internal skills no longer listed as commands: fundamentals, completion-criteria, blockers, backpressure
- [x] Getting-started guide references only valid MCP prompt commands
- [x] No references to `plugin/skills/` in `website/content/docs/`
