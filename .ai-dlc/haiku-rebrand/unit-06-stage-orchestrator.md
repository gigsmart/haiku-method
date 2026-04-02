---
status: pending
last_updated: ""
depends_on: [unit-04-studio-infrastructure, unit-05-stage-definitions]
branch: ai-dlc/haiku-rebrand/06-stage-orchestrator
discipline: backend
stage: ""
workflow: ""
ticket: ""
---

# unit-06-stage-orchestrator

## Description

Create the unified stage orchestrator that replaces the separate elaborate/execute command split. Three user-facing commands: `/haiku:new` (start intent), `/haiku:run` (advance through stages), `/haiku:autopilot` (fully autonomous). Each stage internally runs: plan -> build -> adversarial review -> review gate.

## Discipline

backend - Skill definition files, shell orchestration logic, and state management.

## Domain Entities

- `plugin/skills/new/SKILL.md` — `/haiku:new` skill definition
- `plugin/skills/run/SKILL.md` — `/haiku:run` skill definition
- `plugin/skills/autopilot/SKILL.md` — `/haiku:autopilot` skill definition (updated)
- `plugin/lib/orchestrator.sh` — stage loop execution logic
- `plugin/lib/state.sh` — updated for stage tracking
- Existing elaborate sub-skills — reused in the plan phase

### Commands

#### `/haiku:new` — Start a New Intent

User says `/haiku:new`. The system:

1. **Asks**: "What do you want to accomplish?" (no name needed upfront)
2. **Extracts slug** from the user's answer (kebab-case, max 40 chars)
3. **Detects studio**: reads `studio:` from `.haiku/settings.yml` (default: `ideation`)
4. **Asks mode**: "Continuous (I'll drive, you review at gates) or discrete (you invoke each stage)?"
5. **Creates intent**: `.haiku/{slug}/intent.md` with frontmatter:
   ```yaml
   ---
   studio: ideation
   stages: [research, create, review, deliver]
   active_stage: research
   mode: continuous
   status: active
   created: 2026-04-02
   # ... existing fields (quality_gates, git config, etc.)
   ---
   ```
6. **Creates workspace**: `.haiku/{slug}/` directory structure
7. **Begins first stage**: automatically transitions into the first stage's plan phase

If mode is discrete, it stops after creating the intent and tells the user to run `/haiku:run {slug}` when ready.

#### `/haiku:run [name] [stage?]` — Run an Intent

User says `/haiku:run my-feature` or `/haiku:run my-feature design`. The system:

1. **Resolves intent**: finds `.haiku/{name}/intent.md`
2. **Determines stage**: if stage argument given, runs that stage. If not, reads `active_stage:` from intent frontmatter and advances to the next incomplete stage.
3. **Loads stage definition**: resolves STAGE.md from the studio
4. **Runs the stage loop** (see below)
5. **Hits review gate**: based on `review_mode`, either auto-advances, pauses for user, or requests external review
6. **Updates intent**: advances `active_stage:` to the next stage
7. If mode is continuous and review gate passes, automatically begins next stage

If all stages are complete, transitions to delivery.

#### `/haiku:autopilot` — Fully Autonomous

Same as `/haiku:run` but in continuous mode with all review gates set to `auto` (overrides `ask` and `external` to `auto`). The agent drives everything. The user reviews the final deliverable.

This replaces the old `/ai-dlc:autopilot` behavior but through the stage pipeline rather than a monolithic elaborate -> execute cycle.

### The Stage Loop

Every stage runs the same internal loop regardless of studio or domain:

```
STAGE LOOP:
  1. PLAN phase
     - Load stage STAGE.md (hats, inputs, guidance)
     - Load output definitions from outputs/ directory (scope, format, location)
     - Resolve qualified inputs: for each {stage, output} pair in inputs list,
       look up the producing stage's output definition and read from its
       persisted location
     - Load ALL resolved input artifacts as context for decomposition
     - If stage has units already (from a prior run): resume
     - If no units: decompose work into units with criteria
       - Uses existing elaborate sub-skills: gather, discover, decompose, criteria
       - Sub-skills are parameterized by the stage definition and resolved inputs
     - For each unit, populate its ## References section with the specific
       artifacts that unit's builder will need (subset of resolved inputs)
     - Build dependency graph (DAG)

  2. BUILD phase
     - For each unit in dependency order:
       - For each hat in the stage's hat sequence:
         - Load hat guidance from STAGE.md ## {hat-name} section
         - Load the unit's ## References (NOT the full stage input set)
         - Execute hat (build, review, etc.)
         - Run quality gates (if configured)
       - Check unit completion criteria
       - If criteria met: mark done, advance to next unit
       - If criteria not met: another bolt cycle

  NOTE: The full stage input set is loaded ONLY during the plan phase.
  During the build phase, each unit's ## References section declares the
  specific artifacts the builder needs. This prevents context bloat —
  a stage might declare 5 inputs, but a given unit only needs 2 of them.

  3. ADVERSARIAL REVIEW phase
     - Run the stage's final hat(s) as adversarial reviewers
     - Check all units in the stage meet criteria
     - Verify all required outputs are produced
     - Produce review summary

  4. OUTPUT PERSISTENCE
     - For each output definition in outputs/:
       - Write the output to its scope-based location:
         - project → .haiku/knowledge/{name}.md
         - intent → .haiku/intents/{name}/knowledge/{name}.md
         - stage → .haiku/intents/{name}/stages/{stage}/{name}
         - repo → project source tree (already written during build)

  5. REVIEW GATE
     - auto: advance to next stage immediately
     - ask: pause, present summary, wait for user approval
     - external: create PR or review request, wait for external approval
```

