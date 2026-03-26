---
description: Remove orphaned and merged AI-DLC worktrees
disable-model-invocation: true
---

## Name

`ai-dlc:cleanup` - Remove orphaned and merged AI-DLC worktrees.

## Synopsis

```
/cleanup
```

## Description

**User-facing command** - Run this to clean up stale worktrees left behind by interrupted sessions.

Scans `.ai-dlc/worktrees/` for worktree directories and removes any that are orphaned (the backing git worktree entry is stale or the directory is left over from a crashed session) or merged (the worktree's branch has already been merged into the default branch).

This does not:
- Clear AI-DLC state (use `/reset` for that)
- Delete unmerged branches or commits
- Affect active worktrees whose branches have not been merged

## Implementation

### Pre-check: Reject Cowork Mode

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /cleanup cannot run in cowork mode."
  echo "Run this in a full Claude Code CLI session."
  exit 1
fi
```

If `CLAUDE_CODE_IS_COWORK=1`, stop immediately with the message above. Do NOT proceed.

### Step 1: Discover Worktrees

```bash
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
WORKTREES_DIR="${REPO_ROOT}/.ai-dlc/worktrees"

if [ ! -d "$WORKTREES_DIR" ]; then
  echo "No .ai-dlc/worktrees/ directory found. Nothing to clean up."
  exit 0
fi

# List all directories in .ai-dlc/worktrees/
DIRS=$(find "$WORKTREES_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null)
if [ -z "$DIRS" ]; then
  echo "No worktree directories found. Nothing to clean up."
  exit 0
fi
```

### Step 2: Identify Orphaned, Merged, and Active Worktrees

```bash
# Get list of valid worktree paths from git
VALID_WORKTREES=$(git worktree list --porcelain | grep '^worktree ' | sed 's/^worktree //')

# Determine the default branch
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')
if [ -z "$DEFAULT_BRANCH" ]; then
  # Fallback: try common names
  for candidate in main master; do
    if git rev-parse --verify "refs/heads/$candidate" &>/dev/null; then
      DEFAULT_BRANCH="$candidate"
      break
    fi
  done
fi

# Get the list of branches already merged into the default branch
MERGED_BRANCHES=$(git branch --merged "$DEFAULT_BRANCH" 2>/dev/null | sed 's/^[* ]*//')

ORPHANED=()
MERGED=()
MERGED_BRANCHES_MAP=()   # parallel array: branch name for each merged entry
ACTIVE=()

for dir in $DIRS; do
  slug=$(basename "$dir")
  if echo "$VALID_WORKTREES" | grep -qF "$dir"; then
    # Active worktree — check if its branch is merged
    BRANCH=$(git worktree list --porcelain | awk -v path="$dir" '
      /^worktree / { wt=$0; sub(/^worktree /,"",wt) }
      /^branch /   { if (wt == path) { sub(/^branch refs\/heads\//,""); print; exit } }
    ')
    if [ -n "$BRANCH" ] && echo "$MERGED_BRANCHES" | grep -qxF "$BRANCH"; then
      MERGED+=("$slug")
      MERGED_BRANCHES_MAP+=("$BRANCH")
    else
      ACTIVE+=("$slug")
    fi
  else
    ORPHANED+=("$slug")
  fi
done
```

### Step 3: Report and Confirm

Show the user what was found:

```
## AI-DLC Worktree Cleanup

**Orphaned worktrees:** {count}
{list of orphaned worktree names, if any}

**Merged worktrees (safe to remove):** {count}
{list of merged worktree names with branch names, e.g. "slug (ai-dlc/slug/main)"}

**Active worktrees:** {count}
{list of active worktree names, if any}
```

If there are orphaned worktrees, ask the user to confirm removal using `AskUserQuestion`.

If there are merged worktrees, ask the user (separately from orphaned confirmation) whether to remove them using `AskUserQuestion`. Explain that their branches are already merged into the default branch so removal is safe.

If there are no orphaned or merged entries but there are active worktrees, ask whether to force-remove all worktrees (with a warning that this will interrupt any running sessions).

If there is nothing to clean up, output:

```
No orphaned or merged worktrees found. Everything is clean.
```

### Step 4: Remove

```bash
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')

# Remove orphaned directories (no valid git worktree entry)
for name in "${ORPHANED[@]}"; do
  rm -rf "${REPO_ROOT}/.ai-dlc/worktrees/${name}"
done

# Remove merged worktrees (if user confirmed)
for i in "${!MERGED[@]}"; do
  name="${MERGED[$i]}"
  branch="${MERGED_BRANCHES_MAP[$i]}"
  # Remove the worktree (no --force needed since branch is merged)
  git worktree remove "${REPO_ROOT}/.ai-dlc/worktrees/${name}" 2>/dev/null
  # Delete the merged branch (safe — git -d refuses if not merged)
  git branch -d "$branch" 2>/dev/null
  # Clean up the intent spec directory if it exists
  if [ -d "${REPO_ROOT}/.ai-dlc/${name}" ]; then
    # Ask user before removing spec directory
    # Use AskUserQuestion: "Remove spec directory .ai-dlc/${name}/?"
    # If confirmed:
    rm -rf "${REPO_ROOT}/.ai-dlc/${name}"
  fi
done

# If user chose to force-remove active worktrees too:
for name in "${FORCE_REMOVE[@]}"; do
  git worktree remove --force "${REPO_ROOT}/.ai-dlc/worktrees/${name}" 2>/dev/null
done

# Prune stale git worktree metadata
git worktree prune
```

### Step 5: Confirm

Output:
```
Cleanup complete.

Removed {count} orphaned worktree(s).
Removed {count} merged worktree(s) and their branches.
```
