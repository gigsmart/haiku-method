# Unit 07: Dissolve Hats & Workflows — Implementation Plan

## Summary

Remove `plugin/hats/` directory and `plugin/workflows.yml`. Hat instructions now live as files in each stage's `hats/` directory (already created by unit-05). Workflow definitions are replaced by the stage's `hats:` frontmatter field. Update all hooks, libs, and skills that reference the old hat/workflow system to use the stage-based resolution instead.

## Prerequisites Verified

- **unit-01** (lib/hooks rename): Completed — all files use `hku_` prefix
- **unit-05** (stage definitions): Completed — STAGE.md files exist with `## hat-name` sections and `hats:` frontmatter (e.g., `plugin/studios/software/stages/development/STAGE.md` has `hats: [planner, builder, reviewer]` and `## planner`, `## builder`, `## reviewer` sections)
- **unit-06** (stage orchestrator): Completed — `plugin/lib/orchestrator.sh` and `plugin/lib/stage.sh` exist with `hku_resolve_stage()` function

## Architecture

### Core Principle

**Old**: Hat files (`plugin/hats/*.md`) are standalone docs → `hat.sh` resolves name to file path → hooks `cat` the file
**New**: Stage directories contain hat files at `stages/{stage}/hats/{hat}.md` → `hat.sh` resolves via `stage.sh` → hooks read the hat file from the active stage's `hats/` directory

The `hats:` frontmatter in STAGE.md replaces `workflows.yml` entirely — the hat sequence IS the workflow.

### Fallback Chain

1. **Project-level stage override**: `.haiku/studios/{studio}/stages/{stage}/STAGE.md`
2. **Built-in stage**: `plugin/studios/{studio}/stages/{stage}/STAGE.md`
3. **Legacy fallback** (no stage configured): ideation studio's `research` stage
4. **Project-level hat override** (backward compat): `.haiku/hats/{hat-name}.md`

---

## Implementation Steps

### Step 1: Add `hku_extract_hat_section()` to `plugin/lib/hat.sh`

New function that extracts a `## {hat-name}` section from a STAGE.md file body (content between that heading and the next `## ` heading or EOF).

```bash
# Extract a hat section from a STAGE.md file
# Reads from ## {hat-name} to the next ## heading or EOF
# Usage: hku_extract_hat_section <stage_file> <hat_name>
hku_extract_hat_section() {
  local stage_file="$1"
  local hat_name="$2"
  awk -v hat="## ${hat_name}" '
    BEGIN { found=0 }
    $0 == hat || $0 ~ "^"hat"[[:space:]]" { found=1; next }
    found && /^## / { exit }
    found { print }
  ' "$stage_file"
}
```

### Step 2: Add `hku_get_hat_sequence()` to `plugin/lib/hat.sh`

Reads the `hats:` field from a STAGE.md frontmatter and returns the hat names.

```bash
# Get the hat sequence for a stage (replaces workflow lookup)
# Usage: hku_get_hat_sequence <stage_name> <studio_name>
# Returns: space-separated hat names in order
hku_get_hat_sequence() {
  local stage_name="$1"
  local studio_name="$2"
  local stage_file
  stage_file=$(hku_resolve_stage "$stage_name" "$studio_name") || return 1
  yq --front-matter=extract '.hats[]' "$stage_file" 2>/dev/null | tr '\n' ' ' | sed 's/ $//'
}
```

### Step 3: Rewrite `load_hat_instructions()` in `plugin/lib/hat.sh`

Replace the current implementation (reads from `plugin/hats/*.md`) with stage-based resolution:

1. Source `stage.sh` (already available via config.sh chain)
2. If `stage_name` + `studio_name` provided (new args), resolve from that stage
3. Fallback to ideation/research if no stage configured
4. Still check `.haiku/hats/{hat}.md` for project-level overrides (backward compat) — project hat file augments the stage section
5. Preserve the augmentation pattern (stage section + project augmentation)

**New signature**: `hku_resolve_hat_instructions <hat_name> [stage_name] [studio_name]`

Keep `load_hat_instructions` as a thin backward-compat wrapper that calls `hku_resolve_hat_instructions` with empty stage/studio (triggers fallback).

