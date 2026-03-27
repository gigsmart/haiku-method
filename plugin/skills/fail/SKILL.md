---
description: (Internal) Return to the previous hat in the AI-DLC workflow (e.g., reviewer finds issues)
user-invocable: false
---

## Name

`ai-dlc:fail` - Return to the previous hat in the AI-DLC workflow.

## Synopsis

```
/fail
```

## Description

**Internal command** - Called by the AI during `/execute`, not directly by users.

Goes back to the previous hat in the workflow. Typically used when:
- Reviewer finds issues -> return to builder
- Builder hits fundamental blocker -> return to planner

If already at the first hat (planner by default), this command is blocked.

## Implementation

### Step 1: Load Current State

```bash
# Intent-level state is stored on current branch (intent branch)
STATE=$(han keep load iteration.json --quiet)
```

### Step 2: Determine Previous Hat

```javascript
// Resolve workflow for this unit: per-unit workflow takes priority, then intent-level fallback
const currentUnit = state.currentUnit;
const unitWorkflow = (currentUnit && state.unitStates?.[currentUnit]?.workflow)
  || state.workflow
  || ["planner", "builder", "reviewer"];
const currentIndex = unitWorkflow.indexOf(state.hat);
const prevIndex = currentIndex - 1;

if (prevIndex < 0) {
  // Already at first hat - cannot go back
  return "Cannot fail before the first hat.";
}

const prevHat = unitWorkflow[prevIndex];
```

### Step 3: Document Why

Before updating state, save the reason for failing:

```bash
# Append to blockers (unit-level state - saved to current branch)
REASON="Reviewer found issues: [describe issues]"
han keep save blockers.md "$REASON"
```

### Step 3a: Commit Blocker Documentation

If any blocker documentation was written to the working tree (not han keep), commit immediately:

```bash
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "ai-dlc(${INTENT_SLUG}): document blocker"
fi
```

### Step 4: Update State

```bash
# Update hat to previous hat
# Intent-level state saved to current branch (intent branch)
# state.hat = prevHat
han keep save iteration.json '<updated JSON with hat set to previous>'
```

### Step 4b: Re-spawn Teammate (Agent Teams)

When `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is enabled and a reviewer rejects work:

```bash
AGENT_TEAMS_ENABLED="${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}"
```

If `AGENT_TEAMS_ENABLED` is set:

1. Read `unitStates` from `iteration.json`
2. Increment `unitStates.{currentUnit}.retries`
3. Check retry limit:
   - If `retries >= 3`: Mark unit as blocked, save blocker documentation
   - If `retries < 3`: Update `unitStates.{currentUnit}.hat = "builder"`
4. Spawn new builder teammate with reviewer feedback:

```javascript
Task({
  subagent_type: getAgentForDiscipline(unit.discipline),
  description: `builder (retry): ${unitName}`,
  name: `builder-${unitSlug}-retry${retries}`,
  team_name: `ai-dlc-${intentSlug}`,

  prompt: `
    Re-execute the builder role for unit ${unitName}.

    ## Reviewer Feedback
    ${reviewerFeedback}

    ## Retry ${retries}/3
    Address the reviewer's feedback and fix the identified issues.
    ...same worktree and criteria context...
  `
})
```

5. Save updated `unitStates` to `iteration.json`

**Without Agent Teams:** The existing behavior (update hat to previous, continue in sequential loop) remains unchanged.

### Step 5: Confirm

Output:
```
Returning to **{prevHat}** hat.

**Reason:** {reason}

Continuing construction with the previous hat...
```

## Guard

If already at the first hat (planner by default), output:
```
You are at the first hat (planner).

Cannot go back further. Use `/reset` to start over, or re-elaborate with `/elaborate <slug>`.
```
