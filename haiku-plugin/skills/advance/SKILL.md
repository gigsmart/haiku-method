---
description: (Internal) Advance to the next hat in the HAIKU workflow
user-invocable: false
---

## Name

`haiku:advance` - Move to the next hat in the HAIKU workflow sequence.

## Synopsis

```
/advance
```

## Description

**Internal command** - Called by the AI during `/execute`, not directly by users.

Advances to the next hat in the workflow sequence. For example, in the default workflow:
- planner -> executor (plan ready, now execute)
- executor -> reviewer (execution complete, now review)

**When at the last hat (reviewer)**, `/advance` handles completion automatically:
- If all units complete -> Mark intent as complete
- If more units ready -> Loop back to executor for next unit
- If blocked (no ready units) -> Alert user

## Implementation

### Step 1: Load Current State

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/storage.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"

STATE=$(storage_load_state "iteration.json")
INTENT_SLUG=$(storage_load_state "intent-slug")
INTENT_DIR=".haiku/${INTENT_SLUG}"
```

### Step 2: Determine Next Hat

```javascript
const workflow = state.workflow || ["planner", "executor", "reviewer"];
const currentIndex = workflow.indexOf(state.hat);
const nextIndex = currentIndex + 1;

if (nextIndex >= workflow.length) {
  // At last hat - check DAG status
  // See Step 2b below
}

const nextHat = workflow[nextIndex];
```

### Step 2b: Last Hat Logic

When at the last hat, check DAG:

```bash
# Mark current unit as completed
CURRENT_UNIT=$(echo "$STATE" | jq -r '.currentUnit // ""')
if [ -n "$CURRENT_UNIT" ] && [ -f "$INTENT_DIR/${CURRENT_UNIT}.md" ]; then
  update_unit_status "$INTENT_DIR/${CURRENT_UNIT}.md" "completed"
fi

# Check DAG status
SUMMARY=$(get_dag_summary "$INTENT_DIR")
```

- **All complete**: Mark intent complete, output summary
- **More units ready**: Loop back to first hat for next unit
- **All blocked**: Alert user

### Step 3: Update State

```bash
# Increment iteration
ITERATION=$(($(echo "$STATE" | jq -r '.iteration') + 1))

# Update state with new hat
storage_save_state "iteration.json" "{updated state}"
```

### Step 4: Confirm

Output:
```
Advanced to **{nextHat}** hat. Continuing execution...
```

### Step 5: Completion Summary

When all units done:

```
## Intent Complete!

**Total iterations:** {count}
**Workflow:** {name}

### What Was Done
{Summary from intent}

### Units Completed
{List of completed units}

### Criteria Satisfied
{List of completion criteria}
```
