# Unit 06: Stage Orchestrator — Implementation Plan

## Overview

Replace the separate elaborate/execute command split with a unified stage orchestrator. Three user-facing commands: `/haiku:new`, `/haiku:run`, `/haiku:autopilot`. Each stage internally runs: plan → build → adversarial review → output persistence → review gate.

## Dependencies

- **unit-04-studio-infrastructure** (completed): `plugin/lib/studio.sh`, `plugin/lib/stage.sh` — studio/stage resolution, metadata loading, input resolution
- **unit-05-stage-definitions** (completed): `plugin/studios/*/stages/*/STAGE.md` and `outputs/*.md` — all stage definitions and output docs exist

## Architecture Summary

The orchestrator sits between the user-facing commands and the existing sub-skills. It does NOT rewrite elaborate or execute internals — it composes them through the stage loop.

```
User commands          Orchestrator              Existing sub-skills
─────────────         ────────────              ──────────────────
/haiku:new      →     Create intent             (setup, config)
/haiku:run      →     Stage loop:
                        Plan phase      →       gather, discover, decompose, criteria, dag
                        Build phase     →       execute bolt loop (planner/builder/reviewer hats)
                        Adversarial     →       adversarial-review sub-skill
                        Output persist  →       (new: scope-based write)
                        Review gate     →       (new: gate resolution)
/haiku:autopilot →    Same loop, auto gates
```

---

## File-by-File Plan

### File 1: `plugin/lib/orchestrator.sh` (NEW)

The core stage loop logic. Shell library sourced by the skill SKILL.md files.

**Functions:**

```bash
# Run the full stage loop for a single stage
# Called by /haiku:run and /haiku:autopilot
hku_run_stage() {
  local intent_dir="$1"
  local stage_name="$2"
  local studio_name="$3"
  local autopilot="${4:-false}"
  # 1. Plan phase (hku_run_plan_phase)
  # 2. Build phase (hku_run_build_phase)
  # 3. Adversarial review phase (hku_run_adversarial_phase)
  # 4. Output persistence (hku_persist_stage_outputs)
  # 5. Review gate (hku_resolve_review_gate)
}

# Run ONLY the plan phase — decompose into units
# Also used standalone by /haiku:migrate (unit-13)
hku_run_plan_phase() {
  local intent_dir="$1"
  local stage_name="$2"
  # 1. Load STAGE.md metadata (hku_load_stage_metadata from stage.sh)
  # 2. Resolve qualified inputs (hku_resolve_stage_inputs from stage.sh)
  # 3. Load output definitions (hku_load_stage_outputs from stage.sh)
  # 4. If units already exist for this stage: resume (return 0)
  # 5. Else: emit structured context for the elaborate sub-skills
  #    - Stage metadata, resolved input paths, output definitions, criteria guidance
  # Returns: 0 on success, units written to intent_dir/stages/{stage}/units/
}

# Run the build phase — execute bolt loop per unit
hku_run_build_phase() {
  local intent_dir="$1"
  local stage_name="$2"
  # 1. Get units for this stage (hku_stage_units)
  # 2. Build DAG, resolve execution order
  # 3. For each unit in order:
  #    a. For each hat in STAGE.md hats: sequence
  #       - Load hat guidance from STAGE.md ## {hat-name} section
  #       - Load unit's ## References (NOT full stage inputs)
  #       - Execute hat
  #       - Run quality gates
  #    b. Check unit completion criteria
  #    c. If met: mark done, next unit
  #    d. If not met: another bolt cycle
}

# Run adversarial review on all stage units
hku_run_adversarial_phase() {
  local intent_dir="$1"
  local stage_name="$2"
  # 1. Run the stage's final hat(s) as adversarial reviewers
  # 2. Check all units meet criteria
  # 3. Verify all required outputs are produced
  # 4. Produce review summary
}

# Persist stage outputs to scope-based locations
hku_persist_stage_outputs() {
  local intent_dir="$1"
  local stage_name="$2"
  local studio_name="$3"
  # For each output definition in outputs/:
  #   project → .haiku/knowledge/{name}.md
  #   intent  → .haiku/intents/{slug}/knowledge/{name}.md
  #   stage   → .haiku/intents/{slug}/stages/{stage}/{name}
  #   repo    → already written during build (no-op)
}

# Resolve the effective review gate mode
hku_resolve_review_gate() {
  local intent_dir="$1"
  local stage_name="$2"
  local studio_name="$3"
  local autopilot="${4:-false}"
  # 1. Read review field from STAGE.md metadata
  # 2. If single value: use directly
  # 3. If array:
  #    - Normal mode: use first element (default)
  #    - Autopilot: select most permissive non-external option, override ask→auto
  # 4. Execute gate behavior:
  #    - auto: return 0 (advance)
  #    - ask: emit summary, return 1 (pause)
  #    - external: emit review request, return 2 (block)
}

# Get the next incomplete stage for an intent
hku_next_stage() {
  local intent_dir="$1"
  # Read active_stage from intent frontmatter
  # Return next stage in studio sequence, or "" if all complete
}

# Get stage status
hku_stage_status() {
  local intent_dir="$1"
  local stage_name="$2"
  # Returns: pending | planning | building | reviewing | complete | blocked
}

# Advance to next stage
hku_advance_stage() {
  local intent_dir="$1"
  # Updates active_stage in intent frontmatter
  # Returns: next stage name, or "" if all complete
}

# Get units for a specific stage
hku_stage_units() {
  local intent_dir="$1"
  local stage_name="$2"
  # Returns unit file paths in intent_dir/stages/{stage}/units/
}
```