### Step 4: Rewrite `load_hat_metadata()` in `plugin/lib/hat.sh`

Hat metadata (name, description) no longer comes from standalone hat files. Instead:
- Name = the hat section heading text (just the hat_name itself)
- Description = first bold line in the hat section (the `**Focus:**` line)
- Falls back to project `.haiku/hats/{hat}.md` if it exists

### Step 5: Update `plugin/hooks/inject-context.sh`

#### 5a: Remove workflow loading block (lines 65-119)

Delete the entire `parse_all_workflows` function, the `WORKFLOWS` associative array, and the `AVAILABLE_WORKFLOWS` variable construction. These are replaced by stage `hats:` fields.

#### 5b: Replace workflow references in no-state paths

The "greenfield" and "no active task" paths currently display `$AVAILABLE_WORKFLOWS`. Replace with stage-aware discovery:
- Instead of listing workflows, show available studios and their stages
- The "workflow suggestions" block (quick routing table) should reference stages instead of workflow names
- Remove `WORKFLOW_NAME` validation against `KNOWN_WORKFLOWS` (line 477-479)

#### 5c: Replace hat instruction loading (lines 694-747)

Replace:
```bash
source "${PLUGIN_ROOT}/lib/hat.sh"
INSTRUCTIONS=$(load_hat_instructions "$HAT")
HAT_META=$(load_hat_metadata "$HAT" 2>/dev/null || echo "{}")
```

With stage-aware resolution:
```bash
source "${PLUGIN_ROOT}/lib/hat.sh"
# Read active_stage and studio from intent frontmatter
ACTIVE_STAGE=""
STUDIO=""
if [ -n "$INTENT_DIR" ] && [ -f "${INTENT_DIR}/intent.md" ]; then
  ACTIVE_STAGE=$(yaml_get_simple "active_stage" "" < "${INTENT_DIR}/intent.md")
  STUDIO=$(yaml_get_simple "studio" "software" < "${INTENT_DIR}/intent.md")
fi
INSTRUCTIONS=$(hku_resolve_hat_instructions "$HAT" "$ACTIVE_STAGE" "$STUDIO")
```

#### 5d: Replace workflow display in status line (line 505)

Currently: `**Workflow:** $WORKFLOW_NAME ($WORKFLOW_HATS_STR)`
Replace with: `**Stage:** $ACTIVE_STAGE` (and hat sequence from the stage)

#### 5e: Remove workflow-related state fields

The `workflowName` and `workflow` fields in iteration.json are read/used throughout. These become stage-derived. Remove their extraction and replace with stage reads.

### Step 6: Update `plugin/hooks/subagent-context.sh`

Same pattern as inject-context.sh:

#### 6a: Remove workflow extraction from iteration.json (lines 37-43)

Currently extracts `WORKFLOW_NAME` and `WORKFLOW_HATS` from iteration.json. Replace with stage-based hat sequence.

#### 6b: Remove workflow constraint logic (lines 63-70)

The pass-based workflow constraining (`constrain_workflow`) becomes unnecessary — stages have fixed hat sequences.

#### 6c: Replace hat loading (lines 229-249)

Replace `load_hat_instructions`/`load_hat_metadata` calls with `hku_resolve_hat_instructions` (same as inject-context.sh).

#### 6d: Replace workflow display in status line (line 107)

Same as inject-context.sh — stage-based instead of workflow-based.

### Step 7: Update `plugin/lib/dag.sh` — `get_recommended_hat()`

