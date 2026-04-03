# Unit 02 — Skills, Metadata & Provider Rename Plan

## Inventory Summary

| Category | Pattern | Replacement | Count | Files |
|---|---|---|---|---|
| Command triggers | `/ai-dlc:*`, `ai-dlc:*` in frontmatter/text | `haiku:*` | 263 | 24 SKILL.md |
| Cross-skill invocations | `Skill("ai-dlc:*")` | `Skill("haiku:*")` | 2 | 2 SKILL.md |
| User-facing text | `AI-DLC` | `H·AI·K·U` | 95 | 20 SKILL.md |
| Path references | `.ai-dlc/` | `.haiku/` | 330 | 20 SKILL.md |
| Commit message prefixes | `"ai-dlc: ` | `"haiku: ` | 6 | 3 SKILL.md |
| Plugin metadata | `"ai-dlc"` in plugin.json | `"haiku"` | 4 fields | 1 file |
| Provider docs | `AI-DLC` / `.ai-dlc/` | `H·AI·K·U` / `.haiku/` | 6 | 4 provider .md |
| hooks.json | — | — | 0 (file does not exist) | — |

**Total: ~706 replacements across 29 files**

## Detailed File Inventory

### SKILL.md files — command triggers (`ai-dlc:` → `haiku:`)

| File | `ai-dlc:` | `AI-DLC` | `.ai-dlc/` | Commit prefixes |
|---|---|---|---|---|
| execute/SKILL.md | 39 | 11 | 32 | 0 |
| adopt/SKILL.md | 26 | 9 | 25 | 0 |
| elaborate/SKILL.md | 25 | 9 | 110 | 1 |
| autopilot/SKILL.md | 22 | 1 | 3 | 0 |
| operate/SKILL.md | 19 | 0 | 26 | 1 |
| quick/SKILL.md | 15 | 1 | 15 | 0 |
| resume/SKILL.md | 14 | 5 | 15 | 0 |
| backlog/SKILL.md | 12 | 0 | 7 | 0 |
| seed/SKILL.md | 10 | 0 | 9 | 0 |
| followup/SKILL.md | 10 | 0 | 10 | 0 |
| compound/SKILL.md | 9 | 0 | 1 | 0 |
| setup/SKILL.md | 8 | 6 | 19 | 4 |
| fundamentals/SKILL.md | 8 | 13 | 12 | 0 |
| dashboard/SKILL.md | 7 | 1 | 5 | 0 |
| review/SKILL.md | 5 | 2 | 1 | 0 |
| reflect/SKILL.md | 5 | 4 | 15 | 0 |
| ideate/SKILL.md | 5 | 1 | 0 | 0 |
| construct/SKILL.md | 5 | 1 | 0 | 0 |
| reset/SKILL.md | 4 | 8 | 4 | 0 |
| refine/SKILL.md | 4 | 3 | 2 | 0 |
| cleanup/SKILL.md | 4 | 4 | 10 | 0 |
| pressure-testing/SKILL.md | 3 | 1 | 9 | 0 |
| blockers/SKILL.md | 3 | 4 | 0 | 0 |
| backpressure/SKILL.md | 1 | 7 | 0 | 0 |
| completion-criteria/SKILL.md | 0 | 4 | 0 | 0 |

### Cross-skill invocations (`Skill("ai-dlc:*")`)

- `plugin/skills/elaborate/SKILL.md:127` → `Skill("ai-dlc:setup")` → `Skill("haiku:setup")`
- `plugin/skills/quick/SKILL.md:243` → `Skill("ai-dlc:review")` → `Skill("haiku:review")`

### Plugin metadata (`plugin/.claude-plugin/plugin.json`)

| Field | Current | Target |
|---|---|---|
| `name` | `"ai-dlc"` | `"haiku"` |
| `description` | `"AI-DLC methodology..."` | `"H·AI·K·U methodology..."` |
| `homepage` | `"https://ai-dlc.dev"` | Keep as-is (URL, not brand text) |
| `repository` | `"...thebushidocollective/ai-dlc"` | Keep as-is (repo URL unchanged) |
| `keywords[0]` | `"ai-dlc"` | `"haiku"` |

### Provider docs