### Mapping Existing Sub-Skills to Plan Phase

The plan phase reuses existing elaborate sub-skills, parameterized by stage context:

| Existing Sub-Skill | Plan Phase Role | Stage Parameterization |
|--------------------|-----------------|-----------------------|
| gather | Collect context and requirements | Stage's qualified `inputs` list drives what to gather (resolved from producing stage's output locations) |
| discover | Explore codebase / problem space | Stage body provides exploration focus |
| decompose | Break work into units | Stage's hat list and `outputs/` definitions guide decomposition |
| criteria | Define completion criteria | Stage's `## Criteria Guidance` section |
| dag | Build dependency graph | Unit dependencies within the stage |
| design-direction | Visual direction (design stage) | Only runs if stage has design-format outputs |
| wireframes | Wireframe exploration | Only runs if stage includes designer hat |

Sub-skills that are irrelevant to a stage are skipped. The stage's `outputs/` directory determines which sub-skills activate (e.g., design-format outputs trigger design sub-skills).

### Mapping Existing Execute to Build Phase

The build phase reuses the existing execute loop:

| Existing Execute Concept | Build Phase Equivalent |
|-------------------------|----------------------|
| Hat sequence from workflow | Hat sequence from STAGE.md `hats:` field |
| Hat instructions from `plugin/hats/*.md` | Hat instructions from STAGE.md `## {hat-name}` body |
| Input loading per hat | Unit's `## References` section (NOT full stage inputs) |
| Bolt cycle | Same — iterate hats until criteria met |
| Quality gates | Same — run between build and review hats |
| Criteria check | Same — hard-gated on unit criteria |
| Advance logic | Same — advance when all criteria met |

### State Tracking

Update `plugin/lib/state.sh` (or add to `plugin/lib/orchestrator.sh`):

```bash
# Track stage completion status
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

# Get all units for a specific stage
hku_stage_units() {
  local intent_dir="$1"
  local stage_name="$2"
  # Returns: unit file paths tagged with this stage
}
```

### What Gets Removed/Deprecated

- `/haiku:elaborate` — still exists but becomes an alias that runs the plan phase of the current stage
- `/haiku:execute` — still exists but becomes an alias that runs the build phase of the current stage
- The elaborate/execute split as a user mental model — users think in stages, not phases

### Backward Compatibility

- `/haiku:elaborate` and `/haiku:execute` continue to work as aliases
- Intents created before this change (no `studio:` field) default to software studio, continuous mode
- The stage loop for a single-studio, auto-review-gate setup behaves identically to the old elaborate -> execute flow

## Success Criteria

- [ ] `/haiku:new` skill exists and creates intents with studio, stages, active_stage, and mode
- [ ] `/haiku:new` correctly detects studio from settings and resolves stage list
- [ ] `/haiku:run` skill exists and advances through stages
- [ ] `/haiku:run` with explicit stage argument runs that specific stage
- [ ] `/haiku:run` without stage argument auto-advances to next incomplete stage
- [ ] `/haiku:autopilot` skill exists and overrides all review gates to auto
- [ ] The stage loop correctly executes: plan -> build -> adversarial review -> output persistence -> gate
- [ ] Plan phase resolves qualified inputs (stage + output pairs) from STAGE.md frontmatter
- [ ] Plan phase loads all resolved input artifacts as context for decomposition
- [ ] Plan phase populates each unit's `## References` section with the specific artifacts needed
- [ ] Plan phase reuses existing elaborate sub-skills parameterized by stage and resolved inputs
- [ ] Build phase reads each unit's `## References` (not the full stage input set) for builder context
- [ ] Build phase reuses existing execute bolt loop with hats from STAGE.md
- [ ] Output persistence writes each output to its scope-based location (project/intent/stage/repo)
- [ ] Adversarial review verifies all required outputs are produced
- [ ] Review gates behave correctly: auto advances, ask pauses, external creates review
- [ ] State tracking correctly reports stage status
- [ ] `/haiku:elaborate` and `/haiku:execute` work as backward-compat aliases
- [ ] Intents without `studio:` field default to software studio

## Risks

- **Orchestrator complexity**: The stage loop is the most complex new code. Mitigation: decompose into small functions (plan, build, review, gate) that compose.
- **Sub-skill parameterization**: Existing sub-skills were written for a single monolithic elaboration. They need to accept stage context cleanly. Mitigation: pass stage metadata as environment/arguments, don't require sub-skill rewrites.
- **State corruption**: Stage transitions update frontmatter. Concurrent runs could corrupt. Mitigation: lock intent file during stage transitions (existing state.sh pattern).
- **Alias confusion**: Users familiar with elaborate/execute may be confused by the aliases. Mitigation: aliases print a deprecation notice pointing to `/haiku:run`.

## Boundaries

This unit creates the orchestrator skills and loop logic. It does NOT create stage content (unit-05), remove old hats/workflows (unit-07), or implement persistence adapters (unit-08). It assumes stage STAGE.md files already exist and are well-formed.
