---
description: Refine intent, unit, or upstream stage outputs mid-execution without losing progress
argument-hint: "[unit-slug | stage:<stage-name>]"
---

# H·AI·K·U Refine

You are refining an H·AI·K·U artifact mid-execution. Your job is to amend specs without destroying in-flight progress. Supports three targets: intent-level specs, specific units, and **upstream stage outputs** (stage-scoped refinement).

---

## Pre-check: Reject Cowork Mode

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /haiku:refine cannot run in cowork mode."
  echo "Run this in a full Claude Code CLI session."
  exit 1
fi
```

If `CLAUDE_CODE_IS_COWORK=1`, stop immediately with the message above. Do NOT proceed.

---

## Step 1: Load Intent State

```bash
# Intent-level state is stored on current branch (intent branch)
# Intent slug is derived from .haiku directory structure
INTENT_SLUG=$(basename "$(find .haiku -maxdepth 2 -name 'intent.md' -exec dirname {} \; | head -1)")
INTENT_DIR=".haiku/intents/${INTENT_SLUG}"
STATE=$(haiku_stage_get { intent, stage, field: "phase" })
INTENT_DIR=".haiku/intents/${INTENT_SLUG}"
```

If no state exists:
```
No H·AI·K·U state found. Run /haiku:elaborate to start a new task.
```

If status is "completed":
```
Intent is already complete. Run /haiku:elaborate to start a new task.
```

---

## Step 2: Determine Refinement Target

**If argument starts with `stage:`** (e.g., `stage:design`): target that stage for stage-scoped refinement. Skip to Step 3b.

**If argument is a unit slug**: target that unit directly.

**If no argument provided**, ask what to refine:

```json
{
  "questions": [{
    "question": "What would you like to refine?",
    "header": "Target",
    "options": [
      {"label": "Intent-level spec", "description": "Refine problem statement, solution approach, domain model, or intent-level success criteria"},
      {"label": "Specific unit", "description": "Refine a specific unit's spec, criteria, or boundaries"},
      {"label": "Upstream stage output", "description": "Add or update an output from a prior stage (e.g., add a missing design screen)"}
    ],
    "multiSelect": false
  }]
}
```

If "Upstream stage output" is selected, list completed and in-progress stages and ask which one to refine.

If "Specific unit" is selected, list available units and ask which one:

```bash
# List all units
for unit_file in "$INTENT_DIR"/stages/*/units/unit-*.md; do
  [ -f "$unit_file" ] || continue
  unit_name=$(basename "$unit_file" .md)
  unit_name=$(basename "$unit_file" .md)
  stage_name=$(basename "$(dirname "$(dirname "$unit_file")")")
  status=$(haiku_unit_get { intent: "$INTENT_SLUG", stage: "$stage_name", unit: "$unit_name", field: "status" } 2>/dev/null || echo "pending")
  echo "- **${unit_name}** (${status})"
done
```

Use `AskUserQuestion` with the unit list as options.

---

## Step 3: Display Current Artifact

Read and display the full contents of the target artifact:

### If intent-level:
```bash
cat "$INTENT_DIR/intent.md"
```

Display the full file contents in a markdown code block so the user can see exactly what exists.

### If unit-level:
```bash
cat "$INTENT_DIR/${UNIT_NAME}.md"
```

Display the full file contents in a markdown code block.

---

## Step 3b: Stage-Scoped Refinement

When the target is an upstream stage, the goal is to add or update a **specific output** from that stage without re-running the entire stage.

1. **Load the target stage's definition:**
   ```bash
   source "$CLAUDE_PLUGIN_ROOT/lib/stage.sh"
   local metadata=$(haiku_stage_get { intent: "$INTENT_SLUG", stage: "$TARGET_STAGE", field: "metadata" })
   ```

2. **Show existing stage outputs:**
   List the stage's completed units and their outputs. Show what already exists so the user/agent can identify what's missing.

3. **Create a targeted unit** in the upstream stage:
   - Write a new unit file to `.haiku/intents/{slug}/stages/{target-stage}/units/`
   - The unit describes only the new/updated output (e.g., "Design screen for feature X")
   - Mark it `status: pending`

4. **Run the upstream stage's hats for this unit only:**
   - Load the target stage's hat sequence
   - Execute each hat for the new unit (bolt loop)
   - Run quality gates
   - Do NOT re-run existing completed units in that stage

5. **Persist the updated output:**
   ```bash
   haiku_stage_set { intent: "$INTENT_SLUG", stage: "$TARGET_STAGE", field: "outputs_persisted", value: "true" }
   ```

6. **Return to the current stage:**
   - The current stage's decomposition or execution can now reference the new/updated upstream output
   - Do NOT change `active_stage` — the upstream refinement is a scoped side-trip

7. **Commit:**
   ```bash
   git add "$INTENT_DIR/stages/$TARGET_STAGE/"
   git commit -m "refine: add output to ${TARGET_STAGE} stage for ${INTENT_SLUG}"
   ```

**This can be invoked by the agent autonomously** during decomposition (step 4.1 of the stage loop) when a gap is detected, or by the user explicitly via `/haiku:refine stage:<name>`. When invoked by the agent, it should still surface what it's doing:

```
Gap detected: development stage needs a design for screen X, but design stage output doesn't include it.
Running targeted refinement on the design stage to add this screen.
```

After stage-scoped refinement completes, skip to Step 7 (Handoff).

---

## Step 4: Collaborate on Amendments

Work with the user to identify what needs to change. Use `AskUserQuestion` to focus the refinement:

```json
{
  "questions": [{
    "question": "What aspects need refinement?",
    "header": "Aspects",
    "options": [
      {"label": "Success criteria", "description": "Add, remove, or modify success criteria"},
      {"label": "Technical specification", "description": "Change implementation approach or technical details"},
      {"label": "Boundaries", "description": "Adjust what's in or out of scope"},
      {"label": "Domain model", "description": "Update entities, relationships, or data sources"}
    ],
    "multiSelect": true
  }]
}
```

For each selected aspect:
1. Show the current content for that section
2. Ask the user what should change
3. Confirm the updated content before writing

**CRITICAL:** Preserve all frontmatter fields (status, depends_on, branch, discipline, ticket, etc.) when rewriting files. Only modify the content sections being refined.

---

## Step 5: Write Updated Artifact

Write the updated artifact back to the file:

```bash
# Write updated file (preserving frontmatter)
# Commit the change
git add "$INTENT_DIR/"
git commit -m "refine: update ${TARGET} spec for ${INTENT_SLUG}"
```

---

## Step 6: Re-queue Affected Units

Determine which units need to be re-processed based on the scope of changes.

### If intent-level change:

Ask the user which units are affected:

```json
{
  "questions": [{
    "question": "Which units are affected by this intent-level change?",
    "header": "Affected",
    "options": [
      {"label": "All units", "description": "Re-queue all non-completed units"},
      {"label": "Let me choose", "description": "Select specific units to re-queue"}
    ],
    "multiSelect": false
  }]
}
```

For each affected unit:
1. Read the unit file
2. Set `status: pending` in frontmatter
3. Write the updated file

Update state:
- For each affected unit, reset `hat` to the first hat in its stage (in unit frontmatter)
- The current unit tracking is managed by stage state via MCP tools

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/hat.sh"

# Re-queue affected units and reset hat tracking in frontmatter
ACTIVE_STAGE=$(haiku_intent_get { slug, field: "active_stage" } 2>/dev/null || echo "development")
STUDIO=$(haiku_intent_get { slug, field: "studio" } 2>/dev/null || echo "software")
FIRST_HAT=$(hku_get_hat_sequence "$ACTIVE_STAGE" "$STUDIO" | awk '{print $1}')
[ -z "$FIRST_HAT" ] && FIRST_HAT="planner"

for unit_file in $AFFECTED_UNITS; do
  UNIT_NAME=$(basename "$unit_file" .md)
  update_unit_status "$unit_file" "pending"
  haiku_unit_advance_hat { intent: "$INTENT_SLUG", stage: "$ACTIVE_STAGE", unit: "$UNIT_NAME", hat: "${FIRST_HAT}" }
done

git add "$INTENT_DIR/"
git commit -m "refine: re-queue affected units for ${INTENT_SLUG}"
```

### If unit-level change:

Re-queue only the target unit:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/hat.sh"

# Re-queue the specific unit
update_unit_status "$INTENT_DIR/${UNIT_NAME}.md" "pending"

# Reset hat tracking in unit frontmatter
ACTIVE_STAGE=$(haiku_intent_get { slug, field: "active_stage" } 2>/dev/null || echo "development")
STUDIO=$(haiku_intent_get { slug, field: "studio" } 2>/dev/null || echo "software")
FIRST_HAT=$(hku_get_hat_sequence "$ACTIVE_STAGE" "$STUDIO" | awk '{print $1}')
[ -z "$FIRST_HAT" ] && FIRST_HAT="planner"
haiku_unit_advance_hat { intent: "$INTENT_SLUG", stage: "$ACTIVE_STAGE", unit: "$UNIT_NAME", hat: "${FIRST_HAT}" }

git add "$INTENT_DIR/"
git commit -m "refine: re-queue ${UNIT_NAME} for ${INTENT_SLUG}"
```

**Note:** Units that are already completed and unaffected by the change stay completed. Only re-queue units that are directly impacted.

If the integrator had completed, reset it since the spec has changed:

```
haiku_stage_set { intent: INTENT_SLUG, stage: ACTIVE_STAGE, field: "integrator_complete", value: "false" }
```

---

## Step 7: Handoff

Tell the user:

```
Refinement complete!

Updated: {target artifact}
Re-queued units: {list of re-queued units}
Unaffected units: {list of units that stay completed}

To resume the build loop:
  /haiku:execute
```
