---
description: Continue the HAIKU execution loop - autonomous execute/review cycles until completion
argument-hint: "[intent-slug] [unit-name]"
disable-model-invocation: true
---

## Name

`haiku:execute` - Run the autonomous HAIKU execution loop.

## Synopsis

```
/execute [intent-slug] [unit-name]
```

## Description

**User-facing command** - Continue the HAIKU autonomous execution loop.

**Two modes:**
- `/execute` -- DAG-driven, picks next ready unit
- `/execute unit-01-setup` -- target a specific unit

This command resumes work from the current hat and runs until:
- All units complete
- User intervention needed (all units blocked)
- Session exhausted (Stop hook instructs agent to call `/execute`)

**CRITICAL: No Questions During Execution**

During the execution loop, you MUST NOT:
- Use AskUserQuestion tool
- Ask clarifying questions
- Request user decisions

If you encounter ambiguity:
1. Make a reasonable decision based on available context
2. Document the assumption in your work
3. Let the reviewer hat catch issues on the next pass

## Implementation

### Step 0: Load State

```bash
# Source HAIKU libraries
source "${CLAUDE_PLUGIN_ROOT}/lib/storage.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"

# Load state
STATE=$(storage_load_state "iteration.json")
INTENT_SLUG=$(storage_load_state "intent-slug")
```

If no state found:
```
No HAIKU state found.
Run /elaborate to start a new task, or /resume to continue an existing one.
```

If status is "complete":
```
Task already complete! Run /elaborate to start a new task.
```

### Step 1: Find Next Unit

```bash
INTENT_DIR=".haiku/${INTENT_SLUG}"

# If targeting a specific unit, use it; otherwise find next ready unit
if [ -n "$TARGET_UNIT" ]; then
  UNIT_FILE="$INTENT_DIR/${TARGET_UNIT}.md"
  # Validate and check deps
else
  # Find next ready unit from DAG
  READY=$(find_ready_units "$INTENT_DIR")
  UNIT_NAME=$(echo "$READY" | head -1)
  UNIT_FILE="$INTENT_DIR/${UNIT_NAME}.md"
fi
```

### Step 2: Mark Unit In Progress

```bash
update_unit_status "$UNIT_FILE" "in_progress"
```

### Step 3: Execute Hat Workflow

Based on `state.hat`, spawn the appropriate subagent:

| Role | Description |
|------|-------------|
| `planner` | Creates tactical execution plan |
| `executor` | Executes the plan |
| `operator` | Validates operational readiness |
| `reflector` | Analyzes outcomes and captures learnings |
| `reviewer` | Verifies completion criteria |

Load hat instructions from `hats/{hat}.md` and include in the subagent prompt.

### Step 4: Run Quality Gates

Before advancing, check quality gates from settings:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"

# Run gates for the current event
if ! run_gates "Stop"; then
  echo "Quality gates failed. Fix issues before continuing."
  exit 1
fi
```

### Step 5: Handle Result

- **Success/Complete**: Call `/advance` to move to next hat
- **Issues found** (reviewer): Return to executor
- **Blocked**: Document and stop for user intervention

### Step 6: Loop or Complete

The execution loop continues until:
1. **Complete** - All units done
2. **All blocked** - No forward progress possible
3. **Session exhausted** - Stop hook fires

When all units complete, output:

```
## Intent Complete!

**Total iterations:** {count}
**Workflow:** {name}

### Units Completed
{list}

### Criteria Satisfied
{list}
```
