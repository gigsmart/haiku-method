---
status: completed
last_updated: "2026-04-03T02:50:15Z"
depends_on: [unit-01-lib-hooks-rename, unit-03-schemas-types-settings, unit-04-studio-infrastructure, unit-06-stage-orchestrator]
branch: ai-dlc/haiku-rebrand/13-legacy-intent-migration
discipline: backend
stage: ""
workflow: ""
ticket: ""
hat: reviewer
---

# unit-13-legacy-intent-migration

## Description

Create the legacy intent migration path that transforms incomplete AI-DLC intents into H·AI·K·U format. Migration has two parts: **physical migration** (move files, update paths, restructure directory layout) and **elaborative migration** (map old units to stages, identify gaps, plan fresh stages for new lifecycle phases the old intent never had). A new `/haiku:migrate` skill surfaces this interactively so the agent can guide the user through the transition.

## Discipline

backend — Shell migration functions, skill definition, and interactive agent guidance.

## Domain Entities

- `plugin/lib/migrate.sh` — migration functions (extends the settings migration from unit-03)
- `plugin/skills/migrate/SKILL.md` — `/haiku:migrate` skill definition
- `plugin/hooks/*.sh` — hook for auto-detecting legacy intents on startup

## Technical Specification

### What a Legacy AI-DLC Intent Looks Like

Old intents live at `.ai-dlc/{slug}/` and contain:

```
.ai-dlc/my-feature/
├── intent.md           # YAML frontmatter + body
└── unit-NN-*.md        # Units at the intent root (NOT under stages)
```

Old `intent.md` frontmatter fields:

```yaml
---
workflow: default
git:
  change_strategy: intent
  auto_merge: true
passes: [design, product, dev]        # old field — explicitly named passes
active_pass: dev                       # which pass the intent is currently in
iterates_on: ""
created: 2026-01-15
status: active                         # active | complete
epic: ""
quality_gates: [...]
announcements: [changelog, release-notes]
---
```

Old `unit-NN-*.md` frontmatter fields:

```yaml
---
status: pending | active | complete
pass: design | product | dev           # which discipline this unit belongs to
depends_on: [unit-01-...]
---
```

Units with `pass: design` belong to the software studio's `design` stage.
Units with `pass: product` belong to the `product` stage.
Units with `pass: dev` (or no pass) belong to the `development` stage.

### Physical Migration (`hku_migrate_legacy_intent`)

```bash
hku_migrate_legacy_intent() {
  local project_root="${1:-.}"
  local slug="$2"                         # The intent slug to migrate

  local old_dir="${project_root}/.ai-dlc/${slug}"
  local new_dir="${project_root}/.haiku/intents/${slug}"

  [[ -d "$old_dir" ]] || { echo "haiku: no legacy intent at ${old_dir}" >&2; return 1; }
  [[ -d "$new_dir" ]] && { echo "haiku: ${slug} already migrated" >&2; return 0; }

  # 1. Create new directory structure
  mkdir -p "${new_dir}/knowledge"
  mkdir -p "${new_dir}/stages"

  # 2. Migrate intent.md — copy and update frontmatter
  hku_migrate_intent_frontmatter "${old_dir}/intent.md" "${new_dir}/intent.md"

  # 3. Migrate units — map to stages and place under stages/{stage}/units/
  for unit_file in "${old_dir}"/unit-*.md; do
    [[ -f "$unit_file" ]] || continue
    local stage
    stage=$(hku_infer_stage_from_unit "$unit_file")
    local unit_name
    unit_name=$(basename "$unit_file")

    mkdir -p "${new_dir}/stages/${stage}/units"
    cp "$unit_file" "${new_dir}/stages/${stage}/units/${unit_name}"
    echo "haiku: migrated ${unit_name} → stages/${stage}/units/" >&2
  done

  # 4. Create state.json for the intent
  hku_write_intent_state "${new_dir}" "$slug"

  # 5. Replace old path with a symlink to the new location for backward compat
  #    Rename the original to a backup first, then point the original path to new
  mv "${old_dir}" "${old_dir}.pre-haiku-backup"
  ln -sf "../.haiku/intents/${slug}" "${old_dir}"
  echo "haiku: intent ${slug} migrated from .ai-dlc/ to .haiku/intents/" >&2
}
```

### Intent Frontmatter Migration (`hku_migrate_intent_frontmatter`)

Maps old field names to new equivalents and adds missing H·AI·K·U fields:

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `passes:` | (removed) | Replaced by studio's stage list |
| `active_pass:` | `active_stage:` | Map pass name → stage name (see table below) |
| `workflow:` | (removed) | Stages define their own hat sequences |
| (absent) | `studio:` | Set to `software` (only AI-DLC software intents exist to migrate) |
| (absent) | `mode:` | Set to `continuous` (preserves old always-on behavior) |
| `iterates_on:` | `iterates_on:` | Preserved unchanged |
| `git:` | `git:` | Preserved unchanged |
| `quality_gates:` | `quality_gates:` | Preserved unchanged |
| `announcements:` | `announcements:` | Preserved unchanged |
| `created:` | `created:` | Preserved unchanged |
| `status:` | `status:` | Preserved unchanged |
| `epic:` | `epic:` | Preserved unchanged |

