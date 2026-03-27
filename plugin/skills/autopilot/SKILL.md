---
description: Full autonomous workflow — elaborate, plan, build, review, and deliver in one command
user-invocable: true
argument-hint: "<feature description>"
---

## Name

`ai-dlc:autopilot` - Full autonomous feature lifecycle in one command.

## Synopsis

```
/autopilot <feature description>
```

## Description

**User-facing command** - Orchestrates the complete AI-DLC lifecycle for a well-understood feature: elaborate, execute all units, and deliver via PR/MR.

**When to use:** Well-understood features with clear requirements. NOT for exploratory work, complex architecture, or anything requiring design decisions.

**User Flow:**
```
User: /autopilot Add a dark mode toggle to the settings page
AI: Starting autonomous lifecycle...
  Phase 1: Elaboration (/elaborate in autonomous mode)
  Phase 2: Construction (/execute for each unit)
  Phase 3: Delivery (PR/MR creation)
AI: Done! PR #42 created. [summary]
```

---

## Guardrails

Autopilot is designed for straightforward features. It pauses and returns control to the user whenever risk is detected:

1. **Pause on blockers or ambiguity** - Never guess. If elaboration or execution encounters something unclear, stop and ask.
2. **Pause if elaboration generates more than 5 units** - Confirm scope with the user before proceeding to execution. More than 5 units suggests the feature may be too large or complex for autopilot.
3. **Pause before creating PR** - Always confirm with the user before delivery. Show a summary of what was built across all units.
4. **Config-aware mode** - Uses `workflow_mode: autonomous` from project config (`.ai-dlc/config.yml`) if available. Falls back to interactive mode for any decision that could go wrong.
5. **No silent failures** - If any phase fails, stop immediately and report what happened. Do not attempt to recover autonomously from phase-level failures.

---

## Implementation

### Step 0: Validate Input

A feature description is **required**. If no argument is provided:

```
ERROR: /autopilot requires a feature description.
Usage: /autopilot <feature description>

Example: /autopilot Add user avatar upload to the profile page
```

Do NOT proceed without a description. This is not an interactive discovery tool — use `/elaborate` for that.

### Step 1: Pre-flight Checks

Before starting the lifecycle:

1. **Verify environment** - Must be in a git repository with a clean working tree (or stashable changes).
2. **Check for in-progress intents** - If `.ai-dlc/` contains an active intent, warn the user and confirm whether to continue with a new intent or resume the existing one.
3. **Detect cowork mode** - Autopilot requires full CLI capabilities. Reject if `CLAUDE_CODE_IS_COWORK=1`.

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /autopilot cannot run in cowork mode."
  echo "Autopilot requires a full Claude Code CLI session with file system access."
  echo "Please run /autopilot from a standard Claude Code session."
  exit 1
fi
```

### Step 2: Elaboration Phase

Invoke `/elaborate` with the provided feature description in autonomous mode:

- Pass the feature description as the argument to `/elaborate`
- Minimize user interaction — make reasonable decisions during elaboration where possible
- The elaboration phase will produce intent definition, success criteria, domain model, and unit decomposition in `.ai-dlc/{intent-slug}/`

**After elaboration completes, apply guardrails:**

1. Read the generated unit specs from `.ai-dlc/{intent-slug}/units/`
2. Count the number of units
3. **If more than 5 units:** STOP and present the unit list to the user:
   ```
   SCOPE CHECK: Elaboration produced {N} units, which exceeds the autopilot threshold of 5.

   Units:
   - unit-01-xxx: ...
   - unit-02-xxx: ...
   ...

   This may be too complex for fully autonomous execution.
   Options:
   1. Continue with autopilot (I understand the scope)
   2. Drop to manual mode (I'll run /execute myself)
   3. Re-elaborate with narrower scope
   ```
4. **If 5 or fewer units:** Continue automatically.

### Step 3: Construction Phase

For each unit in dependency order, invoke `/execute`:

- `/execute` handles the full autonomous build/review cycle per unit
- Units are executed in DAG order respecting dependencies
- If any unit hits a blocker that requires human intervention, STOP the autopilot loop and report:
  ```
  AUTOPILOT PAUSED: Unit {unit-name} is blocked.

  Blocker: {description}

  Resolve the blocker and run /autopilot to resume, or /execute to continue manually.
  ```

### Step 4: Delivery Phase

After all units are complete:

1. **Generate a summary** of everything that was built:
   - List each unit and what it accomplished
   - Highlight any assumptions made during execution
   - Show test results if available

2. **Pause for confirmation** before creating the PR/MR:
   ```
   DELIVERY CHECK: All {N} units complete. Ready to create PR.

   Summary:
   - unit-01-xxx: {what was done}
   - unit-02-xxx: {what was done}
   ...

   Shall I create the PR/MR? (Yes / No / Let me review first)
   ```

3. **On confirmation**, create the PR/MR:
   - Use the intent title as PR title
   - Include the full summary in the PR body
   - Reference all units and their outcomes
   - Add success criteria checklist

### Step 5: Final Report

After delivery (or after any pause/stop):

```
AUTOPILOT COMPLETE

Intent: {intent title}
Units completed: {N}/{total}
PR: {url} (or "Paused before delivery")

Phase summary:
  Elaboration: {duration context}
  Execution: {units built, any retries}
  Delivery: {PR status}
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No feature description provided | Error message, do not proceed |
| Cowork mode detected | Error message, do not proceed |
| Active intent already exists | Warn and ask user to confirm |
| Elaboration fails | Stop, report error, suggest `/elaborate` manually |
| More than 5 units generated | Pause, show scope, ask user to confirm |
| Unit blocked during execution | Pause, report blocker, suggest resolution |
| All units complete but tests fail | Pause before delivery, report failures |
| PR creation fails | Report error, provide manual instructions |

---

## Relationship to Other Skills

- **`/elaborate`** - Used internally for Phase 2 (elaboration). Use standalone for exploratory or complex elaboration.
- **`/execute`** - Used internally for Phase 3 (execution). Use standalone for manual unit-by-unit execution.
- **`/reflect`** - Can be run after autopilot completes to analyze the cycle.
- **`/resume`** - If autopilot is interrupted mid-execution, `/resume` can restore state before re-running `/execute` or `/autopilot`.