**Key design decisions:**
- Each function is self-contained and composable
- The plan phase emits context as structured output (markdown with frontmatter) that the SKILL.md instructions interpret — the shell doesn't invoke Claude skills directly, it prepares the data
- The build phase reuses the existing execute bolt loop pattern from execute/SKILL.md
- Gate resolution is deterministic and stateless

### File 2: `plugin/skills/new/SKILL.md` (NEW)

The `/haiku:new` user-facing command.

**Structure:**

```yaml
---
description: Start a new H·AI·K·U intent
user-invocable: true
argument-hint: "[description]"
allowed-tools:
  - Read, Write, Glob, Grep, Bash, AskUserQuestion, Skill, ToolSearch
  # MCP read patterns
---
```

**Implementation flow:**

1. **Pre-check**: Reject cowork mode, verify git repo
2. **Gather intent**: If argument provided, use it. Otherwise ask "What do you want to accomplish?"
3. **Extract slug**: kebab-case from user's answer, max 40 chars
4. **Detect studio**: Read `studio:` from `.haiku/settings.yml` (default: `ideation`)
5. **Ask mode**: "Continuous (I'll drive, you review at gates) or discrete (you invoke each stage)?"
   - Use AskUserQuestion with two options
6. **Resolve stages**: Load stage list from studio definition via `hku_load_studio_stages`
7. **Create intent file**: `.haiku/intents/{slug}/intent.md` with frontmatter:
   ```yaml
   ---
   studio: ideation
   stages: [research, create, review, deliver]  # from studio, empty [] for continuous
   active_stage: research  # first stage, empty "" for continuous
   mode: continuous
   status: active
   created: 2026-04-02
   # quality_gates, git config inherited from settings
   ---
   ```
8. **Create workspace**: `.haiku/intents/{slug}/` directory, `stages/`, `knowledge/`, `state/`
9. **Git setup**: Create intent branch, initial commit
10. **Mode-dependent next step**:
    - Continuous: automatically begin first stage's plan phase (transition to `/haiku:run`)
    - Discrete: tell user to run `/haiku:run {slug}` when ready

**Relationship to elaborate:** `/haiku:new` replaces the "gather intent" portion of elaborate. It does NOT run decomposition — that happens in the plan phase of the first stage via `/haiku:run`.

### File 3: `plugin/skills/run/SKILL.md` (NEW)

The `/haiku:run` user-facing command.

**Structure:**

```yaml
---
description: Advance an H·AI·K·U intent through its next stage
user-invocable: true
argument-hint: "[intent-slug] [stage-name]"
allowed-tools:
  - Read, Write, Edit, Glob, Grep, Bash, Agent, Skill, Task
  - AskUserQuestion, ToolSearch
  # MCP patterns, ticketing write tools
---
```

**Implementation flow:**

1. **Pre-check**: Reject cowork mode, context window preflight (same as execute)
2. **Resolve intent**:
   - If slug provided: find `.haiku/intents/{slug}/intent.md`
   - If no slug: find active intent via `hku_find_active_intent`
   - If no active intent found: error, suggest `/haiku:new`
