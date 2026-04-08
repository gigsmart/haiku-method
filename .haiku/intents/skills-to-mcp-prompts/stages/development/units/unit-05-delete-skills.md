---
name: unit-05-delete-skills
type: backend
status: completed
depends_on:
  - unit-02-core-prompts
  - unit-03-simple-prompts
  - unit-04-complex-prompts
bolt: 1
hat: reviewer
refs:
  - knowledge/DELETE-SKILLS-DISCOVERY.md
started_at: '2026-04-07T04:16:25Z'
completed_at: '2026-04-07T04:18:21Z'
---

# Delete Plugin Skills

## Description

Remove plugin/skills/ directory. Update CLAUDE.md references. Verify internal skill absorption. Verify binary builds and all 21 prompts register.

## Completion Criteria

- [x] `plugin/skills/` directory deleted entirely
- [x] CLAUDE.md Key File Locations: no references to `plugin/skills/`
- [x] CLAUDE.md Concept-to-Implementation table: skill references updated to prompts module
- [x] `fundamentals` content verified embedded in prompt base context
- [x] `backpressure` hooks verified functional without skill file
- [x] `blockers` orchestrator verified functional without skill file
- [x] `npm run build` succeeds — binary size under 1.5MB
- [x] All 21 prompts still appear in `prompts/list` after skill deletion
