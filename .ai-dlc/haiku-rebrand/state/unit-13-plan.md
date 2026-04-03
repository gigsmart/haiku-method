# Unit 13 — Legacy Intent Migration: Implementation Plan

## Overview

Create the legacy intent migration path: physical file migration from `.ai-dlc/{slug}/` to `.haiku/intents/{slug}/`, frontmatter transformation, unit-to-stage mapping, gap analysis, and an interactive `/haiku:migrate` skill. Also add auto-detection of unmigrated intents in the session-start hook.

## Files to Create

| File | Purpose |
|------|---------|
| `plugin/skills/migrate/SKILL.md` | `/haiku:migrate` interactive skill definition |

## Files to Modify

| File | Purpose |
|------|---------|
| `plugin/lib/migrate.sh` | Add 5 new functions for intent migration |
| `plugin/hooks/inject-context.sh` | Add legacy intent detection notice near session start |

## Implementation Steps

### Step 1: Extend `plugin/lib/migrate.sh` — Core Migration Functions

Add the following functions to the existing `migrate.sh` (which already has file/dir/settings/providers/knowledge migration from unit-03):

#### 1a. `hku_infer_stage_from_unit`

- Reads `pass:` field from unit frontmatter using `grep` + `sed` (as specified in unit spec)
- Maps: `design` → `design`, `product` → `product`, `dev`/`backend`/`frontend`/`""` → `development`
- Unknown values default to `development`
- Pure function, no side effects

#### 1b. `hku_migrate_intent_frontmatter`

- Takes `<old_intent_file>` and `<new_intent_file>` paths
- Reads old intent.md, copies body verbatim
- Transforms frontmatter:
  - Removes `passes:` field
  - Maps `active_pass:` → `active_stage:` using the pass→stage name mapping
  - Removes `workflow:` field
  - Adds `studio: software`
  - Adds `mode: continuous`
  - Adds `migrated_from: .ai-dlc/{slug}/`
  - Adds `migration_date:` set to current date (`$(date +%Y-%m-%d)`) at runtime
  - Preserves all other fields: `git:`, `quality_gates:`, `announcements:`, `created:`, `status:`, `epic:`, `iterates_on:`
- Uses `yq` for frontmatter manipulation (consistent with existing parse.sh patterns)

#### 1c. `hku_write_intent_state`

- Takes `<new_intent_dir>` and `<slug>`
- Creates `state/iteration.json` with initial state:
  ```json
  {"phase":"execution","hat":"planner","iteration":1,"status":"active","intentSlug":"<slug>"}
  ```
- Uses `hku_state_save` from state.sh

#### 1d. `hku_migrate_legacy_intent`

- Takes `<project_root>` and `<slug>`
- Guards: old dir must exist, new dir must not exist (idempotent skip)
- Creates new directory structure: `{new_dir}/knowledge/`, `{new_dir}/stages/`
- Calls `hku_migrate_intent_frontmatter` for intent.md
- Iterates over `unit-*.md` files, calls `hku_infer_stage_from_unit` for each, copies to `stages/{stage}/units/`
- Calls `hku_write_intent_state` for state.json
- Creates backward-compat: `mv` old dir to `{old_dir}.pre-haiku-backup`, symlink old path → new path
- Prints progress messages to stderr

#### 1e. `hku_detect_legacy_intents`

- Takes `<project_root>` (defaults to `.`)
- Scans `.ai-dlc/*/intent.md` for `status: active` intents
- Skips directories that are symlinks (already migrated)
- If any found: prints notice to stderr listing slugs and suggesting `/haiku:migrate`
- Detection only — no auto-migration

### Step 2: Create `plugin/skills/migrate/SKILL.md` — Interactive Skill

Structure following existing skill patterns (see `new/SKILL.md`, `run/SKILL.md` for reference):

**Frontmatter:**
- `description: Migrate legacy AI-DLC intents to H·AI·K·U format`
- `user-invocable: true`
- `argument-hint: "[intent-slug]"`
- `allowed-tools:` — Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, Skill, Agent, Task, ToolSearch

**Skill body implements the 6-step interactive flow:**

1. **Detect legacy intents** — Scan `.ai-dlc/` for dirs with `intent.md` having `status: active`. Filter out symlinks (already migrated) and completed intents. Present list.

2. **Select intent** — If argument provided, use it. If multiple found, ask user which (or all). If one found, confirm.

3. **Physical migration** — Source `migrate.sh`, call `hku_migrate_legacy_intent`. Report what was moved and mapping decisions.