Pass → Stage name mapping:

| Old Pass Name | New Stage Name |
|--------------|---------------|
| `design` | `design` |
| `product` | `product` |
| `dev` | `development` |
| `backend` | `development` |
| `frontend` | `development` |
| (none / unknown) | `development` |

After frontmatter migration, add two new fields reflecting migration state:

```yaml
migrated_from: .ai-dlc/{intent-slug}/    # provenance
migration_date: <current-date>    # set to the current date at migration runtime (not hardcoded)
```

### Unit Stage Inference (`hku_infer_stage_from_unit`)

```bash
hku_infer_stage_from_unit() {
  local unit_file="$1"
  local pass_value
  pass_value=$(grep -m1 '^pass:' "$unit_file" | sed 's/pass: *//' | tr -d '"'"'" )

  case "$pass_value" in
    design)    echo "design" ;;
    product)   echo "product" ;;
    dev|backend|frontend|"") echo "development" ;;
    *)         echo "development" ;;  # Unknown passes fall back to development
  esac
}
```

### Elaborative Migration — Stage Gap Analysis

After physical migration, the agent runs a gap analysis to determine which stages need to be planned from scratch. This is the "elaboration given the stages" step.

The software studio has 6 stages: `inception → design → product → development → operations → security`.

Old AI-DLC intents only ever had 3 passes: design, product, dev. The three new stages — **inception**, **operations**, and **security** — are always gaps that need fresh elaboration:

| Stage | Status After Physical Migration | Action |
|-------|--------------------------------|--------|
| `inception` | No units (AI-DLC had no inception pass) | Run plan phase to generate discovery units |
| `design` | Has units if old intent had `pass: design` units | Review existing units; mark complete if all done |
| `product` | Has units if old intent had `pass: product` units | Review existing units; mark complete if all done |
| `development` | Has units from `pass: dev` | Review existing units; resume from last incomplete |
| `operations` | No units (AI-DLC had no operations pass) | Run plan phase to generate runbook units |
| `security` | No units (AI-DLC had no security pass) | Run plan phase to generate threat model units |

The gap analysis writes a `migration-plan.md` to `.haiku/intents/{slug}/knowledge/MIGRATION-PLAN.md` (scope: intent) documenting the mapping and what stages need fresh elaboration.

### `/haiku:migrate` Skill

The skill provides an interactive migration experience:

**Step 1: Detect legacy intents**

Scan `.ai-dlc/` for directories containing `intent.md` with `status: active`. Present a list to the user.

**Step 2: Select intent to migrate**

If multiple legacy intents exist, ask which to migrate (or all). If only one exists, confirm before proceeding.

**Step 3: Physical migration**

Run `hku_migrate_legacy_intent` for the selected intent(s). Report what was moved and any mapping decisions made.

**Step 4: Gap analysis and plan**

For each migrated intent:
1. Report which stages have existing units (mapped from old passes)
2. Report which stages are gaps needing fresh elaboration
3. Show the `MIGRATION-PLAN.md` summary to the user
4. Ask: "Should I plan the gap stages now (inception, operations, security), or would you like to review the migrated units first?"

**Step 5: Optional gap-stage elaboration**

If the user approves, run the plan phase for each gap stage in order. This uses the same elaborate sub-skills as `/haiku:run`'s plan phase, parameterized by:
- The migrated intent's existing knowledge (unit descriptions provide context for inception)
- The existing development units (operations planning uses these to understand the system)
- The existing product units (security planning uses the behavioral spec)

The agent does NOT run the full stage loop during migration — only the plan phase. The user reviews and approves the generated units before the build phase runs. This gives the user a chance to prune or adjust new units before work begins.

**Step 6: Summary**

Report the migration outcome:
- Intent migrated to `.haiku/intents/{slug}/`
- Units mapped: N units → design, M units → product, P units → development
- Gap stages planned: inception (Q units), operations (R units), security (S units)
- Next step: `/haiku:run {slug}` to continue from the current active stage

### Auto-Detection Hook

Add a call to `hku_detect_legacy_intents` in `plugin/hooks/session-start.sh`:

```bash
hku_detect_legacy_intents() {
  local project_root="${1:-.}"
  local legacy_dir="${project_root}/.ai-dlc"

  [[ -d "$legacy_dir" ]] || return 0

  local found_intents=()
  for intent_dir in "${legacy_dir}"/*/; do
    [[ -f "${intent_dir}intent.md" ]] || continue
    local status
    status=$(grep -m1 '^status:' "${intent_dir}intent.md" | sed 's/status: *//' | tr -d '"'"'" )
    [[ "$status" == "active" ]] && found_intents+=("$(basename "$intent_dir")")
  done

  if [[ ${#found_intents[@]} -gt 0 ]]; then
    echo "" >&2
    echo "haiku: found ${#found_intents[@]} legacy AI-DLC intent(s) not yet migrated:" >&2
    for slug in "${found_intents[@]}"; do
      echo "  - ${slug}" >&2
    done
    echo "haiku: run /haiku:migrate to migrate them to H·AI·K·U format." >&2
    echo "" >&2
  fi
}
```

