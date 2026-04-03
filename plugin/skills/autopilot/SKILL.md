---
description: Full autonomous workflow — elaborate, plan, build, review, and deliver in one command
user-invocable: true
argument-hint: "<feature description>"
---

## Name

`haiku:autopilot` - Full autonomous feature lifecycle in one command.

## Synopsis

```
/haiku:autopilot <feature description>
```

## Description

**User-facing command** - Orchestrates the complete H·AI·K·U lifecycle for a well-understood feature: elaborate, execute all units, and deliver via PR.

**When to use:** Well-understood features with clear requirements. NOT for exploratory work, complex architecture, or anything requiring design decisions.

**User Flow:**
```
User: /haiku:autopilot Add a dark mode toggle to the settings page
AI: Starting autonomous lifecycle...
  Phase 1: Intent creation (/haiku:new in autonomous mode)
  Phase 2: Stage loop (/haiku:run with autopilot gate resolution)
  Phase 3: Delivery (PR creation)
AI: Done! PR #42 created. [summary]
```

---

## Guardrails

Autopilot is designed for straightforward features. It pauses and returns control to the user whenever risk is detected:

1. **Pause on blockers or ambiguity** - Never guess. If elaboration or execution encounters something unclear, stop and ask.
2. **Pause if elaboration generates more than 5 units** - Confirm scope with the user before proceeding to execution. More than 5 units suggests the feature may be too large or complex for autopilot.
3. **Pause before creating PR** - Always confirm with the user before delivery. Show a summary of what was built across all units.
4. **No silent failures** - If any phase fails, stop immediately and report what happened. Do not attempt to recover autonomously from phase-level failures.

---

## Implementation

### Step 0: Validate Input

A feature description is **required**. If no argument is provided:

```
ERROR: /haiku:autopilot requires a feature description.
Usage: /haiku:autopilot <feature description>

Example: /haiku:autopilot Add user avatar upload to the profile page
```

Do NOT proceed without a description. This is not an interactive discovery tool — use `/haiku:elaborate` for that.

### Step 1: Pre-flight Checks

Before starting the lifecycle:

1. **Verify environment** - Must be in a git repository with a clean working tree (or stashable changes).
2. **Check for in-progress intents** - If `.haiku/` contains an active intent, warn the user and confirm whether to continue with a new intent or resume the existing one.
3. **Detect cowork mode** - Autopilot requires full CLI capabilities. Reject if `CLAUDE_CODE_IS_COWORK=1`.

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /haiku:autopilot cannot run in cowork mode."
  echo "Autopilot requires a full Claude Code CLI session with file system access."
  echo "Please run /haiku:autopilot from a standard Claude Code session."
  exit 1
fi
```

### Step 2: Intent Creation Phase

Invoke `/haiku:new` with the provided feature description in **autonomous mode**. This means:

- Mode is set to `continuous` automatically (no mode question)
- No confirmation prompts — proceeds immediately
- The feature description is passed as the argument

`/haiku:new` creates the intent workspace at `.haiku/intents/{slug}/` with studio detection, stage configuration, and git branch setup.

### Step 3: Stage Loop Phase

Invoke `/haiku:run` with autopilot gate resolution (`autopilot=true`). The stage loop handles both planning (old elaboration) and building (old execution) within each stage.

**Gate resolution in autopilot mode:**
- `auto` gates: advance immediately
- `ask` gates: overridden to `auto` (no user prompts)
- `external` (single): blocks, surfaces to user — this is the only gate that pauses autopilot
- Array gates (e.g., `[external, ask]`): select most permissive non-external option, override ask→auto

**After the plan phase completes within each stage, apply guardrails:**

1. Count the number of units generated
2. **If more than 5 units:** STOP and present the unit list to the user:
   ```
   SCOPE CHECK: Planning produced {N} units, which exceeds the autopilot threshold of 5.

   Units:
   - unit-01-xxx: ...
   - unit-02-xxx: ...
   ...

   This may be too complex for fully autonomous execution.
   Options:
   1. Continue with autopilot (I understand the scope)
   2. Drop to manual mode (I'll run /haiku:run myself)
   3. Re-plan with narrower scope
   ```
3. **If 5 or fewer units:** Continue automatically.

The build phase proceeds through each unit in DAG order. If any unit hits a blocker:
```
AUTOPILOT PAUSED: Unit {unit-name} is blocked.

Blocker: {description}

Resolve the blocker and run /haiku:autopilot to resume, or /haiku:run to continue manually.
```

### Step 4: Delivery Phase

After all units are complete:

1. **Generate a summary** of everything that was built:
   - List each unit and what it accomplished
   - Highlight any assumptions made during execution
   - Show test results if available

2. **Pause for confirmation** before creating the PR:
   ```
   DELIVERY CHECK: All {N} units complete. Ready to create PR.

   Summary:
   - unit-01-xxx: {what was done}
   - unit-02-xxx: {what was done}
   ...

   Shall I create the PR? (Yes / No / Let me review first)
   ```

3. **On confirmation**, create the PR:
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
| Intent creation fails | Stop, report error, suggest `/haiku:new` manually |
| More than 5 units generated | Pause, show scope, ask user to confirm |
| Unit blocked during execution | Pause, report blocker, suggest resolution |
| All units complete but tests fail | Pause before delivery, report failures |
| PR creation fails | Report error, provide manual instructions |

---

## Relationship to Other Skills

- **`/haiku:new`** - Used internally for Phase 2 (intent creation). Use standalone for interactive intent setup.
- **`/haiku:run`** - Used internally for Phase 3 (stage loop). Use standalone for manual stage-by-stage execution.
- **`/haiku:elaborate`** - Deprecated alias. Delegates to `/haiku:run` plan phase for stage-based intents.
- **`/haiku:execute`** - Deprecated alias. Delegates to `/haiku:run` build phase for stage-based intents.
- **`/haiku:reflect`** - Can be run after autopilot completes to analyze the cycle.
- **`/haiku:resume`** - If autopilot is interrupted mid-execution, `/haiku:resume` can restore state before re-running `/haiku:run` or `/haiku:autopilot`.
