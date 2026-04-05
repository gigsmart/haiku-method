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

**User-facing command** — Resolves the active intent and runs it through the studio's stage sequence. Each stage executes a full cycle: decompose units → execute hats per unit (bolt loop) → adversarial review → persist outputs → review gate.

**Usage:**
- `/haiku:run` — Find active intent, run its current stage
- `/haiku:run my-feature` — Run the current stage for a specific intent
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

Use the MCP tools to find and read the active intent:

```
haiku_intent_list → find active intent(s)
haiku_intent_get { slug, field: "studio" }
haiku_intent_get { slug, field: "active_stage" }
haiku_intent_get { slug, field: "mode" }
```

- If slug provided: read that intent directly
- If no slug: `haiku_intent_list` and pick the active one
- If no active intent found: error, suggest `/haiku:new`

### Step 2: Determine Stage

**Check for composite intent:** If the intent frontmatter has a `composite:` field, this is a composite intent with multiple studios running in parallel. Go to **Step 2c**.

**If stage argument given:** Validate it's in the studio's stage list, use that stage.

**Otherwise:** Read `active_stage:` from intent frontmatter. If empty or missing, default to the studio's first stage. If the current stage is already complete, advance to the next stage via `hku_next_stage`.

Both continuous and discrete modes run the **same stage loop** (Step 4). The difference is what happens at the review gate (Step 6).

### Step 2c: Composite Intent Orchestration

A composite intent runs stages from multiple studios in parallel with sync points:

```yaml
# intent.md
composite:
  - studio: software
    stages: [inception, design, development]
  - studio: marketing
    stages: [research, strategy, content, launch]
sync:
  - wait: [software:development, marketing:content]
    then: [marketing:launch]
```

**Execution model:**

1. **Track per-studio active stages** — each studio in the composite has its own `active_stage`. Stored in intent frontmatter as:
   ```yaml
   composite_state:
     software: design      # currently at design stage
     marketing: strategy   # currently at strategy stage
   ```

2. **Find runnable stages** — for each studio, check if its current stage is ready to run:
   - Stage has no sync dependency → runnable
   - Stage has sync dependency → check if all `wait` stages are complete

3. **Run the first runnable stage** — load stage definition from the appropriate studio, run the standard stage loop (Step 4). The stage's hats, review agents, inputs, and outputs all come from its studio definition.

4. **On stage completion** — advance that studio's `active_stage`. Then check if any sync-blocked stages are now unblocked.

5. **Sync point check:**
   ```bash
   # For each sync rule:
   for sync_rule in $(echo "$intent_data" | jq -c '.sync[]'); do
     wait_stages=$(echo "$sync_rule" | jq -r '.wait[]')
     all_complete=true
     for ws in $wait_stages; do
       studio="${ws%%:*}"
       stage="${ws##*:}"
       state=$(echo "$intent_data" | jq -r ".composite_state.\"$studio\"")
       # Check if this studio has advanced past this stage
       # (its active_stage index is beyond this stage's index)
       if ! stage_is_complete "$studio" "$stage" "$state"; then
         all_complete=false
         break
       fi
     done
     if [ "$all_complete" = "true" ]; then
       # The 'then' stages are now unblocked
       echo "Sync point cleared: $(echo "$sync_rule" | jq -r '.then[]') now runnable"
     fi
   done
   ```

6. **Intent complete** when all studios have completed all their stages.

**Example flow for a product launch:**
```
Parallel track 1: software:inception → software:design → software:development
Parallel track 2: marketing:research → marketing:strategy → marketing:content
                                                              ↓
                                              SYNC: wait for software:development
                                              AND marketing:content
                                                              ↓
                                              marketing:launch (runs after both complete)
```

After Step 2c determines the stage and studio to run, execution continues with Step 3 (Load Stage Definition) as normal. The stage loop is identical — only the orchestration of *which* stage to run next is different.

### Step 3: Load Stage Definition

Read the stage's STAGE.md from the studio directory for hats, review agents, inputs, and gate type. Then start tracking stage state:

```
haiku_stage_start { intent: slug, stage: stage_name }
→ creates state.json with status: active, phase: decompose, started_at: now
```

### Step 4: Run Stage Loop

Each stage runs a five-step cycle. The orchestrator shell functions prepare data and context; the agent drives behavior based on the stage's definition.

#### 4.1: Decompose — Break the stage into units

Set stage phase to decompose and load context:
```
haiku_stage_set { intent, stage, field: "phase", value: "decompose" }
haiku_unit_list { intent, stage } → check if units already exist
```

This emits structured context. Use it to decompose the stage into units:

