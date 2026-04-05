---
description: Resume work on an existing H·AI·K·U intent when ephemeral state is lost
argument-hint: "[intent-slug]"
disable-model-invocation: true
---

## Name

`haiku:resume` - Resume an existing H·AI·K·U intent.

## Synopsis

```
/haiku:resume [intent-slug]
```

## Description

**User-facing command** - Resume work on an intent when session context is lost but `.haiku/` artifacts exist.

This happens when:
- Session context was cleared unexpectedly
- Starting fresh session after previous work
- Artifacts preserved in `.haiku/` directory

**User Flow:**
```
SessionStart: "Resumable Intents Found: my-feature"
User: /haiku:resume my-feature
AI: Initialized state, continuing as builder...
User: /haiku:execute
...continues work...
```

## Implementation

### Pre-check: Reject Cowork Mode

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /haiku:resume cannot run in cowork mode."
  echo "Run this in a full Claude Code CLI session."
  exit 1
fi
```

If `CLAUDE_CODE_IS_COWORK=1`, stop immediately with the message above. Do NOT proceed.

### Step 1: Find Resumable Intents

If no slug provided, scan multiple sources for active intents:

**A: Check filesystem first (highest priority - source of truth):**

```bash
for intent_file in .haiku/intents/*/intent.md; do
  [ -f "$intent_file" ] || continue
  dir=$(dirname "$intent_file")
  slug=$(basename "$dir")
  status=$(haiku_intent_get { slug, field: "status" } 2>/dev/null || echo "active")
  [ "$status" = "active" ] && echo "$slug"
done
```

**B: Check git branches using `discover_branch_intents`:**

```bash
# Source DAG library
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"

# Discover from branches (include remote for resume command)
branch_intents=$(discover_branch_intents true)

# Parse results: slug|studio|source|branch
echo "$branch_intents" | while IFS='|' read -r slug studio source branch; do
  [ -z "$slug" ] && continue
  echo "$slug ($source: $branch)"
done
```

**Selection logic:**
- 1 intent found -> auto-select
- Multiple intents -> list them and prompt user to specify
- 0 intents -> error, suggest `/haiku:elaborate`

### Step 2: Load Intent Metadata

Read from `.haiku/intents/{slug}/intent.md`:

```bash
intentFile=".haiku/intents/${slug}/intent.md"
studio=$(haiku_intent_get { slug: "$slug", field: "studio" } 2>/dev/null || echo "software")
[ -z "$studio" ] && studio="software"
active_stage=$(haiku_intent_get { slug: "$slug", field: "active_stage" } 2>/dev/null || echo "development")
[ -z "$active_stage" ] && active_stage="development"
title=$(haiku_intent_get { slug: "$slug", field: "title" } 2>/dev/null || echo "$slug")
[ -z "$title" ] && title="$slug"
```

### Step 3: Determine Starting Hat

Use DAG analysis to determine where to resume:

```bash
# Source DAG library
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"

# Get recommended hat based on unit states
starting_hat=$(get_recommended_hat ".haiku/intents/${slug}" "${active_stage}" "${studio}")
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
INTENT_BRANCH="haiku/${slug}/main"
INTENT_WORKTREE="${REPO_ROOT}/.haiku/worktrees/${slug}"

mkdir -p "${REPO_ROOT}/.haiku/worktrees"
if ! grep -q '\.haiku/worktrees/' "${REPO_ROOT}/.gitignore" 2>/dev/null; then
  echo '.haiku/worktrees/' >> "${REPO_ROOT}/.gitignore"
  git add "${REPO_ROOT}/.gitignore"
  git commit -m "chore: gitignore .haiku/worktrees"
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

Save to file-based state (intent-level state goes to the intent directory):

```
# Intent slug is directory-based: .haiku/intents/{slug}/ — no separate save needed
# State lives in intent.md frontmatter and stages/{stage}/state.json — accessed via MCP tools

# Start the stage if not already active
haiku_stage_start { intent: "$slug", stage: "$active_stage" }
```

### Step 5b: Restore Team (Agent Teams)

When `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is enabled:

```bash
AGENT_TEAMS_ENABLED="${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}"
TEAM_NAME="haiku-${SLUG}"
TEAM_CONFIG="${CLAUDE_CONFIG_DIR}/teams/${TEAM_NAME}/config.json"
```

If `AGENT_TEAMS_ENABLED` is set:

1. **Team exists** (`TEAM_CONFIG` found):
   - Read config to discover active teammates
   - Save `teamName` to stage state: `haiku_stage_set { intent, stage, field: "team_name", value: "$TEAM_NAME" }`
   - Note: Active teammates may need to be re-spawned if they were shut down

2. **Team does not exist**:
   - Save `teamName` to stage state (for `/haiku:execute` to create it)
   - Note in output: "Team will be created when `/haiku:execute` runs"

**Without Agent Teams:** Skip this step. No team management needed.

### Step 6: Output Confirmation

```markdown
## H·AI·K·U Intent Resumed

**Intent:** {title}
**Slug:** {slug}
**Studio:** {studio}
**Starting Hat:** {startingHat}
**Worktree:** .haiku/worktrees/{slug}/
**Team:** {teamName} (if Agent Teams enabled)

### Unit Status
{get_dag_status_table output}

**Summary:** {completed}/{total} units completed

**Next:** Run `/haiku:execute` to continue the execution loop.

Note: All H·AI·K·U work happens in the worktree at .haiku/worktrees/{slug}/
```

### Session Handoff

When a session ends (context limit, user stops, bolt completes), create a structured handoff file for seamless continuation:

**Create `.haiku/intents/{intent-slug}/handoff.md`:**

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

**On resume:** `/haiku:resume` reads `handoff.md` (if it exists) to restore context before starting the next bolt. This is more structured than relying on state files alone — it captures the narrative of where things stand.

After reading handoff.md on resume, rename it to `handoff-{date}.md` to archive it.

## Examples

### Single Intent (Auto-Select)

```
User: /haiku:resume
AI: Found 1 resumable intent: user-auth

## H·AI·K·U Intent Resumed

**Intent:** User Auth
**Slug:** user-auth
**Workflow:** default
**Starting Hat:** builder
**Worktree:** .haiku/worktrees/user-auth/

### Unit Status
| Unit | Status | Blocked By |
|------|--------|------------|
| unit-01-core-setup | completed | |
| unit-02-auth | in_progress | |
| unit-03-dashboard | pending | unit-02-auth |

**Summary:** 1/3 units completed

**Next:** Run `/haiku:execute` to continue the execution loop.
```

### Multiple Intents (Requires Selection)

```
User: /haiku:resume
AI: Found multiple resumable intents:
- user-auth (software studio, 1/3 completed)
- api-refactor (software studio, 0/5 completed)

Please specify: `/haiku:resume user-auth` or `/haiku:resume api-refactor`
```