This function is called automatically when any `/haiku:*` skill starts. It is a detection-only notice — it does not migrate automatically, preserving the user's control over when migration happens.

### `migration-plan.md` Output Format

Written to `.haiku/intents/{intent-slug}/knowledge/MIGRATION-PLAN.md` (scope: intent):

```markdown
---
name: migration-plan
scope: intent
location: .haiku/intents/{intent-slug}/knowledge/MIGRATION-PLAN.md
migrated_from: .ai-dlc/{intent-slug}/
migration_date: <current-date>    # set at migration runtime
---

# Migration Plan: {slug}

## Mapped Stages (from existing AI-DLC units)

| Stage | Units Migrated | Status |
|-------|---------------|--------|
| design | 3 units | pending |
| product | 2 units | complete |
| development | 7 units | active (unit-04 in progress) |

## Gap Stages (fresh elaboration needed)

| Stage | Reason | Plan Status |
|-------|--------|-------------|
| inception | AI-DLC had no inception pass | planned: 4 units |
| operations | AI-DLC had no operations pass | not yet planned |
| security | AI-DLC had no security pass | not yet planned |

## Active Stage

The intent was in pass `dev` (now: `development` stage) at the time of migration.
Resume with: `/haiku:run {slug}`
```

## Success Criteria

- [ ] `plugin/lib/migrate.sh` contains `hku_migrate_legacy_intent`, `hku_migrate_intent_frontmatter`, `hku_infer_stage_from_unit`, and `hku_detect_legacy_intents` functions
- [ ] `hku_migrate_legacy_intent` moves intent.md and all units to `.haiku/intents/{slug}/`
- [ ] `hku_migrate_intent_frontmatter` maps `passes:` → removed, `active_pass:` → `active_stage:`, `workflow:` → removed, adds `studio: software`, `mode: continuous`, `migrated_from:`, `migration_date:`
- [ ] `migration_date` in MIGRATION-PLAN.md frontmatter and in `hku_migrate_intent_frontmatter` output is set to the current date at migration runtime — NOT a hardcoded value
- [ ] `hku_infer_stage_from_unit` maps `pass: dev` → `development`, `pass: design` → `design`, `pass: product` → `product`, unknown → `development`
- [ ] Units are placed under `.haiku/intents/{slug}/stages/{stage}/units/` (not at the intent root)
- [ ] `hku_detect_legacy_intents` detects active intents in `.ai-dlc/` and prints a notice (detection only — no auto-migration)
- [ ] `/haiku:migrate` skill exists and runs the interactive migration flow
- [ ] `/haiku:migrate` produces `MIGRATION-PLAN.md` in the intent's knowledge directory
- [ ] `/haiku:migrate` identifies gap stages (inception, operations, security) and optionally runs their plan phase
- [ ] Gap stage planning uses existing elaborate sub-skills parameterized by the migrated intent context
- [ ] Gap stage planning generates units for review — build phase does NOT run automatically during migration
- [ ] Backward-compat: old `.ai-dlc/{slug}/` path emits a clear migration notice rather than silently failing
- [ ] A migrated intent that has not yet run gap-stage planning can still be resumed with `/haiku:run {slug}` from the last active stage

## Risks

- **Pass field absent**: Some old units may not have a `pass:` field at all (elaboration without explicit pass assignment was valid). Mitigation: default to `development` stage — the most common target.
- **Partially-complete passes**: An old intent in `active_pass: dev` may have completed design and product passes but have incomplete dev units. Mitigation: `hku_migrate_intent_frontmatter` sets `active_stage:` from `active_pass:`, so the resumed intent starts at the right stage.
- **Gap stage over-elaboration**: The plan phase for inception, operations, and security may generate more units than the user needs for a nearly-complete intent. Mitigation: the skill presents the plan and asks for approval before running the build phase. The user can prune gap-stage units.
- **Intent body content**: The intent.md body (problem statement, domain model, etc.) is copied verbatim and remains valid. No content migration needed — only frontmatter fields change.
- **Concurrent migration**: If two agents migrate the same intent simultaneously, one will see `[[ -d "$new_dir" ]]` as true and skip. No data loss, but the second agent should report the skip clearly.

## Boundaries

This unit covers migration of existing incomplete AI-DLC intents only. It does NOT:
- Migrate completed AI-DLC intents (status: complete) — those are historical, not actionable
- Migrate `.ai-dlc/settings.yml`, `.ai-dlc/providers/`, or `.ai-dlc/knowledge/` — those are covered by unit-03
- Modify any existing plugin lib functions from units 01-04
- Create the stage definitions used during gap elaboration — those come from unit-05

This unit depends on unit-06's orchestrator being available for the optional gap-stage planning step.
