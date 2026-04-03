---
description: Advance an H·AI·K·U intent through its next stage
user-invocable: true
argument-hint: "[intent-slug] [stage-name]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Agent
  - Skill
  - Task
  - AskUserQuestion
  - ToolSearch
  - ListMcpResourcesTool
  - ReadMcpResourceTool
  # MCP read-only patterns
  - "mcp__*__read*"
  - "mcp__*__get*"
  - "mcp__*__list*"
  - "mcp__*__search*"
  - "mcp__*__query*"
  - "mcp__*__resolve*"
  - "mcp__*__fetch*"
  - "mcp__*__lookup*"
  - "mcp__*__analyze*"
  - "mcp__*__memory"
  # Ticketing provider write tools
  - "mcp__*__create*issue*"
  - "mcp__*__create*ticket*"
  - "mcp__*__update*issue*"
  - "mcp__*__update*ticket*"
  - "mcp__*__add*comment*"
---

# H·AI·K·U Run

## Name

`haiku:run` - Advance an H·AI·K·U intent through its next stage.

## Synopsis

```
/haiku:run [intent-slug] [stage-name]
```

## Description

**User-facing command** - Resolves the active intent and stage, then runs the full stage loop: plan → build → adversarial review → output persistence → review gate.

**Modes:**
- `/haiku:run` — Find active intent, run its next stage
- `/haiku:run my-feature` — Run the next stage for a specific intent
- `/haiku:run my-feature inception` — Run a specific stage for a specific intent

---

## Pre-checks

1. **Reject cowork mode:**
   ```bash
   if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
     echo "ERROR: /haiku:run cannot run in cowork mode."
     exit 1
   fi
   ```

2. **Context window preflight:** Same as execute — verify sufficient context remains for meaningful work.

---

## Implementation

### Step 1: Resolve Intent

```bash
source "$CLAUDE_PLUGIN_ROOT/lib/state.sh"
source "$CLAUDE_PLUGIN_ROOT/lib/orchestrator.sh"
```

- If slug provided: find `.haiku/intents/{slug}/intent.md`
- If no slug: find active intent via `hku_find_active_intent`
- If no active intent found: error, suggest `/haiku:new`

Read the intent file and extract frontmatter: `studio`, `stages`, `active_stage`, `mode`.

### Step 2: Determine Stage

**If stage argument given:** Validate it's in the studio's stage list, run that specific stage.

**If intent has `mode: continuous`:** Collapse all stages into a single merged flow. This means:
- Union all stage `unit_types`
- Concatenate all criteria guidance
- Union all outputs
- Run one plan→build→review cycle (functionally identical to old elaborate→execute)
- The plan phase uses the first stage's hats by default, but loads context from all stages

**If intent has `mode: discrete`:** Read `active_stage:` from intent frontmatter. Run that stage.

### Step 3: Load Stage Definition

```bash
local stage_file=$(hku_resolve_stage "$stage_name" "$studio_name")
local metadata=$(hku_load_stage_metadata "$stage_name" "$studio_name")
```

### Step 4: Run Stage Loop

The stage loop has five phases. Each phase prepares data via orchestrator.sh functions, then the SKILL.md instructions drive agent behavior.

#### Phase 1: Plan

Source orchestrator.sh to load stage metadata, resolved inputs, and output definitions:
```bash
hku_run_plan_phase "$intent_dir" "$stage_name" "$studio_name"
```

This emits structured context. Use it to drive the plan:

1. **Load ALL resolved input artifacts as context** — Read each file path from the resolved inputs.
2. **If stage has existing units:** Resume — skip to Phase 2 (build).
3. **If no units exist:** Run elaboration sub-skills parameterized by stage context:
   - **gather** — Stage inputs drive what to gather
   - **discover** — Stage body provides exploration focus
   - **decompose** — Stage `unit_types` and `outputs/` guide decomposition
   - **criteria** — Stage `## Criteria Guidance` section
   - **dag** — Unit dependencies within the stage
   - **design-direction** / **wireframes** — Only if stage has design-format outputs or a designer hat

4. For each unit, populate `## References` with specific artifacts needed (subset of resolved inputs).
5. Write units to `.haiku/intents/{slug}/stages/{stage}/units/`.

