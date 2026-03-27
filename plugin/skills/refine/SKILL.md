---
description: Refine intent or unit specs mid-construction without losing progress
argument-hint: "[unit-slug]"
---

# AI-DLC Refine

You are refining an AI-DLC intent or unit specification mid-construction. Your job is to collaborate with the user to amend specs without destroying in-flight progress.

---

## Pre-check: Reject Cowork Mode

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /refine cannot run in cowork mode."
  echo "Run this in a full Claude Code CLI session."
  exit 1
fi
```

If `CLAUDE_CODE_IS_COWORK=1`, stop immediately with the message above. Do NOT proceed.

---

## Step 1: Load Intent State

```bash
# Intent-level state is stored on current branch (intent branch)
STATE=$(han keep load iteration.json --quiet)
INTENT_SLUG=$(han keep load intent-slug --quiet)
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
```

If no state exists:
```
No AI-DLC state found. Run /elaborate to start a new task.
```

If status is "complete":
```
Intent is already complete. Run /elaborate to start a new task.
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
for unit_file in "$INTENT_DIR"/unit-*.md; do
  [ -f "$unit_file" ] || continue
  unit_name=$(basename "$unit_file" .md)
  status=$(han parse yaml status -r --default "pending" < "$unit_file" 2>/dev/null || echo "pending")
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

Update `iteration.json`:
- For each affected unit in `unitStates`, reset `hat` to the first hat in the workflow
- If `unitStates` doesn't track the unit (sequential mode), set `currentUnit` to null

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"

# Re-queue affected units
for unit_file in $AFFECTED_UNITS; do
  update_unit_status "$unit_file" "pending"
done

# Reset hat tracking in iteration.json
WORKFLOW_HATS=$(echo "$STATE" | han parse json workflow)
FIRST_HAT=$(echo "$WORKFLOW_HATS" | jq -r '.[0]')

# For teams mode: reset unitStates entries
# For sequential mode: clear currentUnit
STATE=$(echo "$STATE" | han parse json --set "currentUnit=")
han keep save iteration.json "$STATE"

git add "$INTENT_DIR/"
git commit -m "refine: re-queue affected units for ${INTENT_SLUG}"
```

### If unit-level change:

Re-queue only the target unit:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"

# Re-queue the specific unit
update_unit_status "$INTENT_DIR/${UNIT_NAME}.md" "pending"

# Reset hat tracking
WORKFLOW_HATS=$(echo "$STATE" | han parse json workflow)
FIRST_HAT=$(echo "$WORKFLOW_HATS" | jq -r '.[0]')

# For teams mode: reset this unit's hat in unitStates
# For sequential mode: clear currentUnit if it matches
CURRENT_UNIT=$(echo "$STATE" | han parse json currentUnit -r --default "")
if [ "$CURRENT_UNIT" = "$UNIT_NAME" ]; then
  STATE=$(echo "$STATE" | han parse json --set "currentUnit=")
fi
han keep save iteration.json "$STATE"

git add "$INTENT_DIR/"
git commit -m "refine: re-queue ${UNIT_NAME} for ${INTENT_SLUG}"
```

**Note:** Units that are already completed and unaffected by the change stay completed. Only re-queue units that are directly impacted.

If `integratorComplete` was set to `true` in `iteration.json`, reset it to `false` since the spec has changed:

```bash
STATE=$(echo "$STATE" | han parse json --set "integratorComplete=false")
han keep save iteration.json "$STATE"
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
  /execute
```
