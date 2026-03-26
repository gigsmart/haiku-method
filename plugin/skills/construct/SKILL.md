---
description: (Deprecated) Use /execute instead. Alias for the AI-DLC execution loop.
argument-hint: "[intent-slug] [unit-name]"
disable-model-invocation: true
---

## Name

`ai-dlc:construct` - **(Deprecated)** Alias for `/execute`. Use `/execute` instead.

## Synopsis

```
/construct [intent-slug] [unit-name]
```

## Description

> **DEPRECATED:** `/construct` has been renamed to `/execute` to align with the H•AI•K•U methodology.
> This command still works but will display a deprecation notice. Use `/execute` going forward.

**User-facing command** - Continue the AI-DLC autonomous execution loop.

**Two modes:**
- `/construct` — DAG-driven, behavior depends on `change_strategy`
- `/construct unit-01-backend` — target a specific unit (precheck deps first)
- `/construct my-feature unit-01-backend` — with explicit intent slug

This command resumes work from the current hat and runs until:
- All units complete (`/advance` completes the intent automatically)
- User intervention needed (all units blocked)
- Session exhausted (Stop hook instructs agent to call `/construct`)

**User Flow:**
```
User: /elaborate           # Once - define intent, criteria, and workflow
User: /construct           # Kicks off autonomous loop
...AI works autonomously across all units...
...session exhausts, Stop hook fires...
Agent: /construct          # Agent continues (subagents have clean context)
...repeat until all units complete...
AI: Intent complete! [summary]
```

**Important:**
- Fully autonomous - Agent continues across units without stopping
- Subagents have clean context - No `/clear` needed between iterations
- User intervention - Only required when ALL units are blocked
- State preserved - Progress saved in han keep between sessions

**CRITICAL: No Questions During Construction**

During the construction loop, you MUST NOT:
- Use AskUserQuestion tool
- Ask clarifying questions
- Request user decisions
- Pause for user feedback

This breaks han's hook logic. The construction loop must be fully autonomous.

If you encounter ambiguity:
1. Make a reasonable decision based on available context
2. Document the assumption in your work
3. Let the reviewer hat catch issues on the next pass