3. **Determine stage**:
   - If stage argument given: validate it's in the studio's stage list, run that stage
   - If intent has `mode: continuous`: run all stages merged (collapse operation — behaves like old elaborate→execute)
   - If intent has `mode: discrete`: read `active_stage:` and advance to next incomplete stage
4. **Load stage definition**: `hku_resolve_stage` from stage.sh
5. **Run the stage loop** (instructions reference orchestrator.sh functions for data, but the SKILL.md defines the agent behavior):

   **Plan phase** (inline, references elaborate sub-skills):
   - Source orchestrator.sh to load stage metadata, resolved inputs, output definitions
   - Load ALL resolved input artifacts as context
   - If stage has existing units: resume (skip to build)
   - If no units: invoke elaborate sub-skills parameterized by stage context:
     - `gather` — stage inputs drive what to gather
     - `discover` — stage body provides exploration focus
     - `decompose` — stage `unit_types` and `outputs/` guide decomposition
     - `criteria` — stage `## Criteria Guidance` section
     - `dag` — unit dependencies within the stage
     - `design-direction` / `wireframes` — only if stage has design-format outputs or designer hat
   - For each unit, populate `## References` with specific artifacts needed (subset of resolved inputs)
   - Write units to `.haiku/intents/{slug}/stages/{stage}/units/`

   **Build phase** (inline, references execute patterns):
   - For each unit in DAG order:
     - For each hat in STAGE.md `hats:` sequence:
       - Load hat guidance from STAGE.md `## {hat-name}` section
       - Load unit's `## References` (NOT full stage inputs)
       - Execute hat (build, review, etc.)
       - Run quality gates
     - Check unit completion criteria
     - If criteria met: mark done, advance
     - If not met: another bolt cycle

   **Adversarial review phase**:
   - Run adversarial review on all stage units
   - Verify all required outputs are produced
   - Produce review summary

   **Output persistence**:
   - For each output definition in `outputs/`:
     - Write to scope-based location (project/intent/stage/repo)

   **Review gate**:
   - Resolve effective gate mode from STAGE.md `review:` field
   - `auto`: advance to next stage
   - `ask`: pause, present summary, wait for user approval
   - `external`: create PR or review request

6. **Stage complete**: Update `active_stage:` to next stage
7. **If continuous mode and gate passes**: automatically begin next stage
8. **If all stages complete**: transition to delivery

**Continuous mode behavior**: When `mode: continuous`, the run skill merges all stage definitions (union of unit_types, concatenated criteria guidance, union of outputs) and runs one elaborate→execute cycle. This is functionally identical to the old flow — the collapse operation preserves backward compatibility.

### File 4: `plugin/skills/autopilot/SKILL.md` (UPDATE)

Update the existing autopilot to use the stage pipeline.

**Changes:**

1. **Replace Phase 2 (Elaboration)**: Instead of invoking `/haiku:elaborate`, invoke `/haiku:new` (if no intent exists) then `/haiku:run` with autopilot gate resolution
2. **Replace Phase 3 (Execution)**: Instead of invoking `/haiku:execute` per unit, the stage loop in `/haiku:run` handles this
3. **Gate resolution in autopilot mode**:
   - `auto` gates: advance immediately
   - `ask` gates: overridden to `auto`
   - `external` (single): blocks, surfaces to user
   - Array gates (e.g., `[external, ask]`): select most permissive non-external option, override ask→auto
4. **Guardrails remain**: scope check (>5 units), pause on blockers, delivery confirmation

**The autopilot skill becomes a thin wrapper** that:
1. Validates input (feature description required)
2. Runs `/haiku:new` with the description (autonomous mode — no questions)
3. Runs `/haiku:run` with autopilot=true for each stage (or all at once in continuous mode)
4. Handles delivery (PR creation with confirmation)

### File 5: `plugin/lib/state.sh` (UPDATE)

Add stage-tracking functions to the existing state library.

**New functions:**