4. **Gap analysis** — For the software studio (6 stages: inception, design, product, development, operations, security), report:
   - Which stages have existing units (mapped from old passes)
   - Which stages are gaps (inception, operations, security — never had pass equivalents)
   - Write `MIGRATION-PLAN.md` to `.haiku/intents/{slug}/knowledge/` with frontmatter including `migration_date` set at runtime
   - Show summary to user

5. **Optional gap-stage elaboration** — Ask user whether to plan gap stages now. If yes, call `hku_run_plan_phase` from orchestrator.sh for each gap stage (inception, operations, security) in order, parameterized by migrated intent context. Only plan phase — build does NOT run.

6. **Summary** — Report: intent location, unit counts per stage, gap stages planned, next step (`/haiku:run {slug}`).

### Step 3: Add Detection to `plugin/hooks/inject-context.sh`

Insert a call to `hku_detect_legacy_intents` **early in the hook** (after libraries are sourced, before the main context output). Specifically:

- After the `source "$PLUGIN_ROOT/lib/state.sh"` line (~line 24)
- Source migrate.sh (already sourced transitively via config.sh → migrate.sh)
- Call `hku_detect_legacy_intents "$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"` 
- Must only detect intents where the `.ai-dlc/{slug}` directory is a real directory (not a symlink), since symlinks indicate already-migrated intents
- Output goes to stderr as a notice, not stdout (so it doesn't pollute context injection)

**Important:** The existing `inject-context.sh` already sources `config.sh` which sources `migrate.sh`. The detection function should be called before the main state-loading logic so the notice appears early.

### Step 4: Verify Cross-Component Consistency

- **Sync check**: This is a plugin-only change (backend shell + skill). The migration concept is implementation-specific, not a methodology concept requiring paper updates.
- **Website docs**: `/haiku:migrate` is user-facing — if website docs list available commands, this should be added. Check `website/content/docs/` for a commands/skills reference page.
- **No terminology changes** — uses existing terms (intent, unit, stage, studio).

## Key Design Decisions

1. **Symlink for backward compat**: Old `.ai-dlc/{slug}/` path becomes a symlink to `.haiku/intents/{slug}/`. This means existing branches referencing old paths still work. The backup is at `{old_dir}.pre-haiku-backup`.

2. **Detection via symlink check**: `hku_detect_legacy_intents` must check `[[ ! -L "$intent_dir" ]]` to skip already-migrated intents (which are now symlinks).

3. **Software studio assumption**: All legacy AI-DLC intents are assumed to be `software` studio intents (the only studio that existed pre-H·AI·K·U). Hardcoded in `hku_migrate_intent_frontmatter`.

4. **migration_date is runtime**: Both `hku_migrate_intent_frontmatter` and the MIGRATION-PLAN.md use `$(date +%Y-%m-%d)` — never a hardcoded value.

5. **Gap stage planning is opt-in**: The skill asks the user before running plan phase for gap stages. Only plan phase runs — build phase is explicitly excluded during migration.

6. **Frontmatter manipulation via yq**: Consistent with the rest of the codebase. Use `yq --front-matter=process` for in-place frontmatter edits on .md files.

## Success Criteria Mapping

| Criterion | Step |
|-----------|------|
| migrate.sh contains all 5 functions | Step 1 |
| hku_migrate_legacy_intent moves files correctly | Step 1d |
| hku_migrate_intent_frontmatter transforms fields correctly | Step 1b |
| migration_date is runtime, not hardcoded | Steps 1b, 2 (MIGRATION-PLAN.md) |
| hku_infer_stage_from_unit maps passes correctly | Step 1a |
| Units placed under stages/{stage}/units/ | Step 1d |
| hku_detect_legacy_intents detection-only notice | Step 1e, Step 3 |
| /haiku:migrate skill exists | Step 2 |
| MIGRATION-PLAN.md produced in knowledge/ | Step 2 (step 4 of skill) |
| Gap stages identified, optional plan phase | Step 2 (steps 5-6 of skill) |
| Gap planning uses elaborate sub-skills | Step 2 (step 5) |
| Build phase does NOT run during migration | Step 2 (explicit constraint) |
| Backward compat: old path emits migration notice | Step 1d (symlink), Step 1e (detection) |
| Migrated intent resumable with /haiku:run | Step 1c (state.json), Step 1b (active_stage) |

## Risk Mitigations

- **Missing pass field**: Default to `development` stage (most common target) — handled in `hku_infer_stage_from_unit`
- **Partially-complete passes**: `active_stage:` mapped from `active_pass:` preserves resume position
- **Concurrent migration**: `[[ -d "$new_dir" ]]` guard provides idempotency
- **Intent body preserved**: Only frontmatter changes; body copied verbatim
