---
name: unit-05-delete-skills
type: backend
status: pending
depends_on:
  - unit-02-core-prompts
  - unit-03-simple-prompts
  - unit-04-complex-prompts
bolt: 0
hat: ""
refs:
  - knowledge/DELETE-SKILLS-DISCOVERY.md
---

# Delete Plugin Skills

## Description

Remove plugin/skills/ directory. Update CLAUDE.md references. Verify internal skill absorption. Verify binary builds and all 21 prompts register.

## Completion Criteria

- [ ] `plugin/skills/` directory deleted entirely
- [ ] CLAUDE.md Key File Locations: no references to `plugin/skills/`
- [ ] CLAUDE.md Concept-to-Implementation table: skill references updated to prompts module
- [ ] `fundamentals` content verified embedded in prompt base context
- [ ] `backpressure` hooks verified functional without skill file
- [ ] `blockers` orchestrator verified functional without skill file
- [ ] `npm run build` succeeds — binary size under 1.5MB
- [ ] All 21 prompts still appear in `prompts/list` after skill deletion
