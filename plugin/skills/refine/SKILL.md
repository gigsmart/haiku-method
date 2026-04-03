---
description: Refine intent or unit specs mid-execution without losing progress
argument-hint: "[unit-slug]"
---

# H·AI·K·U Refine

You are refining an H·AI·K·U intent or unit specification mid-execution. Your job is to collaborate with the user to amend specs without destroying in-flight progress.

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
STATE=$(hku_state_load "$INTENT_DIR" "iteration.json")
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

If an argument was provided (unit slug), target that unit directly.

If no argument provided, ask what to refine:

```json
{
  "questions": [{
    "question": "What would you like to refine?",
    "header": "Target",
    "options": [
      {"label": "Intent-level spec", "description": "Refine problem statement, solution approach, domain model, or intent-level success criteria"},
      {"label": "Specific unit", "description": "Refine a specific unit's spec, criteria, or boundaries"}
    ],
    "multiSelect": false
  }]
}
```

If "Specific unit" is selected, list available units and ask which one:

```bash
# List all units
for unit_file in "$INTENT_DIR"/stages/*/units/unit-*.md; do
  [ -f "$unit_file" ] || continue
  unit_name=$(basename "$unit_file" .md)
  status=$(hku_frontmatter_get "status" "$unit_file" 2>/dev/null || echo "pending")
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
- Clear `currentUnit` in iteration.json

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/hat.sh"

# Re-queue affected units and reset hat tracking in frontmatter
ACTIVE_STAGE=$(hku_frontmatter_get "active_stage" "$INTENT_DIR/intent.md" 2>/dev/null || echo "development")
STUDIO=$(hku_frontmatter_get "studio" "$INTENT_DIR/intent.md" 2>/dev/null || echo "software")
FIRST_HAT=$(hku_get_hat_sequence "$ACTIVE_STAGE" "$STUDIO" | awk '{print $1}')
[ -z "$FIRST_HAT" ] && FIRST_HAT="planner"

for unit_file in $AFFECTED_UNITS; do
  update_unit_status "$unit_file" "pending"
  hku_frontmatter_set "hat" "${FIRST_HAT}" "$unit_file"
done

# Clear currentUnit in iteration.json
STATE=$(echo "$STATE" | hku_json_set "currentUnit" "")
hku_state_save "$INTENT_DIR" "iteration.json" "$STATE"

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
ACTIVE_STAGE=$(hku_frontmatter_get "active_stage" "$INTENT_DIR/intent.md" 2>/dev/null || echo "development")
STUDIO=$(hku_frontmatter_get "studio" "$INTENT_DIR/intent.md" 2>/dev/null || echo "software")
FIRST_HAT=$(hku_get_hat_sequence "$ACTIVE_STAGE" "$STUDIO" | awk '{print $1}')
[ -z "$FIRST_HAT" ] && FIRST_HAT="planner"
hku_frontmatter_set "hat" "${FIRST_HAT}" "$INTENT_DIR/${UNIT_NAME}.md"

# Clear currentUnit if it matches
CURRENT_UNIT=$(echo "$STATE" | hku_json_get "currentUnit" "")
if [ "$CURRENT_UNIT" = "$UNIT_NAME" ]; then
  STATE=$(echo "$STATE" | hku_json_set "currentUnit" "")
fi
hku_state_save "$INTENT_DIR" "iteration.json" "$STATE"

git add "$INTENT_DIR/"
git commit -m "refine: re-queue ${UNIT_NAME} for ${INTENT_SLUG}"
```

**Note:** Units that are already completed and unaffected by the change stay completed. Only re-queue units that are directly impacted.

If `integratorComplete` was set to `true` in `iteration.json`, reset it to `false` since the spec has changed:

```bash
STATE=$(echo "$STATE" | hku_json_set "integratorComplete" "false")
hku_state_save "$INTENT_DIR" "iteration.json" "$STATE"
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
