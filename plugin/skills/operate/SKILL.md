---
description: Manage the operation phase - read operational plans, execute agent tasks, guide human tasks, and track operational status
argument-hint: "[intent-slug]"
---

## Name

`ai-dlc:operate` - Run the AI-DLC operation phase.

## Synopsis

```
/operate [intent-slug]
```

## Description

**User-facing command** - Manage operational tasks for a completed or in-progress intent.

The operate skill reads the operational plan from `.ai-dlc/{intent-slug}/operations.md` and:
- Displays the operational plan overview
- Executes `owner: agent` tasks directly (runs commands, scripts)
- Provides guidance, checklists, and reminders for `owner: human` tasks
- Tracks operational status in intent state
- Can trigger a new Elaboration if operational findings suggest changes

## Implementation

### Step 0: Load State

```bash
# Load AI-DLC state using han keep (git-first storage)
INTENT_SLUG="${1:-$(han keep load intent-slug --quiet 2>/dev/null || echo "")}"
```

If no intent slug found:
```
No AI-DLC intent found.
Run /elaborate to start a new task, or provide an intent slug: /operate my-intent
```

### Step 1: Load Operational Plan

```bash
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
OPS_FILE="$INTENT_DIR/operations.md"
```

If `operations.md` does not exist:
```
No operational plan found at .ai-dlc/{intent-slug}/operations.md

The operational plan is produced during the Execution phase when using
the 'operational' or 'reflective' workflow.

To create one now, create operations.md in the intent directory with
recurring, reactive, and manual task sections.
```

### Step 2: Parse Operational Plan

Read `operations.md` and parse its frontmatter and task sections:

**Frontmatter fields:**
- `intent` - Intent slug
- `created` - ISO date when plan was created
- `status` - One of: `active`, `paused`, `complete`

**Task sections** (parsed from markdown body):

1. **Recurring Tasks** - Tasks that run on a schedule
   - `name`, `schedule`, `owner` (agent|human), `description`
   - For agent tasks: optional `command` to execute

2. **Reactive Tasks** - Tasks triggered by conditions
   - `name`, `trigger`, `owner` (agent|human)
   - For agent tasks: `command` to execute when triggered
   - For human tasks: `description` of what to do

3. **Manual Tasks** - Tasks performed by humans on a cadence
   - `name`, `frequency`, `owner` (always human)
   - `checklist` - List of steps to complete
   - `description` - What this task accomplishes

### Step 3: Display Operational Overview

Output a summary of the operational plan:

```markdown
## Operational Plan: {Intent Title}

**Intent:** {intent-slug}
**Status:** {status}
**Created:** {created}

### Task Summary

| Type | Count | Agent | Human |
|------|-------|-------|-------|
| Recurring | N | N | N |
| Reactive | N | N | N |
| Manual | N | 0 | N |

### Recurring Tasks
{list each task with schedule and owner}

### Reactive Tasks
{list each task with trigger and owner}

### Manual Tasks
{list each task with frequency and checklist}
```

### Step 4: Handle Agent-Owned Tasks

For tasks where `owner: agent`:

1. **Recurring tasks with a command**: Execute the command and report results
2. **Reactive tasks with a command**: Check if the trigger condition is met, then execute
3. Report execution results including exit code and output

```bash
# Example: execute an agent task
if [ -n "$TASK_COMMAND" ]; then
  echo "Executing: $TASK_NAME"
  if eval "$TASK_COMMAND"; then
    echo "Task completed successfully."
  else
    echo "Task failed with exit code $?."
  fi
fi
```

### Step 5: Handle Human-Owned Tasks

For tasks where `owner: human`:

1. Display the task description and any checklist items
2. Show the schedule or frequency
3. Provide actionable guidance

```markdown
### Human Task: {name}

**Schedule:** {schedule/frequency}
**Description:** {description}

#### Checklist
- [ ] {step 1}
- [ ] {step 2}
- [ ] {step 3}
```

### Step 6: Track Operational Status

Update operation status in intent state using han keep:

```bash
# Load or initialize operation status
OP_STATUS=$(han keep load operation-status.json --quiet 2>/dev/null || echo "")

if [ -z "$OP_STATUS" ]; then
  OP_STATUS='{"phase":"operation","operationStatus":"active","operationalTasks":{}}'
fi

# Update task status after execution
UPDATED=$(echo "$OP_STATUS" | jq --arg name "$TASK_NAME" --arg time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '.operationalTasks[$name] = {"lastRun": $time, "status": "on-track"}')

han keep save operation-status.json "$UPDATED"
```

**State schema:**
```json
{
  "phase": "operation",
  "operationStatus": "active|monitoring|complete",
  "operationalTasks": {
    "task-name": {
      "lastRun": "2026-03-06T12:00:00Z",
      "status": "on-track|needs-attention|failed"
    }
  }
}
```

### Step 7: Trigger Re-Elaboration (If Needed)

If operational findings suggest the intent needs changes:

```markdown
### Operational Finding

{description of the issue}

**Recommendation:** Re-elaborate this intent to address operational concerns.

Run `/elaborate` to start a new elaboration cycle.
```

### Step 8: Output Summary

```markdown
## Operation Status

**Intent:** {intent-slug}
**Overall Status:** {operationStatus}

### Task Results

| Task | Type | Owner | Last Run | Status |
|------|------|-------|----------|--------|
| {name} | recurring | agent | {time} | on-track |
| {name} | manual | human | - | pending |

### Next Actions
{list of upcoming or overdue tasks}
```
