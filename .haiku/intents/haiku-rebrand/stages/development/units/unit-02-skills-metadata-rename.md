---
name: unit-02-skills-metadata-rename
type: backend
status: completed
depends_on: [unit-01-lib-hooks-rename]
bolt: 0
hat: ""
started_at: 2026-04-03T01:36:09Z
completed_at: 2026-04-03T01:36:09Z
---


# unit-02-skills-metadata-rename

## Description

Rename all AI-DLC references across plugin skill definitions, plugin metadata, and hooks configuration. Every `/ai-dlc:*` command becomes `/haiku:*`, every `Skill("ai-dlc:*")` invocation becomes `Skill("haiku:*")`, and all user-facing text referencing "AI-DLC" becomes "H·AI·K·U".

## Discipline

backend - Skill definition markdown and plugin metadata JSON updates.

## Domain Entities

- `plugin/skills/*/SKILL.md` — all 20+ skill definition files
- `plugin/.claude-plugin/plugin.json` — plugin name, description, homepage, keywords
- `plugin/.claude-plugin/hooks.json` — hook configuration (verify no ai-dlc strings)
- `plugin/providers/*.md` — provider documentation files

## Technical Specification

### Skill File Renames

Every SKILL.md file needs three classes of changes:

#### 1. Frontmatter command triggers

```yaml
# Before
name: ai-dlc:elaborate
# After
name: haiku:elaborate
```

Applied to all skills:

| Old Name | New Name |
|----------|----------|
| `ai-dlc:elaborate` | `haiku:elaborate` |
| `ai-dlc:execute` | `haiku:execute` |
| `ai-dlc:autopilot` | `haiku:autopilot` |
| `ai-dlc:setup` | `haiku:setup` |
| `ai-dlc:review` | `haiku:review` |
| `ai-dlc:followup` | `haiku:followup` |
| `ai-dlc:quick` | `haiku:quick` |
| `ai-dlc:adopt` | `haiku:adopt` |
| `ai-dlc:refine` | `haiku:refine` |
| `ai-dlc:release-notes` | `haiku:release-notes` |
| `ai-dlc:compound` | `haiku:compound` |
| `ai-dlc:blockers` | `haiku:blockers` |
| `ai-dlc:backpressure` | `haiku:backpressure` |
| `ai-dlc:fundamentals` | `haiku:fundamentals` |
| `ai-dlc:completion-criteria` | `haiku:completion-criteria` |
| `ai-dlc:construct` | `haiku:construct` |
| `ai-dlc:operate` | `haiku:operate` |
| `ai-dlc:advance` | `haiku:advance` |
| `ai-dlc:resume` | `haiku:resume` |
| `ai-dlc:reset` | `haiku:reset` |
| `ai-dlc:cleanup` | `haiku:cleanup` |
| `ai-dlc:seed` | `haiku:seed` |
| `ai-dlc:reflect` | `haiku:reflect` |
| `ai-dlc:dashboard` | `haiku:dashboard` |
| `ai-dlc:ideate` | `haiku:ideate` |
| `ai-dlc:backlog` | `haiku:backlog` |
| `ai-dlc:pressure-testing` | `haiku:pressure-testing` |

#### 2. Cross-skill invocation references

Every `Skill("ai-dlc:*")` call in skill body text becomes `Skill("haiku:*")`. Also update any `/ai-dlc:*` references in description text, instructions, or examples.

#### 3. User-facing text

- `"AI-DLC"` -> `"H·AI·K·U"` in descriptions and body text
- `"ai-dlc"` -> `"haiku"` or `"H·AI·K·U"` as context requires
- Commit message prefixes: `"ai-dlc: "` -> `"haiku: "` (e.g., `"ai-dlc: initialize default settings"` -> `"haiku: initialize default settings"`)
- Path references in instructions: `.ai-dlc/` -> `.haiku/`

### Plugin Metadata

**`plugin/.claude-plugin/plugin.json`:**
- `"name": "ai-dlc"` -> `"name": "haiku"`
- `"description"` — rewrite to reference H·AI·K·U as a universal lifecycle orchestration framework
- `"homepage"` — update to `"https://haikumethod.ai"`
- `"keywords"` — replace `"ai-dlc"` with `"haiku"`, add `"haiku-method"`, `"lifecycle"`, `"orchestration"`

**`plugin/.claude-plugin/hooks.json`:**
- Verify no `ai-dlc` references in hook command strings (these use `${CLAUDE_PLUGIN_ROOT}` which is fine)
- If any exist, update them

### Provider Files

**`plugin/providers/*.md`:**
- Update any references to `/ai-dlc:setup` -> `/haiku:setup`
- Update any references to `.ai-dlc/providers/` -> `.haiku/providers/`
- Update any "AI-DLC" branding in descriptions

### Verification

```bash
grep -r '/ai-dlc:' plugin/skills/ --include='*.md'       # 0 results
grep -r 'Skill("ai-dlc:' plugin/ --include='*.md'        # 0 results
grep -r '"ai-dlc"' plugin/.claude-plugin/ --include='*.json'  # 0 results
grep -r 'AI-DLC' plugin/skills/ --include='*.md'          # 0 results
grep -r '\.ai-dlc/' plugin/skills/ --include='*.md'       # 0 results
```

## Success Criteria

- [ ] Zero `/ai-dlc:` command references remain in any SKILL.md file
- [ ] Zero `Skill("ai-dlc:*")` invocation strings remain
- [ ] Zero `"ai-dlc"` references in plugin.json
- [ ] plugin.json name is `"haiku"` and description references H·AI·K·U
- [ ] All commit message prefix strings updated from `"ai-dlc: "` to `"haiku: "`
- [ ] All `.ai-dlc/` path references in SKILL.md files updated to `.haiku/`
- [ ] All "AI-DLC" user-facing text updated to "H·AI·K·U" in skills
- [ ] Provider documentation files updated
- [ ] hooks.json verified clean of ai-dlc references

## Risks

- **Skill invocation chain**: Skills call each other via `Skill("...")`. Missing one breaks the chain. Mitigation: grep for every `Skill("ai-dlc:` pattern.
- **Markdown formatting**: The interpunct in H·AI·K·U may need escaping in some contexts. Mitigation: test rendering in Claude Code.
- **Plugin registration cache**: The `name` field change in plugin.json may require clearing a plugin cache. Mitigation: verify plugin loads under the new name.

## Boundaries

This unit modifies skill definitions, plugin metadata, and provider docs. It does NOT modify shell libraries (unit-01), schemas (unit-03), architecture (units 04-08), or documentation/website (units 10-12).
