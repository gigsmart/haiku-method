---
description: Migrate legacy AI-DLC intents to H·AI·K·U format
user-invocable: true
argument-hint: "[intent-slug]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Agent
  - Skill
  - AskUserQuestion
  - ToolSearch
---

# H·AI·K·U Migrate

## Name

`haiku:migrate` - Migrate legacy AI-DLC intents to H·AI·K·U format.

## Synopsis

```
/haiku:migrate [intent-slug]
```

## Description

**User-facing command** - Detects legacy `.ai-dlc/{slug}/` intent directories and migrates them to `.haiku/intents/{slug}/` with frontmatter transformation, unit-to-stage mapping, gap analysis, and optional gap-stage planning.

**What it does:**
- Moves files from `.ai-dlc/{slug}/` to `.haiku/intents/{slug}/`
- Transforms intent frontmatter (passes → stages, adds studio/mode metadata)
- Maps units to stages based on their `pass:` field
- Creates backward-compat symlink (old path → new path)
- Produces a `MIGRATION-PLAN.md` gap analysis
- Optionally plans gap stages (inception, operations, security)

---

## Implementation

### Step 1: Detect Legacy Intents

Scan `.ai-dlc/` for directories containing `intent.md` with `status: active`:

```bash
# No shell lib needed — git provides the project root
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
```

Find all `.ai-dlc/*/intent.md` files where:
- The directory is a real directory (not a symlink — symlinks are already migrated)
- The intent has `status: active`

If none found, report "No legacy intents to migrate" and exit.

Present the list of detected intents to the user.

### Step 2: Select Intent

- If an argument was provided, use it as the slug. Validate it exists in `.ai-dlc/{slug}/intent.md`.
- If multiple intents found and no argument, ask the user which to migrate (or "all").
- If exactly one found, confirm with the user before proceeding.

### Step 3: Physical Migration

For each selected intent, run the migration via the haiku binary:

```bash
# Migration is now handled by the haiku binary
# Run: haiku migrate "$slug"
haiku migrate "$slug"
```

This function:
1. Creates `.haiku/intents/{slug}/` with `knowledge/`, `stages/`, `state/` subdirectories
2. Copies `intent.md` with transformed frontmatter:
   - Removes `passes:` and `workflow:` fields
   - Maps `active_pass:` → `active_stage:` (design→design, product→product, dev/backend/frontend→development)
   - Adds `studio: software`, `mode: continuous`, `migrated_from:`, `migration_date:`
   - Preserves all other fields and body verbatim
3. Maps each `unit-*.md` to `stages/{inferred-stage}/units/` based on its `pass:` field
4. Creates `stages/{stage}/state.json` with initial execution state
5. Backs up old directory as `.ai-dlc/{slug}.pre-haiku-backup`
6. Creates symlink `.ai-dlc/{slug}` → `.haiku/intents/{slug}`

Report what was moved and the pass→stage mapping decisions.

### Step 4: Gap Analysis

The software studio has 6 stages: inception, design, product, development, operations, security.

For the migrated intent, analyze which stages have units and which are gaps:

1. Read the stages that have units (from the migration in step 3)
2. Identify gap stages — stages with no units. Typically:
   - **inception** — never had a pass equivalent in AI-DLC
   - **operations** — never had a pass equivalent
   - **security** — never had a pass equivalent
3. Write a `MIGRATION-PLAN.md` to `.haiku/intents/{slug}/knowledge/`:

```markdown
---
type: migration-plan
migration_date: {runtime date via $(date +%Y-%m-%d)}
source: .ai-dlc/{slug}/
---

# Migration Plan: {slug}

## Migrated Stages

{List stages with unit counts}

## Gap Stages

{List stages with no units and brief description of what they typically cover}

## Recommendations

{Brief guidance on whether gap stages need attention based on the intent's scope}
```

4. Show the gap analysis summary to the user.

### Step 5: Optional Gap-Stage Planning

Ask the user whether to plan gap stages now using `AskUserQuestion`:

> **Gap stages detected:** {list}
> Would you like to plan these stages now? This runs the plan phase only (no build).
> 1. Yes - plan gap stages
> 2. No - skip for now (you can run /haiku:run later)

If yes:
- For each gap stage (inception, operations, security) in order:
  - Use `haiku_run_next` MCP tool to run the plan phase for the stage, parameterized by the migrated intent context
  - **Only the plan phase runs — build does NOT run during migration**

If no, skip to summary.

### Step 6: Summary

Report the migration results:

```
Migration complete: {slug}

Location: .haiku/intents/{slug}/
Studio: software | Mode: continuous

Stages:
  - inception: {N units | planned | gap}
  - design: {N units | planned | gap}
  - product: {N units | planned | gap}
  - development: {N units | planned | gap}
  - operations: {N units | planned | gap}
  - security: {N units | planned | gap}

Backup: .ai-dlc/{slug}.pre-haiku-backup
Symlink: .ai-dlc/{slug} → .haiku/intents/{slug}

Next: /haiku:run {slug}
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No legacy intents found | "No legacy intents to migrate." Exit. |
| Slug not found | "No legacy intent found at .ai-dlc/{slug}/" Error. |
| Already migrated (symlink) | Skip with notice |
| New dir already exists | Skip with notice (idempotent) |
| yq not available | Error: "yq required for frontmatter migration" |
| No active intents | "No active legacy intents found." Exit. |
