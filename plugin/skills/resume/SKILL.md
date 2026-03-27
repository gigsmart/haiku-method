---
description: Resume work on an existing AI-DLC intent when ephemeral state is lost
argument-hint: "[intent-slug]"
disable-model-invocation: true
---

## Name

`ai-dlc:resume` - Resume an existing AI-DLC intent.

## Synopsis

```
/resume [intent-slug]
```

## Description

**User-facing command** - Resume work on an intent when ephemeral state (iteration.json) is lost but `.ai-dlc/` artifacts exist.

This happens when:
- Session context was cleared unexpectedly
- Starting fresh session after previous work
- Branch state lost but artifacts preserved

**User Flow:**
```
SessionStart: "Resumable Intents Found: my-feature"
User: /resume my-feature
AI: Initialized state, continuing as builder...
User: /construct
...continues work...
```

## Implementation

### Pre-check: Reject Cowork Mode

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /resume cannot run in cowork mode."
  echo "Run this in a full Claude Code CLI session."
  exit 1
fi
```

If `CLAUDE_CODE_IS_COWORK=1`, stop immediately with the message above. Do NOT proceed.

### Step 1: Find Resumable Intents

If no slug provided, scan multiple sources for active intents:

**A: Check filesystem first (highest priority - source of truth):**

```bash
for intent_file in .ai-dlc/*/intent.md; do
  [ -f "$intent_file" ] || continue
  dir=$(dirname "$intent_file")
  slug=$(basename "$dir")
  status=$(han parse yaml status -r --default active < "$intent_file")
  [ "$status" = "active" ] && echo "$slug"
done
```

**B: Check git branches using `discover_branch_intents`:**

```bash
# Source DAG library
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"

# Discover from branches (include remote for resume command)
branch_intents=$(discover_branch_intents true)

# Parse results: slug|workflow|source|branch
echo "$branch_intents" | while IFS='|' read -r slug workflow source branch; do
  [ -z "$slug" ] && continue
  echo "$slug ($source: $branch)"
done
```

**Selection logic:**
- 1 intent found -> auto-select
- Multiple intents -> list them and prompt user to specify
- 0 intents -> error, suggest `/elaborate`

### Step 2: Load Intent Metadata

Read from `.ai-dlc/{slug}/intent.md`:

```javascript
const intentFile = `.ai-dlc/${slug}/intent.md`;
const workflow = han_parse_yaml(intentFile, "workflow") || "default";
const title = han_parse_yaml(intentFile, "title") || slug;
```

### Step 3: Determine Starting Hat

Use DAG analysis to determine where to resume:

```bash
# Source DAG library
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"

# Get recommended hat based on unit states
starting_hat=$(get_recommended_hat ".ai-dlc/${slug}" "${workflow}")
```

**Hat selection logic:**
- No units exist -> `planner` (needs decomposition)
- All units completed -> `reviewer` (final verification)
- Any units in_progress or ready -> `builder` (continue work)
- All units blocked -> `planner` (resolve dependencies)

### Step 4: Create Intent Worktree

**CRITICAL: The orchestrator MUST run in the intent worktree, not the main working directory.**

```bash
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
INTENT_BRANCH="ai-dlc/${slug}/main"
INTENT_WORKTREE="${REPO_ROOT}/.ai-dlc/worktrees/${slug}"

mkdir -p "${REPO_ROOT}/.ai-dlc/worktrees"
if ! grep -q '\.ai-dlc/worktrees/' "${REPO_ROOT}/.gitignore" 2>/dev/null; then
  echo '.ai-dlc/worktrees/' >> "${REPO_ROOT}/.gitignore"
  git add "${REPO_ROOT}/.gitignore"
  git commit -m "chore: gitignore .ai-dlc/worktrees"
fi

if [ ! -d "$INTENT_WORKTREE" ]; then
  # Always branch off the default branch
  source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
  DEFAULT_BRANCH=$(resolve_default_branch "auto" "$REPO_ROOT")
  git worktree add -B "$INTENT_BRANCH" "$INTENT_WORKTREE" "$DEFAULT_BRANCH"
fi
cd "$INTENT_WORKTREE"
```

### Step 5: Initialize State

Save to han keep storage (intent-level state goes to current branch, which is now the intent branch):

```bash
# Save intent slug (intent-level state -> current branch / intent branch)
han keep save intent-slug "$SLUG"

# Save iteration state (intent-level state -> current branch / intent branch)
han keep save iteration.json "{\"iteration\":1,\"hat\":\"$STARTING_HAT\",\"workflowName\":\"$WORKFLOW\",\"workflow\":$WORKFLOW_HATS_JSON,\"status\":\"active\"}"
```

### Step 5b: Restore Team (Agent Teams)

When `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is enabled:

```bash
AGENT_TEAMS_ENABLED="${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}"
TEAM_NAME="ai-dlc-${SLUG}"
TEAM_CONFIG="${CLAUDE_CONFIG_DIR}/teams/${TEAM_NAME}/config.json"
```

If `AGENT_TEAMS_ENABLED` is set:

1. **Team exists** (`TEAM_CONFIG` found):
   - Read config to discover active teammates
   - Save `teamName` to `iteration.json`
   - Note: Active teammates may need to be re-spawned if they were shut down

2. **Team does not exist**:
   - Save `teamName` to `iteration.json` (for `/construct` to create it)
   - Note in output: "Team will be created when `/construct` runs"

**Without Agent Teams:** Skip this step. No team management needed.

### Step 6: Output Confirmation

```markdown
## AI-DLC Intent Resumed

**Intent:** {title}
**Slug:** {slug}
**Workflow:** {workflow}
**Starting Hat:** {startingHat}
**Worktree:** .ai-dlc/worktrees/{slug}/
**Team:** {teamName} (if Agent Teams enabled)

### Unit Status
{get_dag_status_table output}

**Summary:** {completed}/{total} units completed

**Next:** Run `/construct` to continue the construction loop.

Note: All AI-DLC work happens in the worktree at .ai-dlc/worktrees/{slug}/
```

### Session Handoff

When a session ends (context limit, user stops, bolt completes), create a structured handoff file for seamless continuation:

**Create `.ai-dlc/{intent-slug}/handoff.md`:**

```markdown
---
session_ended: "{ISO date}"
hat: "{current hat}"
unit: "{current unit}"
bolt: {iteration number}
reason: "{why session ended: context_limit | user_stop | bolt_complete}"
---

## Where We Left Off
{Specific task in progress, last action taken}

## What's Working
- {completed items since last handoff}

## What's Not Working
- {blockers, failing tests, unresolved issues}

## Immediate Next Steps
1. {first thing to do when resuming}
2. {second thing}

## Important Context
{Decisions made, approaches tried and abandoned, key learnings from this session}
```

**On resume:** `/resume` reads `handoff.md` (if it exists) to restore context before starting the next bolt. This is more structured than relying on `han keep` alone — it captures the narrative of where things stand.

After reading handoff.md on resume, rename it to `handoff-{date}.md` to archive it.

## Examples

### Single Intent (Auto-Select)

```
User: /resume
AI: Found 1 resumable intent: han-team-platform

## AI-DLC Intent Resumed

**Intent:** Han Team Platform
**Slug:** han-team-platform
**Workflow:** default
**Starting Hat:** builder
**Worktree:** .ai-dlc/worktrees/han-team-platform/

### Unit Status
| Unit | Status | Blocked By |
|------|--------|------------|
| unit-01-core-setup | completed | |
| unit-02-auth | in_progress | |
| unit-03-dashboard | pending | unit-02-auth |

**Summary:** 1/3 units completed

**Next:** Run `/construct` to continue the construction loop.
```

### Multiple Intents (Requires Selection)

```
User: /resume
AI: Found multiple resumable intents:
- han-team-platform (default workflow, 1/3 completed)
- api-refactor (tdd workflow, 0/5 completed)

Please specify: `/resume han-team-platform` or `/resume api-refactor`
```