1. **Load ALL resolved input artifacts as context** — Read each file path from the resolved inputs. These are outputs from prior stages that feed this one (defined in the stage's `inputs:` field). Check input freshness metadata (`freshness:`, `depends_on_code:`) — if an input is stale or its described code has drifted, surface this and consider a stage-scoped refinement.
2. **If stage has existing units:** Resume — skip to step 4.2 (execute).
3. **If no units exist:** Run elaboration sub-skills parameterized by stage context:
   - **gather** — Stage inputs drive what to gather
   - **discover** — Stage body provides exploration focus
   - **decompose** — Stage `unit_types` and `outputs/` guide decomposition
   - **criteria** — Stage `## Criteria Guidance` section
   - **dag** — Unit dependencies within the stage
   - **design-direction** / **wireframes** — Only if stage has design-format outputs or a designer hat

4. For each unit, populate `## References` with specific artifacts needed (subset of resolved inputs).
5. Write units to `.haiku/intents/{slug}/stages/{stage}/units/`.

**Upstream gap detection:** During decomposition, if you discover that an upstream stage's outputs are insufficient or incorrect for this stage's work (e.g., design brief missing screens that development needs, behavioral spec ambiguous on error handling), invoke a **stage-scoped refinement** via `/haiku:refine stage:{upstream-stage}`:

1. Document the gap: which upstream stage, which output, what is missing or wrong.
2. Surface what you're doing:
   ```
   Gap detected: {current} stage needs {description}, but {upstream} stage output doesn't include it.
   Running targeted refinement on the {upstream} stage to add this.
   ```
3. Invoke the refine skill with `stage:{upstream-stage}` — this creates a targeted unit in the upstream stage, runs it through that stage's hats, and persists the updated output.
4. Continue decomposition with the now-complete upstream inputs.

This is a **scoped side-trip**, not a full stage restart. The current stage's progress is preserved. Only the missing output is added to the upstream stage.

The user can also trigger this explicitly: "add a screen for X" during development causes the agent to refine the design stage to produce that screen, then continue.

**Full stage-backs** (resetting `active_stage` to a prior stage) are always user-initiated. The agent can recommend one if the gap is too large for a scoped refinement, but never autonomously resets stage position.

#### 4.2: Execute — Run the bolt loop per unit

Update stage phase, then for each unit in DAG order, run the **bolt loop**:

```
haiku_stage_set { intent, stage, field: "phase", value: "execute" }
haiku_unit_list { intent, stage } → get units and their status/dependencies
```

For each ready unit (status: pending, all dependencies completed):

1. Start the unit:
   ```
   haiku_unit_start { intent, stage, unit, hat: first_hat }
   ```
2. For each hat in the stage's `hats:` sequence:
   a. Load hat definition from `stages/{stage}/hats/{hat}.md`
   b. Load unit's `## References`
   c. Execute the hat's work
   d. Advance to next hat:
      ```
      haiku_unit_advance_hat { intent, stage, unit, hat: next_hat }
      ```
3. Check unit completion criteria — all checkboxes must be checked
4. If criteria met:
   ```
   haiku_unit_complete { intent, stage, unit }
   ```
5. If not met — increment bolt and retry:
   ```
   haiku_unit_increment_bolt { intent, stage, unit }
   haiku_unit_advance_hat { intent, stage, unit, hat: first_hat }
   ```

**CRITICAL: No questions during execution.** The bolt loop is fully autonomous. If you encounter ambiguity, make a reasonable decision based on available context. Document assumptions in the unit's `## Notes` section.

#### 4.3: Adversarial Review — Verify stage completeness

```
haiku_stage_set { intent, stage, field: "phase", value: "review" }
```

1. **Load review agents** from two sources:
   - The stage's own `review-agents/` directory (all `.md` files)
   - Any agents declared in the stage's `review-agents-include:` frontmatter (resolved from other stages)
   ```bash
   local stage_dir=$(hku_resolve_stage "$stage_name" "$studio_name" | sed 's/STAGE.md$//')
   # Own agents
   local own_agents="${stage_dir}review-agents/"
   # Included agents from other stages
   local includes=$(echo "$metadata" | jq -c '.["review-agents-include"] // []')
   ```
   Each `.md` file defines a specialized adversarial agent with a mandate and checklist. Included agents run with the same authority as the stage's own agents.

2. **Spawn one subagent per review agent file**, in parallel. Each agent receives:
   - The review agent's mandate and checklist (from the `.md` file body)
   - The stage's unit files and outputs as context
   - The diff of all changes made during this stage

3. **Collect findings** from each agent. Each finding includes: severity (HIGH/MEDIUM/LOW), file, description, and suggested fix.

4. **Verify structural completeness:**
   - All units have completion criteria checked
   - All required outputs defined in the stage's `outputs/` are produced

5. **If HIGH findings exist:** return to step 4.2 for targeted fixes (up to 3 cycles).

6. **If no HIGH findings:** produce a review summary and proceed.

#### 4.4: Output Persistence — Write outputs to scoped locations

```
haiku_stage_set { intent, stage, field: "phase", value: "persist" }
```
Write stage outputs to their scope-based locations. Use `haiku_knowledge_write` for intent-scoped outputs.

Write stage outputs to their scope-based locations:
- `project` scope → `.haiku/knowledge/{name}.md`
- `intent` scope → `.haiku/intents/{slug}/knowledge/{name}.md`
- `stage` scope → `.haiku/intents/{slug}/stages/{stage}/{name}`
- `repo` scope → Already written during execution (no-op)

#### 4.5: Review Gate — Determine stage transition

```
haiku_stage_set { intent, stage, field: "phase", value: "gate" }
haiku_stage_set { intent, stage, field: "gate_entered_at", value: now }
```

Gate resolution based on the stage's `review:` field in STAGE.md:
- **`auto`** (return 0): Stage passes — advance to next stage
- **`ask`** (return 1): Pause, present stage summary, wait for user approval via `AskUserQuestion`
- **`external`** (return 2): Push branch and create PR/MR for external review, block until resolved
- **`await`** (return 3): Stage work is complete but an external event must occur before advancing (e.g., customer response, CI result, stakeholder decision). Record what is being awaited and block. The user resumes with `/haiku:run` when the event has occurred.

**Gate protocol:** If the stage defines `gate-protocol:` in its STAGE.md frontmatter, apply these additional behaviors:
- **`timeout`**: If the gate has been entered for longer than the specified duration (e.g., `48h`, `7d`), execute the `timeout-action`
- **`timeout-action`**: `escalate` (notify via the provider specified in `escalation`), `auto-advance` (skip the gate), or `block` (keep waiting, default)
- **`conditions`**: Pre-conditions that must be true before the gate can pass (e.g., "no HIGH findings from review agents")

Timeout checking is performed by `/haiku:triggers` during scheduled polling, not inline during `/haiku:run`. The run skill records `gate_entered_at` — the trigger skill checks elapsed time.

### Step 5: Advance Stage

Once the review gate passes (immediately for `auto`, after approval for `ask`, after external review for `external`), advance to the next stage:

```
haiku_stage_complete { intent, stage, gate_outcome: "advanced" }
haiku_intent_set { slug, field: "active_stage", value: next_stage }
```

Commit the stage's artifacts:
```bash
git add .haiku/intents/{slug}/stages/{stage_name}/
git commit -m "haiku: complete stage — {stage_name}"
```

### Step 6: Continue or Finish

**If all stages complete:**
```
All stages complete for intent: {slug}
Studio: {studio_name}

Ready for delivery. Run /haiku:review to verify, then create a PR.
```

**If the review gate passed (return 0 — `auto`):**
- **Continuous mode:** Advance `active_stage` and loop back to Step 2 to run the next stage.
- **Discrete mode:** Report stage completion and tell the user to run `/haiku:run` for the next stage.

**If the review gate returned `ask` (return 1):**
- Present a stage summary and wait for user approval via `AskUserQuestion`.
- On approval: advance `active_stage`.
  - **Continuous mode:** Loop back to Step 2.
  - **Discrete mode:** Report completion, tell the user to run `/haiku:run`.

**If the review gate returned `external` (return 2):**
- Push the current branch and create a PR/MR for the stage's work.
- Block until the external review is resolved.
- On resolution: advance `active_stage`.
  - **Continuous mode:** Loop back to Step 2.
  - **Discrete mode:** Report completion, tell the user to run `/haiku:run`.

**If the review gate returned `await` (return 3):**
- The stage's work is complete, but an external event must occur before the intent can advance.
- Present what is being awaited:
  ```
  Stage "{stage}" complete. Awaiting external event before advancing:
  {description of what the stage is waiting for — from the stage's ## Await Condition section or inferred from the stage's outputs}

  When the event has occurred, run /haiku:run to continue.
  ```
- Save the await state to the intent's state directory.
- Block. The intent stays at this stage until the user explicitly runs `/haiku:run`.
- On resumption: the user confirms the event occurred, then advance `active_stage`.
  - **Continuous mode:** Loop back to Step 2.
  - **Discrete mode:** Report completion, tell the user to run `/haiku:run`.

---

## Continuous vs Discrete Mode

Both modes run the same stage loop. The difference is **what happens after a review gate passes.**

| Behavior | Continuous | Discrete |
|---|---|---|
| Stage sequence | Same — follows studio's `stages:` list in order | Same |
| Stage loop (decompose→execute→review→persist→gate) | Same | Same |
| Review gate `auto` | Advance and run next stage automatically | Stop, tell user to run `/haiku:run` |
| Review gate `ask` | Pause for user approval, then advance and continue | Pause for user approval, then stop |
| Review gate `external` | Push for external review, block until resolved, then advance and continue | Push for external review, block until resolved, then stop |
| Review gate `await` | Block until external event occurs, then advance and continue | Block until external event occurs, then stop |

**Continuous mode never skips or collapses stages.** Every stage runs its own decompose, execute, adversarial review, output persistence, and review gate cycle. The stage's hats, unit types, inputs, and outputs are always scoped to that stage's definition. Continuous mode simply controls whether the agent automatically proceeds to the next stage or hands control back to the user.

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
