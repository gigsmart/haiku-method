---
description: (Internal) Return to the previous hat in the H·AI·K·U workflow (e.g., reviewer finds issues)
user-invocable: false
---

## Name

`haiku:fail` - Return to the previous hat in the H·AI·K·U workflow.

## Synopsis

```
/haiku:fail
```

## Description

**Internal command** - Called by the AI during `/haiku:execute`, not directly by users.

Goes back to the previous hat in the workflow. Typically used when:
- Reviewer finds issues -> return to builder
- Builder hits fundamental blocker -> return to planner

If already at the first hat (planner by default), this command is blocked.

## Implementation

### Step 1: Load Current State

```bash
# Discover active intent and stage
INTENT_SLUG=$(basename "$(find .haiku -maxdepth 2 -name 'intent.md' -exec dirname {} \; | head -1)")
ACTIVE_STAGE=$(haiku_intent_get { slug: INTENT_SLUG, field: "active_stage" })
PHASE=$(haiku_stage_get { intent: INTENT_SLUG, stage: ACTIVE_STAGE, field: "phase" })
```

### Step 2: Determine Previous Hat

```javascript
// Resolve workflow for this unit: per-unit workflow from frontmatter takes priority, then intent-level fallback
const currentUnit = state.currentUnit;
const unitWorkflow = state.workflow || ["planner", "builder", "reviewer"];
// Per-unit workflow override: read from unit frontmatter if set
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
# Append reason to blockers file (file-based, not MCP-managed)
echo "$REASON" >> "$INTENT_DIR/blockers.md"
```

### Step 3a: Commit Blocker Documentation

If any blocker documentation was written to the working tree (not state files), commit immediately:

```bash
if [ -n "$(git status --porcelain)" ]; then
  source "${CLAUDE_PLUGIN_ROOT}/lib/persistence.sh"
  persistence_save "${INTENT_SLUG}" "haiku(${INTENT_SLUG}): document blocker"
fi
```

### Step 4: Update State

```
# Update hat to previous hat
haiku_unit_advance_hat { intent: INTENT_SLUG, stage: ACTIVE_STAGE, unit: CURRENT_UNIT, hat: PREVIOUS_HAT }
```

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
haiku_telemetry_init
haiku_record_hat_transition "${INTENT_SLUG}" "${CURRENT_HAT}" "${PREVIOUS_HAT}"
haiku_record_hat_failure "${INTENT_SLUG}" "${UNIT_SLUG}" "${CURRENT_HAT}" "${PREVIOUS_HAT}" "${REASON}"
```

### Step 4b: Re-spawn Teammate (Agent Teams)

When `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is enabled and a reviewer rejects work:

```bash
AGENT_TEAMS_ENABLED="${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}"
```

If `AGENT_TEAMS_ENABLED` is set:

1. Read retry count from unit frontmatter (`haiku_unit_get { intent, stage, unit, field: "retries" }`)
2. Increment retries in unit frontmatter
3. Check retry limit:
   - If `retries >= 3`: Mark unit as blocked, save blocker documentation
   - If `retries < 3`: Update hat in unit frontmatter: `haiku_unit_advance_hat { intent, stage, unit, hat: "builder" }`
4. Spawn new builder teammate with reviewer feedback:

```javascript
Task({
  subagent_type: getAgentForDiscipline(unit.discipline),
  description: `builder (retry): ${unitName}`,
  name: `builder-${unitSlug}-retry${retries}`,
  team_name: `haiku-${intentSlug}`,

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

5. Commit updated unit frontmatter

**Without Agent Teams:** The existing behavior (update hat to previous, continue in sequential loop) remains unchanged.

### Step 5: Confirm

Output:
```
Returning to **{prevHat}** hat.

**Reason:** {reason}

Continuing execution with the previous hat...
```

## Guard

If already at the first hat (planner by default), output:
```
You are at the first hat (planner).

Cannot go back further. Use `/haiku:reset` to start over, or re-elaborate with `/haiku:elaborate <slug>`.
```