If truly blocked (cannot proceed without user input):
1. Document the blocker clearly in `han keep save blockers.md`
2. Stop the loop naturally (don't call /advance)
3. The Stop hook will alert the user that human intervention is required

## Implementation

### Pre-check: Reject Cowork Mode

Construction requires full CLI capabilities (file editing, worktrees, test execution, subagent teams). It cannot run in a cowork session.

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /construct cannot run in cowork mode."
  echo "Construction requires a full Claude Code CLI session with file system access."
  echo ""
  echo "To continue:"
  echo "  1. Open Claude Code in your project directory"
  echo "  2. Run /construct"
  exit 1
fi
```

If `CLAUDE_CODE_IS_COWORK=1`, stop immediately with the message above. Do NOT proceed to any further steps.

### Step 0: Ensure Intent Worktree

**CRITICAL: The orchestrator MUST run in the intent worktree, not the main working directory.**

Before loading state, discover all active intents from both the filesystem and `ai-dlc/*` branches:

```bash
# Source DAG library for branch discovery
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"

declare -A ACTIVE_INTENTS  # slug -> "source" (filesystem|worktree|local)

# 1. Check filesystem (current directory)
for intent_file in .ai-dlc/*/intent.md; do
  [ -f "$intent_file" ] || continue
  dir=$(dirname "$intent_file")
  slug=$(basename "$dir")
  status=$(_yaml_get_simple "status" "active" < "$intent_file")
  [ "$status" = "active" ] && ACTIVE_INTENTS[$slug]="filesystem"
done

# 2. Check ai-dlc/* branches (worktrees and local branches)
while IFS='|' read -r slug workflow source branch; do
  [ -z "$slug" ] && continue
  # Don't overwrite filesystem entries (they take display priority)
  [ -z "${ACTIVE_INTENTS[$slug]}" ] && ACTIVE_INTENTS[$slug]="$source"
done < <(discover_branch_intents false)

# 3. Handle results
if [ ${#ACTIVE_INTENTS[@]} -eq 0 ]; then
  echo "No active AI-DLC intent found."
  echo ""
  echo "Run /elaborate to start a new task, or /resume <slug> if you know the intent slug."
  exit 0
fi

if [ ${#ACTIVE_INTENTS[@]} -eq 1 ]; then
  # Single intent — use it
  INTENT_SLUG="${!ACTIVE_INTENTS[@]}"
elif [ ${#ACTIVE_INTENTS[@]} -gt 1 ]; then
  # Multiple intents — ask the user which one to construct
  echo "Multiple active intents found:"
  echo ""
  for slug in "${!ACTIVE_INTENTS[@]}"; do
    echo "- **$slug** (${ACTIVE_INTENTS[$slug]})"
  done
  echo ""
  # Use AskUserQuestion with the discovered intents as options
  # (construct will present these dynamically)
  echo "Use /construct <slug> to specify which intent to build."
  exit 0
fi

# Ensure we're in the intent worktree
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
INTENT_BRANCH="ai-dlc/${INTENT_SLUG}/main"
INTENT_WORKTREE="${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}"

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

**Important:** The orchestrator runs in `.ai-dlc/worktrees/{intent-slug}/`, NOT the original repo directory. This keeps main clean and enables parallel intents.

### Step 0a: Parse Unit Target

If arguments were provided to `/construct`, disambiguate them:

```bash
# Arguments: /construct [arg1] [arg2]
# Disambiguation:
#   - If arg starts with "unit-" or matches a unit file in INTENT_DIR: treat as unit target
#   - Otherwise: treat as intent slug
#   - /construct my-feature unit-01-backend → intent=my-feature, unit=unit-01-backend
#   - /construct unit-01-backend → intent=(auto-detected), unit=unit-01-backend

TARGET_UNIT=""
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"

# Parse argument(s) into TARGET_UNIT
for arg in "$@"; do
  if [[ "$arg" == unit-* ]] || [ -f "$INTENT_DIR/${arg}.md" ] || [ -f "$INTENT_DIR/unit-${arg}.md" ]; then
    # Normalize: prepend "unit-" if needed
    if [[ "$arg" != unit-* ]] && [ -f "$INTENT_DIR/unit-${arg}.md" ]; then
      TARGET_UNIT="unit-${arg}"
    else
      TARGET_UNIT="$arg"
    fi
  fi
done
```

When a unit target is provided:

1. **Validate the unit file exists:**

```bash
if [ -n "$TARGET_UNIT" ]; then
  UNIT_FILE="$INTENT_DIR/${TARGET_UNIT}.md"
  if [ ! -f "$UNIT_FILE" ]; then
    echo "Unit not found: ${TARGET_UNIT}"
    echo ""
    echo "Available units:"
    for f in "$INTENT_DIR"/unit-*.md; do
      [ -f "$f" ] && echo "  - $(basename "$f" .md)"
    done
    exit 1
  fi

  # 2. Check dependency status
  source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
  DEP_STATUS=$(get_unit_dep_status "$INTENT_DIR" "$TARGET_UNIT")
  if [ $? -ne 0 ]; then
    echo "## Blocked: ${TARGET_UNIT}"
    echo ""
    echo "This unit has unmet dependencies:"
    echo ""
    echo "$DEP_STATUS"
    exit 1
  fi

  # 3. Check if already completed
  UNIT_STATUS=$(parse_unit_status "$UNIT_FILE")
  if [ "$UNIT_STATUS" = "completed" ]; then
    echo "Unit already completed: ${TARGET_UNIT}"
    exit 0
  fi
fi
```

### Step 0b: Ensure Remote Tracking

Ensure the intent branch tracks the remote so teammates can push their unit branches. This applies whether we're in a cloned cowork workspace or a local repo with a remote.

```bash
# Verify remote exists and configure upstream tracking
if git remote get-url origin &>/dev/null; then
  INTENT_BRANCH="ai-dlc/${INTENT_SLUG}/main"

  # Ensure the intent branch tracks the remote
  git branch --set-upstream-to=origin/"$INTENT_BRANCH" 2>/dev/null || true

  # Pull latest before starting to pick up teammate work
  git pull --rebase 2>/dev/null || true

  # Push intent branch to remote so teammates can access it
  git push -u origin "$INTENT_BRANCH" 2>/dev/null || true
fi
```

### Step 0c: Provider Sync Check

Check if a ticketing provider is configured and warn if ticket fields are unpopulated. This is a **warning only** — construction proceeds regardless. The elaboration gate (Phase 6.75) is the hard enforcement point; this catches cases where elaboration predated provider configuration.

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
PROVIDERS=$(load_providers)
TICKETING_TYPE=$(echo "$PROVIDERS" | jq -r '.ticketing.type // empty')

if [ -n "$TICKETING_TYPE" ]; then
  INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
  MISSING=""

  # Check epic field in intent.md
  if [ -f "$INTENT_DIR/intent.md" ]; then
    EPIC=$(han parse yaml epic -r --default "" < "$INTENT_DIR/intent.md" 2>/dev/null || echo "")
    if [ -z "$EPIC" ]; then
      MISSING="${MISSING}\n- intent.md: epic field is empty"
    fi
  fi

  # Check ticket field in each unit file
  for unit_file in "$INTENT_DIR"/unit-*.md; do
    [ -f "$unit_file" ] || continue
    TICKET=$(han parse yaml ticket -r --default "" < "$unit_file" 2>/dev/null || echo "")
    if [ -z "$TICKET" ]; then
      MISSING="${MISSING}\n- $(basename "$unit_file"): ticket field is empty"
    fi
  done

  if [ -n "$MISSING" ]; then
    echo ""
    echo "> **WARNING: Ticketing provider '${TICKETING_TYPE}' is configured but some ticket fields are empty:**"
    echo -e "$MISSING"
    echo ">"
    echo "> Consider running \`/elaborate\` to sync tickets, or populate fields manually."
    echo ""
  fi
fi
```

### Step 1: Load State

```bash
# Intent-level state is stored on the current branch (intent branch)
STATE=$(han keep load iteration.json --quiet)
INTENT_SLUG=$(han keep load intent-slug --quiet)
```

If `INTENT_SLUG` is empty (no intent exists at all):
```
No AI-DLC state found.

If you have existing intent artifacts in .ai-dlc/, run /resume to continue.
Otherwise, run /elaborate to start a new task.
```

If `INTENT_SLUG` exists but `STATE` is empty (first construction run — elaboration wrote artifacts but no iteration state):

Initialize `iteration.json` from the intent artifacts:

```bash
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
INTENT_FILE="$INTENT_DIR/intent.md"

# Read workflow from intent.md frontmatter
WORKFLOW_NAME=$(han parse yaml workflow -r --default "default" < "$INTENT_FILE" 2>/dev/null || echo "default")

# Resolve workflow to hat sequence
if [ -f ".ai-dlc/workflows.yml" ]; then
  WORKFLOW_HATS=$(han parse yaml "${WORKFLOW_NAME}" < ".ai-dlc/workflows.yml" 2>/dev/null || echo "")
fi
if [ -z "$WORKFLOW_HATS" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/workflows.yml" ]; then
  WORKFLOW_HATS=$(han parse yaml "${WORKFLOW_NAME}" < "${CLAUDE_PLUGIN_ROOT}/workflows.yml" 2>/dev/null || echo "")
fi
FIRST_HAT=$(echo "$WORKFLOW_HATS" | jq -r '.[0]')

# Initialize iteration state
STATE='{"iteration":1,"hat":"'"${FIRST_HAT}"'","workflowName":"'"${WORKFLOW_NAME}"'","workflow":'"${WORKFLOW_HATS}"',"status":"active"}'
han keep save iteration.json "$STATE"
```

If status is "complete":
```
Task already complete! Run /reset to start a new task.
```

**Persist or clear targetUnit in state:**

```bash
# If targeting: save to state
if [ -n "$TARGET_UNIT" ]; then
  STATE=$(echo "$STATE" | han parse json --set "targetUnit=$TARGET_UNIT")
else
  # Clear any stale targetUnit from previous targeted run
  STATE=$(echo "$STATE" | han parse json --set "targetUnit=")
fi
han keep save iteration.json "$STATE"
```

### Step 1b: Detect Agent Teams

```bash
AGENT_TEAMS_ENABLED="${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}"
CHANGE_STRATEGY=$(han parse yaml "git.change_strategy" -r --default "unit" < "$INTENT_DIR/intent.md")

# Pure unit strategy always uses Sequential path (subagent delegation, no team orchestration).
# Hybrid strategy (intent-level "intent" + some units overriding to "unit") keeps Teams enabled —
# the intent-level strategy drives orchestration. Per-unit overrides are resolved at merge time
# by /advance, not at spawn time.
if [ "$CHANGE_STRATEGY" = "unit" ]; then
  AGENT_TEAMS_ENABLED=""
fi
```

If `AGENT_TEAMS_ENABLED` is set, follow the **Agent Teams** path below.
If not set, skip to the **Fallback: Sequential Subagent Execution** section.

### Step 2 (Teams): Create or Reconnect Team

Check if the team already exists before creating:

```bash
TEAM_NAME="ai-dlc-${INTENT_SLUG}"
TEAM_CONFIG="${CLAUDE_CONFIG_DIR}/teams/${TEAM_NAME}/config.json"
```

If team config does NOT exist:

```javascript
TeamCreate({
  team_name: `ai-dlc-${intentSlug}`,
  description: `AI-DLC: ${intentTitle}`
})
```

Save `teamName` to `iteration.json`:

```bash
STATE=$(echo "$STATE" | han parse json --set "teamName=$TEAM_NAME")
han keep save iteration.json "$STATE"
```

### Step 3 (Teams): Spawn ALL Ready Units in Parallel

Loop over ALL ready units from the DAG (not just one):

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
READY_UNITS=$(find_ready_units "$INTENT_DIR")

# Intent-level workflow (default fallback)
INTENT_WORKFLOW_HATS=$(echo "$STATE" | han parse json workflow)
```

**Include repo URL for cowork**: If operating in a cloned workspace, include the repo URL in each teammate's prompt: "Repository: `<remote-url>`. Clone and checkout `ai-dlc/<intent-slug>` if you don't have local access." This enables teammates to clone independently in cowork mode.

```bash
# Capture remote URL for teammate prompts
REPO_URL=$(git remote get-url origin 2>/dev/null || echo "")
```

For EACH ready unit:

1. **Create unit worktree** (same as current Step 2 logic):

```bash
UNIT_NAME=$(basename "$UNIT_FILE" .md)
UNIT_SLUG="${UNIT_NAME#unit-}"
UNIT_BRANCH="ai-dlc/${INTENT_SLUG}/${UNIT_SLUG}"
WORKTREE_PATH="${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}-${UNIT_SLUG}"

if [ ! -d "$WORKTREE_PATH" ]; then
  # Always branch off the default branch
  source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
  DEFAULT_BRANCH=$(resolve_default_branch "auto" "$REPO_ROOT")
  git worktree add -B "$UNIT_BRANCH" "$WORKTREE_PATH" "$DEFAULT_BRANCH"
fi
```

2. **Mark unit as in_progress**:

```bash
update_unit_status "$UNIT_FILE" "in_progress"
```

3. **Resolve per-unit workflow** — read the unit's `workflow:` frontmatter field. If present, resolve it to a hat sequence. If absent, check for discipline-based defaults before falling back to the intent-level workflow:

```bash
UNIT_WORKFLOW_NAME=$(han parse yaml workflow -r --default "" < "$UNIT_FILE" 2>/dev/null || echo "")

# Discipline-based fallback: auto-route discipline: design → workflow: design
if [ -z "$UNIT_WORKFLOW_NAME" ]; then
  UNIT_DISCIPLINE=$(han parse yaml discipline -r --default "" < "$UNIT_FILE" 2>/dev/null || echo "")
  case "$UNIT_DISCIPLINE" in
    design) UNIT_WORKFLOW_NAME="design" ;;
    *)      ;;  # fall through to intent-level
  esac
fi

if [ -n "$UNIT_WORKFLOW_NAME" ]; then
  # Resolve unit-specific workflow
  UNIT_WORKFLOW_HATS=""
  if [ -f ".ai-dlc/workflows.yml" ]; then
    UNIT_WORKFLOW_HATS=$(han parse yaml "${UNIT_WORKFLOW_NAME}.hats" < ".ai-dlc/workflows.yml" 2>/dev/null || echo "")
  fi
  if [ -z "$UNIT_WORKFLOW_HATS" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/workflows.yml" ]; then
    UNIT_WORKFLOW_HATS=$(han parse yaml "${UNIT_WORKFLOW_NAME}.hats" < "${CLAUDE_PLUGIN_ROOT}/workflows.yml" 2>/dev/null || echo "")
  fi
  [ -z "$UNIT_WORKFLOW_HATS" ] && UNIT_WORKFLOW_HATS="$INTENT_WORKFLOW_HATS"
else
  UNIT_WORKFLOW_HATS="$INTENT_WORKFLOW_HATS"
fi

FIRST_HAT=$(echo "$UNIT_WORKFLOW_HATS" | jq -r '.[0]')
```

4. **Initialize unit state in `unitStates`** (includes the resolved workflow):

```bash
STATE=$(echo "$STATE" | han parse json \
  --set "unitStates.${UNIT_NAME}.hat=${FIRST_HAT}" \
  --set "unitStates.${UNIT_NAME}.retries=0" \
  --set "unitStates.${UNIT_NAME}.workflow=${UNIT_WORKFLOW_HATS}")
han keep save iteration.json "$STATE"
```

4. **Load hat instructions for the first hat**:

```bash
# Load hat instructions for the teammate's role
HAT_NAME="${FIRST_HAT}"
HAT_FILE=""
if [ -f ".ai-dlc/hats/${HAT_NAME}.md" ]; then
  HAT_FILE=".ai-dlc/hats/${HAT_NAME}.md"
elif [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/hats/${HAT_NAME}.md" ]; then
  HAT_FILE="${CLAUDE_PLUGIN_ROOT}/hats/${HAT_NAME}.md"
fi

# Extract instructions (content after second — in frontmatter)
HAT_INSTRUCTIONS=""
if [ -n "$HAT_FILE" ]; then
  HAT_INSTRUCTIONS=$(sed '1,/^---$/d' "$HAT_FILE" | sed '1,/^---$/d')
fi
```

5. **Select agent type based on hat**:

- `planner` -> `Plan` agent
- `builder` -> discipline-specific agent (see builder agent selection table below)
- All other hats (`reviewer`, `red-team`, `blue-team`, etc.) -> `general-purpose` agent

6. **Create shared task via TaskCreate**:

```javascript
TaskCreate({
  subject: `${FIRST_HAT}: ${unitName}`,
  description: `Execute ${FIRST_HAT} role for unit ${unitName}. Worktree: ${WORKTREE_PATH}`,
  activeForm: `${FIRST_HAT}: ${unitName}`
})
```

7. **Spawn teammate with hat instructions in prompt**:

```javascript
Task({
  subagent_type: getAgentTypeForHat(FIRST_HAT, unit.discipline),
  description: `${FIRST_HAT}: ${unitName}`,
  name: `${FIRST_HAT}-${unitSlug}`,
  team_name: `ai-dlc-${intentSlug}`,

  prompt: `
    Execute the ${FIRST_HAT} role for unit ${unitName}.

    ## Your Role: ${FIRST_HAT}
    ${HAT_INSTRUCTIONS}

    ## CRITICAL: Work in Worktree
    **Worktree path:** ${WORKTREE_PATH}
    **Branch:** ${UNIT_BRANCH}

    You MUST:
    1. cd ${WORKTREE_PATH}
    2. Verify you're on branch ${UNIT_BRANCH}
    3. Do ALL work in that directory
    4. Commit changes to that branch

    ## Repository Access (Cowork)
    If the worktree at ${WORKTREE_PATH} doesn't exist, clone from the remote:
    ```bash
    REPO_URL=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -n "$REPO_URL" ] && [ ! -d "${WORKTREE_PATH}" ]; then
      git clone "$REPO_URL" "${WORKTREE_PATH}"
      cd "${WORKTREE_PATH}"
      git checkout "${UNIT_BRANCH}"
    fi
    ```

    ## Unit: ${unitName}
    ## Completion Criteria
    ${unit.criteria}

    Work according to your role. Report completion via SendMessage to the team lead when done.
  `
})
```


### Step 4 (Teams): Monitor and React Loop

The lead processes auto-delivered teammate messages. Handle each event type:

#### Teammate Completes (Any Hat)

When a teammate reports successful completion:

1. Read current hat for this unit from `unitStates.{unit}.hat`
2. Read this unit's workflow from `unitStates.{unit}.workflow` (per-unit workflow, already resolved at spawn time)
3. Find current hat's index in the unit's workflow array
4. Determine next hat: `unitWorkflow[currentIndex + 1]`

**If next hat exists** (not at end of workflow):

a. Update `unitStates.{unit}.hat = nextHat`
b. Save state: `han keep save iteration.json "$STATE"`
c. Load hat file for nextHat:

```bash
HAT_NAME="${nextHat}"
HAT_FILE=""
if [ -f ".ai-dlc/hats/${HAT_NAME}.md" ]; then
  HAT_FILE=".ai-dlc/hats/${HAT_NAME}.md"
elif [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/hats/${HAT_NAME}.md" ]; then
  HAT_FILE="${CLAUDE_PLUGIN_ROOT}/hats/${HAT_NAME}.md"
fi
HAT_INSTRUCTIONS=""
if [ -n "$HAT_FILE" ]; then
  HAT_INSTRUCTIONS=$(sed '1,/^---$/d' "$HAT_FILE" | sed '1,/^---$/d')
fi
```

d. Select agent type based on hat:
   - `planner` -> `Plan` agent
   - `builder` -> discipline-specific agent (see builder agent selection table below)
   - All other hats (`reviewer`, `red-team`, `blue-team`, etc.) -> `general-purpose` agent

e. Spawn teammate with hat instructions in prompt:

```javascript
Task({
  subagent_type: getAgentTypeForHat(nextHat, unit.discipline),
  description: `${nextHat}: ${unitName}`,
  name: `${nextHat}-${unitSlug}`,
  team_name: `ai-dlc-${intentSlug}`,

  prompt: `
    Execute the ${nextHat} role for unit ${unitName}.

    ## Your Role: ${nextHat}
    ${HAT_INSTRUCTIONS}

    ## CRITICAL: Work in Worktree
    **Worktree path:** ${WORKTREE_PATH}
    **Branch:** ${UNIT_BRANCH}

    You MUST:
    1. cd ${WORKTREE_PATH}
    2. Verify you're on branch ${UNIT_BRANCH}
    3. Do ALL work in that directory
    4. Commit changes to that branch

    ## Repository Access (Cowork)
    If the worktree at ${WORKTREE_PATH} doesn't exist, clone from the remote:
    ```bash
    REPO_URL=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -n "$REPO_URL" ] && [ ! -d "${WORKTREE_PATH}" ]; then
      git clone "$REPO_URL" "${WORKTREE_PATH}"
      cd "${WORKTREE_PATH}"
      git checkout "${UNIT_BRANCH}"
    fi
    ```

    ## Unit: ${unitName}
    ## Completion Criteria
    ${unit.criteria}

    Work according to your role. Report completion via SendMessage to the team lead when done.
  `
})
```

**If no next hat** (last hat in workflow -- unit complete):

a. Mark unit as completed: `update_unit_status "$UNIT_FILE" "completed"`
b. Remove unit from `unitStates`
c. Merge or PR based on effective change strategy:

```bash
# Determine merge behavior based on per-unit or intent-level change strategy
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
CONFIG=$(get_ai_dlc_config "$INTENT_DIR")
AUTO_MERGE=$(echo "$CONFIG" | jq -r '.auto_merge // "true"')
AUTO_SQUASH=$(echo "$CONFIG" | jq -r '.auto_squash // "false"')
DEFAULT_BRANCH=$(echo "$CONFIG" | jq -r '.default_branch')

# Check per-unit change strategy override
UNIT_FILE="$INTENT_DIR/${UNIT_NAME}.md"
UNIT_CS=$(parse_unit_change_strategy "$UNIT_FILE")
EFFECTIVE_CS="${UNIT_CS:-$(echo "$CONFIG" | jq -r '.change_strategy // "unit"')}"
UNIT_BRANCH="ai-dlc/${INTENT_SLUG}/${UNIT_SLUG}"

if [ "$EFFECTIVE_CS" = "unit" ]; then
  # Per-unit strategy: create PR to default branch (same as advance/SKILL.md unit path)
  git push -u origin "$UNIT_BRANCH" 2>/dev/null || true

  UNIT_TICKET=$(han parse yaml ticket -r --default "" < "$UNIT_FILE" 2>/dev/null || echo "")
  TICKET_LINE=""
  [ -n "$UNIT_TICKET" ] && TICKET_LINE="Closes ${UNIT_TICKET}"

  gh pr create \
    --base "$DEFAULT_BRANCH" \
    --head "$UNIT_BRANCH" \
    --title "unit: ${UNIT_NAME}" \
    --body "## Unit: ${UNIT_NAME}

Part of intent: ${INTENT_SLUG}

${TICKET_LINE}

---
*Built with [AI-DLC](https://ai-dlc.dev)*" 2>/dev/null || echo "PR may already exist for $UNIT_BRANCH"

  WORKTREE_PATH="${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}-${UNIT_SLUG}"
  [ -d "$WORKTREE_PATH" ] && git worktree remove "$WORKTREE_PATH"

elif [ "$AUTO_MERGE" = "true" ]; then
  # Intent strategy: merge unit branch into intent branch (existing behavior)
  git checkout "ai-dlc/${INTENT_SLUG}/main"

  if [ "$AUTO_SQUASH" = "true" ]; then
    git merge --squash "$UNIT_BRANCH"
    git commit -m "unit: ${UNIT_NAME} completed"
  else
    git merge --no-ff "$UNIT_BRANCH" -m "Merge ${UNIT_NAME} into intent branch"
  fi

  WORKTREE_PATH="${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}-${UNIT_SLUG}"
  [ -d "$WORKTREE_PATH" ] && git worktree remove "$WORKTREE_PATH"
fi
```

d. Check DAG for newly unblocked units
e. For each newly ready unit, spawn at `workflow[0]` (first hat):

```bash
FIRST_HAT=$(echo "$WORKFLOW_HATS" | jq -r '.[0]')
```

Then follow the same spawn logic from Step 3 (load hat instructions, select agent type, spawn teammate with hat instructions in prompt).

#### Teammate Reports Issues (Any Hat)

When a teammate reports issues or rejects the work:

1. Read current hat index from `workflow` array
2. Determine previous hat: `workflow[currentIndex - 1]`
3. Increment `unitStates.{unit}.retries`
4. If `retries >= 3`: Mark unit as blocked, document in `han keep save blockers.md`
5. Otherwise: Set `unitStates.{unit}.hat = previousHat`
6. Load hat file for previousHat
7. Spawn teammate at previous hat with the feedback/issues in the prompt

This means ANY hat can reject -- not just the reviewer. A red-team finding issues sends work back to the previous hat.

#### Blocked

1. Document the blocker in `han keep save blockers.md`
2. Check if ALL units are blocked
3. If all blocked, alert user: "All units blocked. Human intervention required."

### Step 5 (Teams): Integration Validation and Team Shutdown

When all units complete:

#### 5a. Run Integration Validation

Before shutting down the team, run the `/integrate` skill as a teammate on the **intent worktree** (not a unit worktree). Integration is implemented as an internal skill (see `plugin/skills/integrate/SKILL.md`), not a hat.

```bash
# Check if integration has already passed
INTEGRATOR_COMPLETE=$(echo "$STATE" | han parse json integratorComplete -r --default "false")

# Count total units
UNIT_COUNT=$(ls -1 "$INTENT_DIR"/unit-*.md 2>/dev/null | wc -l)
```

Skip integration if:
- Only one unit (the reviewer already validated it)
- ALL units effectively use `unit` strategy (each unit reviewed individually via per-unit MR)

Note: In hybrid mode (intent-level `intent` + some units overriding to `unit`), integration still runs because non-unit units merge into the intent branch and need integration verification.

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
CONFIG=$(get_ai_dlc_config "$INTENT_DIR")

# Hybrid-aware check: iterate all units to determine if ALL effectively use "unit" strategy
ALL_UNIT_STRATEGY=true
for unit_file in "$INTENT_DIR"/unit-*.md; do
  [ -f "$unit_file" ] || continue
  UNIT_CS=$(parse_unit_change_strategy "$unit_file")
  EFFECTIVE_CS="${UNIT_CS:-$(echo "$CONFIG" | jq -r '.change_strategy // "unit"')}"
  [ "$EFFECTIVE_CS" != "unit" ] && { ALL_UNIT_STRATEGY=false; break; }
done

SKIP_INTEGRATOR=false
[ "$UNIT_COUNT" -le 1 ] && SKIP_INTEGRATOR=true
[ "$ALL_UNIT_STRATEGY" = "true" ] && SKIP_INTEGRATOR=true
```

If `SKIP_INTEGRATOR` is false and `integratorComplete` is not `true`:

Spawn the integrate skill as a teammate:

```javascript
Task({
  subagent_type: "general-purpose",
  description: `integrate: ${intentSlug}`,
  name: `integrate-${intentSlug}`,
  team_name: `ai-dlc-${intentSlug}`,

  prompt: `
    Run the /integrate skill for intent ${intentSlug}.

    ## CRITICAL: Work on Intent Branch
    **Worktree path:** .ai-dlc/worktrees/${intentSlug}/
    **Branch:** ai-dlc/${intentSlug}/main

    You MUST:
    1. cd .ai-dlc/worktrees/${intentSlug}/
    2. Verify you're on the intent branch (not a unit branch)
    3. This branch contains ALL merged unit work

    ## Intent-Level Success Criteria
    ${intentCriteria}

    ## Completed Units
    ${completedUnitsList}

    Verify that all units work together and intent-level criteria are met.
    Report ACCEPT or REJECT via SendMessage to the team lead.
  `
})
```

Handle integration result:

**If ACCEPT:** Set `integratorComplete = true`, proceed to shutdown below.

**If REJECT:** Re-queue rejected units (same logic as advance/SKILL.md Step 2e -- set status to `pending`, reset hat to first workflow hat). Spawn new teammates for re-queued units. Do NOT shut down the team.

#### 5b. Team Shutdown

After integration accepts (or if `integratorComplete` was already true):

1. Send shutdown requests to all active teammates:

```javascript
// For each active teammate
SendMessage({
  type: "shutdown_request",
  recipient: teammateName,
  content: "All units complete. Shutting down team."
})
```

2. Clean up team:

```javascript
TeamDelete()
```

3. **Check for next pass** before marking intent complete:

```bash
# Read pass configuration from intent.md
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
PASSES=$(grep '^passes:' "$INTENT_DIR/intent.md" | sed 's/passes: *//' | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/ //g' | grep -v '^$')
ACTIVE_PASS=$(grep '^active_pass:' "$INTENT_DIR/intent.md" | sed 's/active_pass: *//' | tr -d '"')

if [ -n "$PASSES" ] && [ -n "$ACTIVE_PASS" ]; then
  # Find the next pass after the active one
  NEXT_PASS=""
  FOUND_ACTIVE=false
  for pass in $PASSES; do
    if [ "$FOUND_ACTIVE" = "true" ]; then
      NEXT_PASS="$pass"
      break
    fi
    [ "$pass" = "$ACTIVE_PASS" ] && FOUND_ACTIVE=true
  done

  if [ -n "$NEXT_PASS" ]; then
    echo "PASS_TRANSITION: $ACTIVE_PASS -> $NEXT_PASS"
  fi
fi
```

**If a next pass exists:** Do NOT mark intent complete. Instead:
1. Update `active_pass` in intent.md frontmatter to the next pass
2. Notify the user: "The **{active_pass}** pass is complete. The next pass is **{next_pass}**. Run `/elaborate` to define {next_pass} units using the artifacts from the {active_pass} pass."
3. Save state with `status=pass_transition`
4. Stop construction — the user will re-elaborate for the next pass

**If no next pass** (last pass or no passes configured):

Mark intent complete:

```bash
STATE=$(echo "$STATE" | han parse json --set "status=complete")
han keep save iteration.json "$STATE"
```

4. Output completion summary (same as current Step 5 format from `/advance`)

#### 5c. Delivery Prompt

**Gate on change strategy.** The delivery prompt only applies to intent-level strategy, where all unit work merges into a single intent branch that needs delivery. With unit strategy, each unit already has its own PR — there's nothing to deliver as a whole.

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
CONFIG=$(get_ai_dlc_config "$INTENT_DIR")
CHANGE_STRATEGY=$(echo "$CONFIG" | jq -r '.change_strategy // "unit"')

# Check if ALL units effectively use unit strategy (including hybrid)
ALL_UNIT_STRATEGY=true
for unit_file in "$INTENT_DIR"/unit-*.md; do
  [ -f "$unit_file" ] || continue
  UNIT_CS=$(parse_unit_change_strategy "$unit_file")
  EFFECTIVE_CS="${UNIT_CS:-$CHANGE_STRATEGY}"
  [ "$EFFECTIVE_CS" != "unit" ] && { ALL_UNIT_STRATEGY=false; break; }
done
```

**If ALL units use unit strategy** (`ALL_UNIT_STRATEGY=true`): Skip the delivery prompt entirely. Each unit already has its own PR. Output:

```
All unit PRs have been created during construction. Review and merge them individually.

To clean up:
  /reset
```

**If intent strategy** (or hybrid with non-unit units): Ask the user how to deliver using `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "How would you like to deliver this intent?",
    "header": "Delivery",
    "options": [
      {"label": "Open PR/MR for delivery", "description": "Create a pull/merge request to merge into the default branch"},
      {"label": "I'll handle it", "description": "Just show me the branch details"}
    ],
    "multiSelect": false
  }]
}
```

**If PR/MR:**

1. Push intent branch to remote (if not already):

```bash
INTENT_BRANCH="ai-dlc/${INTENT_SLUG}/main"
git push -u origin "$INTENT_BRANCH" 2>/dev/null || true
```

2. Collect ticket references from all units:

```bash
DEFAULT_BRANCH=$(echo "$CONFIG" | jq -r '.default_branch')

TICKET_REFS=""
for unit_file in "$INTENT_DIR"/unit-*.md; do
  [ -f "$unit_file" ] || continue
  TICKET=$(han parse yaml ticket -r --default "" < "$unit_file" 2>/dev/null || echo "")
  if [ -n "$TICKET" ]; then
    TICKET_REFS="${TICKET_REFS}\nCloses ${TICKET}"
  fi
done
```

3. Create PR/MR:

```bash
gh pr create \
  --title "${INTENT_TITLE}" \
  --base "$DEFAULT_BRANCH" \
  --head "$INTENT_BRANCH" \
  --body "$(cat <<EOF
## Summary
${PROBLEM_SECTION}

${SOLUTION_SECTION}

## Test Plan
${SUCCESS_CRITERIA_AS_CHECKLIST}

## Changes
${COMPLETED_UNITS_AS_CHANGE_LIST}

$(printf "%b" "${TICKET_REFS}")

---
*Built with [AI-DLC](https://ai-dlc.dev)*
EOF
)"
```

4. Output the PR URL.

**If manual:**

```
Intent branch ready: ai-dlc/{intent-slug}/main → ${DEFAULT_BRANCH}

To merge:
  git checkout ${DEFAULT_BRANCH}
  git merge --no-ff ai-dlc/{intent-slug}/main

To create PR manually:
  gh pr create --base ${DEFAULT_BRANCH} --head ai-dlc/{intent-slug}/main

To clean up:
  /reset
```

### Per-Unit Hat Tracking

The `iteration.json` is extended with `unitStates` for parallel hat tracking:

```json
{
  "iteration": 3,
  "hat": "builder",
  "status": "active",
  "workflowName": "default",
  "workflow": ["planner", "builder", "reviewer"],
  "teamName": "ai-dlc-my-intent",
  "unitStates": {
    "unit-01-foundation": { "hat": "reviewer", "retries": 0, "workflow": ["planner", "builder", "reviewer"] },
    "unit-02-design-dashboard": { "hat": "designer", "retries": 0, "workflow": ["planner", "designer", "reviewer"] },
    "unit-03-dag-view": { "hat": "builder", "retries": 1, "workflow": ["planner", "builder", "reviewer"] }
  }
}
```

- `hat`: Current hat for this specific unit
- `retries`: Number of reviewer rejection cycles (max 3 before escalating to blocked)
- `workflow`: The hat sequence for this unit (resolved from unit frontmatter `workflow:` field, falling back to intent-level workflow)
- Units are added when spawned, removed when completed

---

### Fallback: Sequential Subagent Execution

**Used when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is NOT set.**

The following steps execute units one-at-a-time using standard Task subagents.

#### Step 2: Create Unit Worktree

**CRITICAL: All work MUST happen in an isolated worktree.**

This prevents conflicts with the parent session and enables true isolation.

```bash
# If targeting a specific unit, use it directly; otherwise find next ready unit
TARGET_UNIT=$(echo "$STATE" | han parse json targetUnit -r --default "")
if [ -n "$TARGET_UNIT" ]; then
  UNIT_FILE="$INTENT_DIR/${TARGET_UNIT}.md"
else
  UNIT_FILE=$(find_ready_unit "$INTENT_DIR")
fi
UNIT_NAME=$(basename "$UNIT_FILE" .md)  # e.g., unit-01-core-backend
UNIT_SLUG="${UNIT_NAME#unit-}"  # e.g., 01-core-backend
UNIT_BRANCH="ai-dlc/${intentSlug}/${UNIT_SLUG}"
WORKTREE_PATH="${REPO_ROOT}/.ai-dlc/worktrees/${intentSlug}-${UNIT_SLUG}"

# Create worktree if it doesn't exist
if [ ! -d "$WORKTREE_PATH" ]; then
  # Always branch off the default branch
  source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
  DEFAULT_BRANCH=$(resolve_default_branch "auto" "$REPO_ROOT")
  git worktree add -B "$UNIT_BRANCH" "$WORKTREE_PATH" "$DEFAULT_BRANCH"
fi
```

#### Step 2b: Update Unit Status and Track Current Unit

**CRITICAL: Mark the unit as `in_progress` BEFORE spawning the subagent.**

This ensures the DAG accurately reflects that work has started on this unit.

```bash
# Source the DAG library (CLAUDE_PLUGIN_ROOT is the jutsu-ai-dlc plugin directory)
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"

# Update unit status to in_progress in the intent worktree
# UNIT_FILE points to the file in .ai-dlc/{intent-slug}/
update_unit_status "$UNIT_FILE" "in_progress"
```

**Track current unit in iteration state** so `/advance` knows which unit to mark completed:

```bash
# Update currentUnit in state, e.g., "unit-01-core-backend"
# Intent-level state saved to current branch (intent branch)
STATE=$(echo "$STATE" | han parse json --set "currentUnit=$UNIT_NAME")
han keep save iteration.json "$STATE"
```

#### Step 3: Spawn Subagent

**CRITICAL: Do NOT execute hat work inline. Always spawn a subagent.**

##### Spawn based on `state.hat`

| Role | Agent Type | Description |
|------|------------|-------------|
| `planner` | `Plan` | Creates tactical implementation plan |
| `builder` | Based on unit `discipline` | Implements the plan |
| `reviewer` | `general-purpose` | Verifies completion criteria |

**Builder agent selection by unit discipline:**
- `frontend` -> `do-frontend-development:presentation-engineer`
- `backend` -> `general-purpose` with backend context
- `documentation` -> `do-technical-documentation:documentation-engineer`
- (other) -> `general-purpose`

##### Example spawn (standard subagents)

```javascript
Task({
  subagent_type: getAgentForRole(state.hat, unit.discipline),
  description: `${state.hat}: ${unit.name}`,
  prompt: `
    Execute the ${state.hat} role for this AI-DLC unit.

    ## CRITICAL: Work in Worktree
    **Worktree path:** ${WORKTREE_PATH}
    **Branch:** ${UNIT_BRANCH}

    You MUST:
    1. cd ${WORKTREE_PATH}
    2. Verify you're on branch ${UNIT_BRANCH}
    3. Do ALL work in that directory
    4. Commit changes to that branch

    ## Unit: ${unit.name}
    ## Completion Criteria
    ${unit.criteria}

    Work according to your role. Return clear status when done.
  `
})
```

The subagent automatically receives AI-DLC context (hat instructions, intent, workflow rules, unit status) via SubagentPrompt injection.

#### Step 4: Handle Subagent Result

Based on the subagent's response:
- **Success/Complete**: Call `/advance` to move to next role (or complete intent if all done)
- **Issues found** (reviewer): Call `/fail` to return to builder
- **Blocked**: Document and stop loop for user intervention

When `/advance` marks the intent complete (all units done + integration passed), proceed to Step 5.

**Note:** Integration validation is handled by `/advance` (Step 2e). When all units complete, `/advance` automatically runs the `/integrate` skill before marking the intent complete. If integration rejects, `/advance` re-queues units and the construction loop continues.

#### Step 5: Loop Behavior and Delivery

The construction loop is **fully autonomous**. It continues until:
1. **Complete** - All units done, `/advance` marks intent complete (after integration passes)
2. **All units blocked** - No forward progress possible, human must intervene
3. **Session exhausted** - Stop hook fires, instructs agent to call `/construct`
4. **Targeted unit done** - When `targetUnit` is set, stop after that unit's workflow completes (do NOT auto-continue to next unit)

**CRITICAL:** When `targetUnit` is NOT set, the agent MUST auto-continue between units. Do NOT stop after each unit.

**Targeted unit exception:** When `targetUnit` IS set, stop after the targeted unit's hat cycle completes. `/advance` handles clearing the `targetUnit` and outputting next-step guidance.

When the intent is marked complete, present the completion summary and delivery prompt (same as advance/SKILL.md Step 5 — ask user to open PR/MR or handle manually).