| File | Line | Current | Target |
|---|---|---|---|
| comms.md:3 | description frontmatter | `"...for AI-DLC"` | `"...for H·AI·K·U"` |
| design.md:3 | description frontmatter | `"...for AI-DLC"` | `"...for H·AI·K·U"` |
| spec.md:3 | description frontmatter | `"...for AI-DLC"` | `"...for H·AI·K·U"` |
| ticketing.md:3 | description frontmatter | `"...for AI-DLC"` | `"...for H·AI·K·U"` |
| ticketing.md:34 | body text | `".ai-dlc/ files"` | `".haiku/ files"` |
| ticketing.md:38 | body text | `".ai-dlc/settings.yml"` | `".haiku/settings.yml"` |

### hooks.json

**Does not exist** in this branch — verified clean. No action needed.

## Execution Plan

### Step 1: SKILL.md bulk renames (24 files)

Process each of the 24 SKILL.md files containing `ai-dlc` references. Apply replacements in this order per file to avoid partial-match collisions:

1. `Skill("ai-dlc:` → `Skill("haiku:` (most specific, 2 files)
2. `"ai-dlc: ` → `"haiku: ` (commit prefixes, 3 files)
3. `/ai-dlc:` → `/haiku:` (command triggers in text)
4. `ai-dlc:` → `haiku:` (remaining command references in frontmatter `triggers:` etc.)
5. `.ai-dlc/` → `.haiku/` (path references)
6. `AI-DLC` → `H·AI·K·U` (user-facing text)

**Caution**: Step 6 must NOT alter identifiers that have already been changed. The pattern `AI-DLC` is distinct from `ai-dlc:` so no collision risk.

### Step 2: Plugin metadata (1 file)

Update `plugin/.claude-plugin/plugin.json`:
- `"name": "ai-dlc"` → `"name": "haiku"`
- `"description": "AI-DLC methodology..."` → `"H·AI·K·U methodology..."`
- `"keywords": ["ai-dlc", ...]` → `["haiku", ...]`
- Leave `homepage` and `repository` URLs unchanged

### Step 3: Provider docs (4 files)

- comms.md, design.md, spec.md: `AI-DLC` → `H·AI·K·U` in description
- ticketing.md: `AI-DLC` → `H·AI·K·U` in description + `.ai-dlc/` → `.haiku/` in body

### Step 4: Verification

Run these checks — all must return 0:

```bash
# No ai-dlc: command references
grep -rc 'ai-dlc:' plugin/skills/*/SKILL.md | grep -v ':0$' | wc -l
# → 0

# No Skill("ai-dlc:*") invocations
grep -c 'Skill("ai-dlc:' plugin/skills/*/SKILL.md | grep -v ':0$' | wc -l
# → 0

# No "ai-dlc" in plugin.json
grep -c '"ai-dlc"' plugin/.claude-plugin/plugin.json
# → 0

# plugin.json name is "haiku"
grep '"name": "haiku"' plugin/.claude-plugin/plugin.json
# → match

# No ai-dlc: commit prefixes
grep -c '"ai-dlc: ' plugin/skills/*/SKILL.md | grep -v ':0$' | wc -l
# → 0

# No .ai-dlc/ paths in SKILL.md files
grep -rc '\.ai-dlc/' plugin/skills/*/SKILL.md | grep -v ':0$' | wc -l
# → 0

# No AI-DLC text in skills
grep -rc 'AI-DLC' plugin/skills/*/SKILL.md | grep -v ':0$' | wc -l
# → 0

# No AI-DLC/ai-dlc in provider docs
grep -c 'ai-dlc\|AI-DLC' plugin/providers/*.md | grep -v ':0$' | wc -l
# → 0

# hooks.json still absent (or if present, clean)
! test -f plugin/.claude-plugin/hooks.json || grep -c 'ai-dlc' plugin/.claude-plugin/hooks.json | grep '^0$'
# → success
```

### Step 5: Commit

Single commit on branch `ai-dlc/haiku-rebrand/02-skills-metadata-rename`:

```
refactor(haiku-rebrand): rename all ai-dlc references in skills, metadata, and providers
```

## Risk Notes

- **Order matters**: Replace `Skill("ai-dlc:` and `"ai-dlc: ` (commit prefixes) before the general `ai-dlc:` pass to avoid double-matching.
- **`homepage` and `repository` URLs**: These are real URLs pointing to the current domain/repo — changing them would break links. Leave as-is.
- **`H·AI·K·U` vs `H•AI•K•U`**: The plugin.json description currently uses `H•AI•K•U` (bullet •). The standard brand form is `H·AI·K·U` (middle dot ·). Normalize to `H·AI·K·U` everywhere.
- **No subskill files**: No subskill SKILL.md files exist in this branch yet — nothing to rename there.
