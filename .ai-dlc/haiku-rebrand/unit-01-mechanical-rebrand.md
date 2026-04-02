---
status: pending
last_updated: ""
depends_on: []
branch: ai-dlc/haiku-rebrand/01-mechanical-rebrand
discipline: backend
stage: ""
workflow: ""
ticket: ""
---

# unit-01-mechanical-rebrand

## Description
Mechanical find-and-replace of all AI-DLC references to H·AI·K·U across the entire codebase. This is a zero-logic change — no architectural modifications, just naming.

## Discipline
backend - Systematic text replacement across shell scripts, markdown, TypeScript, JSON, and YAML files.

## Domain Entities
Every file in the repo that references "ai-dlc", "AI-DLC", ".ai-dlc/", or `/ai-dlc:` commands.

## Technical Specification

### Directory/path renames
- `.ai-dlc/` → `.haiku/` in all paths, gitignore entries, code references
- `ai-dlc/` branch prefixes → `haiku/`
- Plugin metadata: update plugin.json name, description, all references

### Command renames
- All `/ai-dlc:*` slash commands → `/haiku:*` (skill trigger names in SKILL.md frontmatter descriptions)
- All `Skill("ai-dlc:*")` invocations → `Skill("haiku:*")`

### Branding renames
- "AI-DLC" → "H·AI·K·U" in user-facing content (paper, website, docs, skill descriptions)
- "ai-dlc" → "haiku" in code identifiers, function prefixes, variable names
- `dlc_*` function prefixes → `haiku_*` or `hku_*`
- `aidlc_*` telemetry prefixes → `haiku_*`

### Files to update (non-exhaustive)
- plugin/.claude-plugin/plugin.json
- plugin/lib/*.sh (all library files)
- plugin/hooks/*.sh (all hook files)
- plugin/skills/*/SKILL.md (all skills)
- plugin/schemas/*.json (all schemas)
- plugin/shared/src/types.ts
- website/content/**/*.md (all docs, papers, blog posts)
- CLAUDE.md, CHANGELOG.md, README.md
- .gitignore

## Success Criteria
- [ ] No remaining references to ".ai-dlc/" in any code path (grep returns 0 results for "\.ai-dlc" excluding node_modules and .git)
- [ ] No remaining references to "/ai-dlc:" in slash command triggers
- [ ] No remaining "AI-DLC" in user-facing text (except historical changelog entries)
- [ ] Plugin loads and registers correctly under the new name
- [ ] All existing tests pass
- [ ] Settings file at `.haiku/settings.yml` is recognized

## Risks
- **Missed references**: Some references may be in generated files, caches, or encoded paths. Mitigation: comprehensive grep sweep + manual review.
- **Plugin registration**: The claude-plugin system may cache the old name. Mitigation: verify plugin.json updates propagate.

## Boundaries
This unit does NOT change architecture, add studios, modify skills logic, or touch the elaborate/execute flow. It is purely a naming exercise.

## Notes
The CHANGELOG.md is CI-managed — do not edit it directly. Historical entries referencing AI-DLC stay as-is (they're historical). Only the header/description of the changelog file itself gets renamed.
