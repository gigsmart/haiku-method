---
title: "Delete Skills — Discovery"
unit: unit-04-delete-skills
stage: inception
---

## Delete Skills — Discovery

### What to Delete

- `plugin/skills/` — entire directory (47 SKILL.md files, 14,518 lines)
- Deprecated stubs: elaborate, execute, construct, resume, cleanup, compound (already thin dispatchers or deprecated)

### What References Skills

| File | Reference Type | Action |
| --- | --- | --- |
| `CLAUDE.md` | `plugin/skills/*/SKILL.md` in Key File Locations | Update to reference MCP prompts |
| `CLAUDE.md` | Concept-to-Implementation mapping references skills | Update to reference prompts module |
| `plugin/VALIDATION.md` | References skill file structure | Update or remove |
| `.haiku/intents/*/` | Historical intent artifacts reference old skill paths | No action needed (historical) |
| `plugin/.claude-plugin/plugin.json` | No skill references | No action needed |

### Internal Skills to Absorb

- `fundamentals` — content becomes embedded in every prompt's base context
- `completion-criteria` — logic already in orchestrator's quality-gate enforcement
- `backpressure` — enforcement via hooks, not skill content
- `blockers` — orchestrator handles blocking state

### Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| CLAUDE.md references break | Low | Search and replace all `plugin/skills/` references |
| Old intents reference skill paths | None | Historical artifacts, not active code |
| Binary size change | Positive | Skills were loaded at runtime; removing them reduces I/O |

### Verification

- `find plugin/skills -type f` returns nothing (directory deleted)
- `grep -r "plugin/skills" CLAUDE.md` returns no matches
- Plugin binary builds successfully without skills directory
- All 21 prompts still register and respond via MCP