#### Phase 2: Build

For each unit in DAG order:

1. For each hat in STAGE.md `hats:` sequence:
   a. Load hat guidance from STAGE.md `## {hat-name}` section
   b. Load unit's `## References` (NOT full stage inputs — only what this unit needs)
   c. Execute hat (build, review, etc.)
   d. Run quality gates:
      ```bash
      source "$CLAUDE_PLUGIN_ROOT/lib/config.sh"
      run_quality_gates
      ```
2. Check unit completion criteria — all checkboxes must be checked
3. If criteria met: mark done, advance to next unit
4. If not met: another bolt cycle (increment iteration, retry)

**CRITICAL: No questions during build.** The build phase is fully autonomous. If you encounter ambiguity, make a reasonable decision based on available context. Document assumptions in the unit's `## Notes` section.

#### Phase 3: Adversarial Review

```bash
hku_run_adversarial_phase "$intent_dir" "$stage_name"
```

- Run adversarial review on all stage units
- Verify all required outputs are produced
- Verify all completion criteria are checked
- Produce a review summary

If issues are found, return to Phase 2 for targeted fixes.

#### Phase 4: Output Persistence

```bash
hku_persist_stage_outputs "$intent_dir" "$stage_name" "$studio_name"
```

Write stage outputs to their scope-based locations:
- `project` scope → `.haiku/knowledge/{name}.md`
- `intent` scope → `.haiku/intents/{slug}/knowledge/{name}.md`
- `stage` scope → `.haiku/intents/{slug}/stages/{stage}/{name}`
- `repo` scope → Already written during build (no-op)

#### Phase 5: Review Gate

```bash
hku_resolve_review_gate "$intent_dir" "$stage_name" "$studio_name" "$autopilot"
```

Gate resolution based on STAGE.md `review:` field:
- **`auto`** (return 0): Advance to next stage automatically
- **`ask`** (return 1): Pause, present summary, wait for user approval via `AskUserQuestion`
- **`external`** (return 2): Create PR or review request, block until resolved

### Step 5: Stage Complete

Update `active_stage:` in intent frontmatter to the next stage:
```bash
local next=$(hku_advance_stage "$intent_dir")
```

Commit stage results:
```bash
git add .haiku/intents/{slug}/stages/{stage_name}/
git commit -m "haiku: complete stage — {stage_name}"
```

### Step 6: Continue or Finish

**If continuous mode and gate passed:** Automatically begin the next stage (loop back to Step 2).

**If discrete mode:** Report completion and tell the user to run `/haiku:run` for the next stage.

**If all stages complete:**
```
All stages complete for intent: {slug}
Studio: {studio_name}

Ready for delivery. Run /haiku:review to verify, then create a PR.
```

---

## Continuous Mode Collapse

When `mode: continuous`, the run skill behaves like the old elaborate→execute flow:

1. Load ALL stages from the studio
2. Merge their metadata:
   - `hats:` — Use first stage with hats defined (typically inception)
   - `unit_types:` — Union of all stages
   - `outputs/` — Union of all stages
   - `review:` — Use the most restrictive gate across all stages
3. Run a single plan→build→review cycle
4. All outputs written to `.haiku/intents/{slug}/knowledge/` (intent scope)

This ensures backward compatibility with existing workflows.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No active intent | Error: "No active intent found. Run /haiku:new first." |
| Invalid stage name | Error: "Stage '{name}' not found in studio '{studio}'" |
| Cowork mode | Error: "Cannot run in cowork mode" |
| Stage already complete | Skip to next incomplete stage |
| All stages complete | Report completion, suggest delivery |
| Quality gate failure | Retry bolt cycle (up to 3 attempts), then pause |
| External gate | Block, create review request |

---

## Relationship to Other Skills

- **`/haiku:new`** — Creates the intent that `/haiku:run` advances
- **`/haiku:autopilot`** — Calls `/haiku:new` then `/haiku:run` with autopilot gates
- **`/haiku:elaborate`** — Deprecated alias that delegates to `/haiku:run` plan phase
- **`/haiku:execute`** — Deprecated alias that delegates to `/haiku:run` build phase
- **`/haiku:advance`** — Still used internally for unit-level advancement within build phase
