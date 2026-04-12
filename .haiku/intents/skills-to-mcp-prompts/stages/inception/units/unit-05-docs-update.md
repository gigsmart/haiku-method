---
name: unit-05-docs-update
type: frontend
status: completed
inputs: ["intent.md"]
depends_on:
  - unit-02-core-prompts
  - unit-03-supporting-prompts
  - unit-03b-complex-prompts
bolt: 1
hat: decomposer
refs:
  - knowledge/DISCOVERY.md
started_at: '2026-04-07T02:53:00Z'
completed_at: '2026-04-07T02:53:00Z'
---

# Website Documentation Update

## Description

Update website docs to reflect the migration from skills to MCP prompts. Remove references to deprecated commands, update CLI reference, and ensure getting-started guide is accurate.

## Completion Criteria

- [x] `website/content/docs/` CLI reference updated: deprecated commands removed (elaborate, execute, resume, cleanup, compound)
- [x] Internal skills no longer listed as commands (fundamentals, completion-criteria, blockers, backpressure)
- [x] Getting-started guide references only valid MCP prompt commands
- [x] No references to `plugin/skills/` in website docs