```bash
# Find active intent in the new .haiku/intents/ directory structure
# Falls back to legacy .haiku/{slug}/intent.md for backward compat
hku_find_active_intent() {
  # Check .haiku/intents/*/intent.md first (new structure)
  # Fall back to .haiku/*/intent.md (legacy structure)
}

# Get intent mode (continuous | discrete)
hku_get_intent_mode() {
  local intent_file="$1"
  # Read mode: from intent frontmatter, default "continuous"
}
```

**Updated functions:**

- `hku_find_active_intent`: extend to check `.haiku/intents/` directory structure (new) alongside `.haiku/*/` (legacy)

### File 6: `plugin/skills/elaborate/SKILL.md` (UPDATE)

Convert to a backward-compatibility alias that runs the plan phase.

**Changes:**

- Add a deprecation notice at the top of the skill output
- Detect if intent has studio/stages configured:
  - If yes: print deprecation notice, invoke `/haiku:run {slug}` (plan phase only)  
  - If no (legacy): run existing elaborate logic unchanged
- The bulk of the file remains unchanged for legacy support
- Add a note in the description: "Prefer `/haiku:new` + `/haiku:run` for stage-based workflows"

### File 7: `plugin/skills/execute/SKILL.md` (UPDATE)

Convert to a backward-compatibility alias that runs the build phase.

**Changes:**

- Add a deprecation notice at the top of the skill output
- Detect if intent has studio/stages configured:
  - If yes: print deprecation notice, invoke `/haiku:run {slug}` (build phase only)
  - If no (legacy): run existing execute logic unchanged
- The bulk of the file remains unchanged for legacy support
- Add a note in the description: "Prefer `/haiku:run` for stage-based workflows"

---

## Intent Directory Structure (New)

```
.haiku/intents/{slug}/
├── intent.md                    # Problem, solution, criteria (with studio/stages/mode frontmatter)
├── knowledge/                   # Intent-scoped outputs
│   ├── DISCOVERY.md
│   ├── BEHAVIORAL-SPEC.md
│   └── ...
├── stages/
│   ├── inception/
│   │   ├── state.json           # Stage-level state (status, current hat, etc.)
│   │   └── units/
│   │       ├── unit-01-*.md
│   │       └── unit-02-*.md
│   ├── design/
│   │   ├── state.json
│   │   ├── DESIGN-BRIEF.md      # Stage-scoped output
│   │   └── units/
│   │       └── unit-01-*.md
│   └── development/
│       ├── state.json
│       └── units/
│           ├── unit-01-*.md
│           └── unit-02-*.md
└── state/                       # Intent-level state (iteration.json, etc.)
    └── iteration.json
```

## Legacy Compatibility

For intents without `studio:` field in frontmatter:
- Default to ideation studio
- `mode: continuous` (single elaborate→execute cycle)
- `stages: []`, `active_stage: ""` (no stage tracking)
- Elaborate and execute skills work unchanged

For `.haiku/{slug}/` (old directory structure):
- `hku_find_active_intent` checks both locations
- Old intent structure continues to work with execute/elaborate

## Execution Order

1. `plugin/lib/orchestrator.sh` — core functions, no existing file dependencies beyond stage.sh/studio.sh/state.sh
2. `plugin/lib/state.sh` — add stage tracking functions (small additions)
3. `plugin/skills/new/SKILL.md` — new skill, no conflicts
4. `plugin/skills/run/SKILL.md` — new skill, no conflicts
5. `plugin/skills/autopilot/SKILL.md` — update existing (references new/run)
6. `plugin/skills/elaborate/SKILL.md` — add alias/deprecation header
7. `plugin/skills/execute/SKILL.md` — add alias/deprecation header

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Orchestrator complexity | Decomposed into small composable functions (plan, build, review, gate) |
| Sub-skill parameterization | Stage metadata passed as environment/arguments, sub-skills don't need rewrites |
| State corruption on concurrent runs | Lock intent file during stage transitions (existing state.sh atomic write pattern) |
| Alias confusion | Aliases print deprecation notice pointing to `/haiku:run` |
| Continuous mode regression | Continuous mode collapse operation produces identical behavior to old flow |
| New directory structure breaks hooks | `hku_find_active_intent` searches both old and new locations |

## What This Unit Does NOT Do

- Create stage content (unit-05 — already done)
- Remove old hats/workflows (unit-07)
- Implement persistence adapters (unit-08)
- Migrate legacy intents (unit-13)
- Update paper/website docs (unit-12)
