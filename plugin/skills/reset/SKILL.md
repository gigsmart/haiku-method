---
description: Clear all H·AI·K·U state and start fresh
disable-model-invocation: true
---

## Name

`haiku:reset` - Clear H·AI·K·U state and start fresh.

## Synopsis

```
/haiku:reset
```

## Description

**User-facing command** - Run this to abandon current task or start fresh.

Clears all H·AI·K·U state for the current branch. Use this to:
- Start fresh on a new task
- Clean up after completing a task
- Abandon a task that's no longer needed

This clears H·AI·K·U state and removes worktrees. It does not:
- Undo code changes
- Delete branches
- Revert commits

The work you did is preserved in git. Only the H·AI·K·U workflow state and worktrees are cleared.

## Implementation

### Pre-check: Reject Cowork Mode

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /haiku:reset cannot run in cowork mode."
  echo "Run this in a full Claude Code CLI session."
  exit 1
fi
```

If `CLAUDE_CODE_IS_COWORK=1`, stop immediately with the message above. Do NOT proceed.

### Step 1: Confirm (Optional)

If the task is not complete, warn:

```bash
# Intent-level state is on current branch (intent branch)
STATE=$(hku_state_load "$INTENT_DIR" "iteration.json" 2>/dev/null || echo "{}")

# If status is not "completed", warn the user
# "Warning: Task is not complete. Current hat: $HAT"
# "Are you sure you want to clear all state?"
```

### Step 1b: Cleanup Team (Agent Teams)

If `teamName` exists in `iteration.json` and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set:

```bash
TEAM_NAME=$(echo "$STATE" | hku_json_get "teamName" "")
AGENT_TEAMS_ENABLED="${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}"
```

If `TEAM_NAME` is not empty and `AGENT_TEAMS_ENABLED` is set:

1. Send shutdown requests to all active teammates:

```javascript
// Read team config to find active members
// For each active teammate:
SendMessage({
  type: "shutdown_request",
  recipient: teammateName,
  content: "H·AI·K·U reset requested. Shutting down team."
})
```

2. Wait for shutdown confirmations

3. Delete the team:

```javascript
TeamDelete()
```

**Without Agent Teams:** Skip this step entirely. No team exists to clean up.

### Step 1c: Cleanup Worktrees

Remove the intent worktree and any unit worktrees for this intent:

```bash
# Intent slug is derived from .haiku directory structure
INTENT_SLUG=$(basename "$(find .haiku -maxdepth 2 -name 'intent.md' -exec dirname {} \; | head -1)" 2>/dev/null || echo "")
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')

if [ -n "$INTENT_SLUG" ]; then
  # Remove unit worktrees (pattern: {intent-slug}-{unit-slug})
  for wt in "${REPO_ROOT}/.haiku/worktrees/${INTENT_SLUG}-"*; do
    [ -d "$wt" ] && git worktree remove --force "$wt" 2>/dev/null
  done
  # Remove intent worktree
  [ -d "${REPO_ROOT}/.haiku/worktrees/${INTENT_SLUG}" ] && \
    git worktree remove --force "${REPO_ROOT}/.haiku/worktrees/${INTENT_SLUG}" 2>/dev/null
fi

git worktree prune
```

### Step 2: Delete All H·AI·K·U Keys

```bash
# Clear all state by removing the state directory
INTENT_DIR=".haiku/intents/${INTENT_SLUG}"
rm -rf "$INTENT_DIR/state/"
```

### Step 3: Confirm

Output:
```
H·AI·K·U state cleared.

All iteration data, intent, criteria, and notes have been removed.
Worktrees cleaned up.

To start a new task, run `/haiku:elaborate`.
```

## What Gets Cleared

### Intent-Level State (from intent branch)

| Key | Purpose |
|-----|---------|
| `iteration.json` | Hat, iteration count, workflow, status |
| `intent.md` | What we're building |
| `completion-criteria.md` | How we know it's done |
| `current-plan.md` | Plan for current iteration |
| `intent-slug` | Slug identifier |

### Unit-Level State (from current branch)

| Key | Purpose |
|-----|---------|
| `scratchpad.md` | Learnings and notes |
| `blockers.md` | Documented blockers |
| `next-prompt.md` | Continuation prompt |