Lines 582-588: Currently reads `workflows.yml` to get hat sequence. Replace with:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/stage.sh"
# Determine active stage from intent
local stage_name=$(hku_frontmatter_get "active_stage" "${intent_dir}/intent.md" 2>/dev/null)
local studio=$(hku_frontmatter_get "studio" "${intent_dir}/intent.md" 2>/dev/null)
[ -z "$studio" ] && studio="software"
[ -z "$stage_name" ] && stage_name="development"  # sensible default
local hats
hats=$(hku_get_hat_sequence "$stage_name" "$studio")
```

### Step 8: Update `plugin/hooks/workflow-guard.sh`

Line 22: Currently warns about editing "outside of hat context." The warning message references hats, which is still valid (hats still exist as a concept — they just live in stages now). Minor update: ensure the logic still works without `workflows.yml`. The current code only checks if `HAT` is empty, so it should work as-is. Just update the warning message if needed.

### Step 9: Update Skills

#### 9a: `plugin/skills/execute/SKILL.md`

**Lines 416-421** (workflow resolution): Replace `workflows.yml` lookup with stage-based hat sequence:
```bash
# Read stage and studio from intent
ACTIVE_STAGE=$(dlc_frontmatter_get "active_stage" "$INTENT_FILE")
STUDIO=$(dlc_frontmatter_get "studio" "$INTENT_FILE")
# Get hat sequence from stage
source "${CLAUDE_PLUGIN_ROOT}/lib/hat.sh"
WORKFLOW_HATS=$(hku_get_hat_sequence "$ACTIVE_STAGE" "$STUDIO")
```

**Lines 665-696** (unit-specific workflow resolution): Replace with stage-based resolution. The unit's discipline maps to a stage, not a workflow:
- `design` discipline → `design` stage
- `backend`/`frontend`/`fullstack` → `development` stage
- `infrastructure`/`observability` → `operations` stage

**Lines 716-717, 822-823** (hat instruction loading): Replace `load_hat_instructions` with `hku_resolve_hat_instructions` passing stage context.

**Line 975** (spawn logic reference): Update comment to reference stage-based hat resolution.

#### 9b: `plugin/skills/elaborate/SKILL.md`

**Lines 1020-1038** (hat discovery in Phase 5): Replace hat file iteration with stage-based discovery. Instead of listing hats from `plugin/hats/`, list hats from the selected studio's stages.

**Lines 1046-1051** (workflow discovery): Remove `workflows.yml` reading. Replace with stage listing from the active studio.

**Lines 1054-1069** (workflow selection): Replace with stage selection. The user picks a studio and stage, not a workflow.

#### 9c: `plugin/skills/quick/SKILL.md`

**Lines 47-48** (workflow file loading): Replace with stage-based resolution.
**Lines 194-196** (hat file fallback): Replace direct hat file reads with `hku_resolve_hat_instructions`.

#### 9d: `plugin/skills/fundamentals/SKILL.md`

**Line 174+** (custom workflows/hats docs): Rewrite to explain the stage-based system. Remove references to `.haiku/workflows.yml` and `plugin/hats/`. Document the new system: studios contain stages, stages contain hat sections.

#### 9e: `plugin/skills/reflect/SKILL.md`

**Lines 292, 380, 390**: Remove references to `.haiku/hats/` and `.haiku/workflows.yml` in the reflect outputs and git add commands.

#### 9f: `plugin/skills/pressure-testing/SKILL.md`

**Lines 31, 181-196, 287**: Replace `.haiku/hats/{hat-name}.md` references with stage-based hat resolution.

#### 9g: `plugin/skills/execute/subskills/advance/SKILL.md`

Check for workflow/hat sequence references and update to stage-based.

#### 9h: `plugin/skills/resume/SKILL.md`

Check for workflow/hat references and update.

### Step 10: Update `plugin/lib/pass.sh`

The `available_workflows` concept in passes becomes `available_stages` or is simplified. Passes constrain which stages can run, not which workflows. The `constrain_workflow` function needs updating or removal.

**However**, passes are an optional feature and the pass definition files (`plugin/passes/*.md`) still reference `available_workflows`. This can be updated in this unit or deferred. Since the unit spec says to remove workflow references, update:
- `available_workflows` → `available_stages` in pass definitions
- `constrain_workflow` → `constrain_stage` (or remove if stages are inherently fixed)

### Step 11: Delete files

Only after all references are updated:

```bash
rm -rf plugin/hats/
rm plugin/workflows.yml
```

Files to delete:
- `plugin/hats/acceptance-test-writer.md`
- `plugin/hats/analyst.md`
- `plugin/hats/blue-team.md`
- `plugin/hats/builder-reference.md`
- `plugin/hats/builder.md`
- `plugin/hats/designer.md`
- `plugin/hats/experimenter.md`
- `plugin/hats/hypothesizer.md`
- `plugin/hats/implementer.md`
- `plugin/hats/observer.md`
- `plugin/hats/planner.md`
- `plugin/hats/red-team.md`
- `plugin/hats/refactorer.md`
- `plugin/hats/reviewer-reference.md`
- `plugin/hats/reviewer.md`
- `plugin/hats/test-writer.md`
- `plugin/workflows.yml`

### Step 12: Verification

```bash
# Deleted paths must not exist
! ls plugin/hats/ 2>/dev/null
! ls plugin/workflows.yml 2>/dev/null

# No remaining references to deleted paths
grep -r 'plugin/hats/' plugin/ --include='*.sh' --include='*.md' | grep -v 'CHANGELOG' | wc -l  # 0
grep -r 'workflows\.yml' plugin/ --include='*.sh' --include='*.md' | grep -v 'CHANGELOG' | wc -l  # 0

# Stage-based hat resolution works
source plugin/lib/hat.sh
source plugin/lib/stage.sh
hku_extract_hat_section "$(hku_resolve_stage development software)" "builder"  # should output builder section
hku_get_hat_sequence "development" "software"  # should output: planner builder reviewer
```

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `plugin/lib/hat.sh` | **Rewrite** | Add `hku_extract_hat_section`, `hku_get_hat_sequence`, `hku_resolve_hat_instructions`; keep `load_hat_instructions` as compat wrapper |
| `plugin/hooks/inject-context.sh` | **Major edit** | Remove workflow loading/display, replace hat loading with stage-based, update status line |
| `plugin/hooks/subagent-context.sh` | **Major edit** | Same pattern as inject-context.sh |
| `plugin/hooks/workflow-guard.sh` | **Minor edit** | Update warning message if needed |
| `plugin/lib/dag.sh` | **Edit** | `get_recommended_hat()` uses stage hat sequence instead of workflows.yml |
| `plugin/lib/pass.sh` | **Edit** | Update `available_workflows` → stage-aware or simplify |
| `plugin/skills/execute/SKILL.md` | **Major edit** | Replace all workflow.yml refs with stage-based resolution |
| `plugin/skills/elaborate/SKILL.md` | **Major edit** | Replace hat/workflow discovery with stage-based |
| `plugin/skills/quick/SKILL.md` | **Edit** | Replace workflow file loading and hat file reads |
| `plugin/skills/fundamentals/SKILL.md` | **Edit** | Rewrite custom hat/workflow docs to stage-based |
| `plugin/skills/reflect/SKILL.md` | **Edit** | Remove .haiku/hats/ and workflows.yml references |
| `plugin/skills/pressure-testing/SKILL.md` | **Edit** | Replace .haiku/hats/ references |
| `plugin/skills/resume/SKILL.md` | **Check/edit** | Update workflow/hat references |
| `plugin/skills/execute/subskills/advance/SKILL.md` | **Check/edit** | Update hat transition logic |
| `plugin/hats/*.md` (16 files) | **Delete** | All hat definition files |
| `plugin/workflows.yml` | **Delete** | Workflow definitions file |

## Risks & Mitigations

1. **Content parity**: Hat content from `plugin/hats/*.md` must already exist in STAGE.md files (unit-05's job). **Mitigation**: Before deleting, verify each hat from workflows.yml has a corresponding `## hat-name` section in at least one STAGE.md.

2. **Orphan references**: String interpolation may hide references. **Mitigation**: Grep for partial patterns (`hats/`, `hat_file`, `HAT_FILE`, `workflows`) not just full paths.

3. **Pass system coupling**: `plugin/lib/pass.sh` and pass definitions reference `available_workflows`. **Mitigation**: Update pass system to be stage-aware or simplify — stages have fixed hat sequences so workflow constraining is no longer needed.

4. **Quick mode workflow selection**: `/ai-dlc:quick [workflow] <task>` uses workflow names for routing. **Mitigation**: Replace with stage-aware routing — the first arg maps to a stage name instead of a workflow name.

## Execution Order

Steps 1-4 (hat.sh changes) → Steps 5-6 (hooks) → Steps 7-8 (other libs) → Step 9 (skills) → Step 10 (pass.sh) → Step 11 (deletions) → Step 12 (verification)

This ordering ensures new functions exist before callers are updated, and files are only deleted after all references are removed.
