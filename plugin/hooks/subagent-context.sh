#!/bin/bash
# subagent-context.sh - SubagentPrompt hook for AI-DLC
#
# Injects full AI-DLC context into subagent prompts:
# - Hat instructions (from hat file)
# - AI-DLC workflow rules (iteration management)
# - Unit/Bolt context (current unit, status, dependencies)
# - Intent and completion criteria

set -e

# Check for han CLI
if ! command -v han &> /dev/null; then
  exit 0
fi

# Check for AI-DLC state
# Intent-level state is stored on the intent branch
# If we're on a unit branch (ai-dlc/intent/unit), we need to check the parent intent branch
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
INTENT_BRANCH=""
ITERATION_JSON=""

# Try current branch first
ITERATION_JSON=$(han keep load iteration.json --quiet 2>/dev/null || echo "")

# If not found and we're on a unit branch, try the parent intent branch
# Unit branches: ai-dlc/{slug}/{unit-slug} (where unit-slug != "main")
# Intent branches: ai-dlc/{slug}/main
if [ -z "$ITERATION_JSON" ] && [[ "$CURRENT_BRANCH" == ai-dlc/*/* ]] && [[ "$CURRENT_BRANCH" != ai-dlc/*/main ]]; then
  # Extract intent branch: ai-dlc/intent-slug/unit-slug -> ai-dlc/intent-slug/main
  INTENT_BRANCH=$(echo "$CURRENT_BRANCH" | sed 's|^\(ai-dlc/[^/]*\)/.*|\1/main|')
  ITERATION_JSON=$(han keep load --branch "$INTENT_BRANCH" iteration.json --quiet 2>/dev/null || echo "")
fi

if [ -z "$ITERATION_JSON" ]; then
  # No AI-DLC state - nothing to inject
  exit 0
fi

# Parse iteration state
ITERATION=$(echo "$ITERATION_JSON" | han parse json iteration -r --default 1 2>/dev/null || echo "1")
HAT=$(echo "$ITERATION_JSON" | han parse json hat -r --default "" 2>/dev/null || echo "")
STATUS=$(echo "$ITERATION_JSON" | han parse json status -r --default active 2>/dev/null || echo "active")
WORKFLOW_NAME=$(echo "$ITERATION_JSON" | han parse json workflowName -r --default default 2>/dev/null || echo "default")

# Skip if no active task
if [ "$STATUS" = "complete" ] || [ -z "$HAT" ]; then
  exit 0
fi

# Get workflow hats array as string
WORKFLOW_HATS=$(echo "$ITERATION_JSON" | han parse json workflow 2>/dev/null || echo '["planner","builder","reviewer"]')
WORKFLOW_HATS_STR=$(echo "$WORKFLOW_HATS" | tr -d '[]"' | sed 's/,/ → /g')
[ -z "$WORKFLOW_HATS_STR" ] && WORKFLOW_HATS_STR="planner → builder → reviewer"

# Get intent-slug from han keep (pointer only, not content)
load_keep_value() {
  local key="$1"
  if [ -n "$INTENT_BRANCH" ]; then
    han keep load --branch "$INTENT_BRANCH" "$key" --quiet 2>/dev/null || echo ""
  else
    han keep load "$key" --quiet 2>/dev/null || echo ""
  fi
}

INTENT_SLUG=$(load_keep_value intent-slug)
if [ -z "$INTENT_SLUG" ]; then
  # No active intent - nothing to inject
  exit 0
fi

# Read content from filesystem (source of truth)
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
INTENT_FILE="${INTENT_DIR}/intent.md"

if [ ! -f "$INTENT_FILE" ]; then
  # Intent file doesn't exist on disk - nothing to inject
  exit 0
fi

# Read intent from filesystem
INTENT=$(cat "$INTENT_FILE")

echo "## AI-DLC Subagent Context"
echo ""
echo "**Iteration:** $ITERATION | **Role:** $HAT | **Workflow:** $WORKFLOW_NAME ($WORKFLOW_HATS_STR)"
echo ""

# Inject provider context
CONFIG_LIB="${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
if [ -f "$CONFIG_LIB" ]; then
  # shellcheck source=/dev/null
  source "$CONFIG_LIB" 2>/dev/null
  export_ai_dlc_config 2>/dev/null
  PROVIDERS_MD=$(format_providers_markdown 2>/dev/null)
  if [ -n "$PROVIDERS_MD" ]; then
    echo "$PROVIDERS_MD"
    echo ""
  fi
fi

# Output intent
echo "### Intent"
echo ""
echo "$INTENT"
echo ""

# Read completion criteria from filesystem (extracted from intent.md Success Criteria section)
# Or from a separate file if it exists
if [ -f "${INTENT_DIR}/completion-criteria.md" ]; then
  CRITERIA=$(cat "${INTENT_DIR}/completion-criteria.md")
  echo "### Completion Criteria"
  echo ""
  echo "$CRITERIA"
  echo ""
fi

# Inject discovery.md section headers (keep subagent context lean)
if [ -f "${INTENT_DIR}/discovery.md" ]; then
  DISCOVERY_HEADERS=$(grep -E '^## ' "${INTENT_DIR}/discovery.md" 2>/dev/null || true)
  if [ -n "$DISCOVERY_HEADERS" ]; then
    echo "### Discovery Log"
    echo ""
    echo "Elaboration findings available in \`.ai-dlc/${INTENT_SLUG}/discovery.md\`:"
    echo ""
    echo "$DISCOVERY_HEADERS"
    echo ""
    echo "*Read the full file for detailed findings.*"
    echo ""
  fi
fi

# Source HAIKU workspace integration (opt-in org memory)
HAIKU_LIB="${CLAUDE_PLUGIN_ROOT}/lib/haiku.sh"
if [ -f "$HAIKU_LIB" ]; then
  # shellcheck source=/dev/null
  source "$HAIKU_LIB"
fi

# Source DAG library if available
DAG_LIB="${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
if [ -f "$DAG_LIB" ]; then
  # shellcheck source=/dev/null
  source "$DAG_LIB"
fi

if [ -d "$INTENT_DIR" ] && ls "$INTENT_DIR"/unit-*.md 1>/dev/null 2>&1; then
  echo "### Unit Status"
  echo ""

  # Use DAG functions if available
  if type get_dag_status_table &>/dev/null; then
    get_dag_status_table "$INTENT_DIR"
    echo ""

    # Show ready and in-progress units
    if type find_ready_units &>/dev/null; then
      READY_UNITS=$(find_ready_units "$INTENT_DIR" | tr '\n' ' ' | sed 's/ $//')
      [ -n "$READY_UNITS" ] && echo "**Ready:** $READY_UNITS"
    fi

    if type find_in_progress_units &>/dev/null; then
      IN_PROGRESS=$(find_in_progress_units "$INTENT_DIR" | tr '\n' ' ' | sed 's/ $//')
      [ -n "$IN_PROGRESS" ] && echo "**In Progress:** $IN_PROGRESS"
    fi
    echo ""
  else
    # Fallback: simple unit list with discipline
    echo "| Unit | Status | Discipline |"
    echo "|------|--------|------------|"
    for unit_file in "$INTENT_DIR"/unit-*.md; do
      [ -f "$unit_file" ] || continue
      NAME=$(basename "$unit_file" .md)
      UNIT_STATUS=$(han parse yaml status -r --default pending < "$unit_file" 2>/dev/null || echo "pending")
      DISCIPLINE=$(han parse yaml discipline -r --default "-" < "$unit_file" 2>/dev/null || echo "-")
      echo "| $NAME | $UNIT_STATUS | $DISCIPLINE |"
    done
    echo ""
  fi
fi

# In team mode, hat instructions are embedded in teammate prompts by /construct
# Skip here to avoid injecting the orchestrator's hat instead of the per-unit hat
if [ -z "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" ]; then
  # Load role/hat instructions (builder/reviewer are orchestration roles)
  HAT_FILE=""
  if [ -f ".ai-dlc/hats/${HAT}.md" ]; then
    HAT_FILE=".ai-dlc/hats/${HAT}.md"
  elif [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md" ]; then
    HAT_FILE="${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md"
  fi

  echo "### Current Role: $HAT"
  echo ""

  if [ -n "$HAT_FILE" ] && [ -f "$HAT_FILE" ]; then
    # Parse frontmatter
    NAME=$(han parse yaml name -r --default "" < "$HAT_FILE" 2>/dev/null || echo "")

    # Get content after frontmatter
    INSTRUCTIONS=$(cat "$HAT_FILE" | sed '1,/^---$/d' | sed '1,/^---$/d')

    echo "**${NAME:-$HAT}**"
    echo ""
    if [ -n "$INSTRUCTIONS" ]; then
      echo "$INSTRUCTIONS"
      echo ""
    fi
  else
    # No hat file - role is an orchestrator that spawns discipline-specific agents
    echo "**$HAT** orchestrates work by spawning discipline-specific agents based on unit requirements."
    echo ""
  fi
fi

# Inject HAIKU organizational memory (if workspace configured)
if type haiku_is_configured &>/dev/null && haiku_is_configured; then
  ORG_MEMORY=$(haiku_memory_context 60)
  if [ -n "$ORG_MEMORY" ]; then
    echo "### Organizational Memory (HAIKU)"
    echo ""
    echo "$ORG_MEMORY"
    echo ""
  fi
fi

# AI-DLC Workflow Rules (mandatory for all subagents)
echo "---"
echo ""
echo "## AI-DLC Workflow Rules"
echo ""

# Branch references for cross-branch state access
echo "### Branch References"
echo ""
echo "- **Intent branch:** \`ai-dlc/${INTENT_SLUG}/main\`"
REPO_ROOT=$(git worktree list --porcelain 2>/dev/null | head -1 | sed 's/^worktree //')
echo "- **Intent worktree:** \`${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}/\`"
echo ""
echo "To access intent-level state from a unit branch:"
echo "\`\`\`bash"
echo "han keep load --branch \"ai-dlc/${INTENT_SLUG}/main\" <key>"
echo "\`\`\`"
echo ""

echo "### Bootstrap (MANDATORY)"
echo ""
echo "Your spawn prompt tells you which worktree and branch to use."
echo "After entering your unit worktree, load unit-scoped state:"
echo ""
echo "\`\`\`bash"
echo "# Load previous context from your unit branch"
echo "han keep load current-plan.md --quiet 2>/dev/null || true"
echo "han keep load scratchpad.md --quiet 2>/dev/null || true"
echo "han keep load blockers.md --quiet 2>/dev/null || true"
echo "han keep load next-prompt.md --quiet 2>/dev/null || true"
echo "\`\`\`"
echo ""
echo "These are scoped to YOUR branch. Read them to understand prior work on this unit."
echo ""

echo "### Worktree Isolation"
echo ""
echo "All bolt work MUST happen in an isolated worktree."
echo "Working outside a worktree will cause conflicts with the parent session."
echo ""
echo "After entering your worktree, verify:"
echo "1. You are in \`${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}-{unit-slug}/\`"
echo "2. You are on the correct unit branch (\`git branch --show-current\`)"
echo "3. You loaded unit-scoped state (see Bootstrap above)"
echo ""

echo "### Before Stopping"
echo ""
echo "1. **Commit changes**: \`git add -A && git commit\`"
echo "2. **Save scratchpad** (unit-scoped - your branch): \`han keep save scratchpad.md \"...\"\`"
echo "3. **Write next prompt** (unit-scoped - your branch): \`han keep save next-prompt.md \"...\"\`"
echo ""
echo "**Note:** Unit-level state (scratchpad.md, next-prompt.md, blockers.md) is saved to YOUR branch."
echo "Intent-level state (iteration.json, intent.md, etc.) is managed by the orchestrator on main."
echo ""
echo "### Resilience (CRITICAL)"
echo ""
echo "Bolts MUST attempt to rescue before declaring blocked:"
echo ""
echo "1. **Commit early, commit often** - Don't wait until the end"
echo "2. **If changes disappear** - Investigate, recreate, commit immediately"
echo "3. **If on wrong branch** - Switch to correct branch and continue"
echo "4. **If tests fail** - Fix and retry, don't give up"
echo "5. **Only declare blocked** after 3+ genuine rescue attempts"
echo ""
echo "### Communication"
echo ""
echo "**Notify users of important events:**"
echo ""
echo "- \`🚀 Starting:\` When beginning significant work"
echo "- \`✅ Completed:\` When a milestone is reached"
echo "- \`⚠️ Issue:\` When something needs attention but isn't blocking"
echo "- \`🛑 Blocked:\` When genuinely stuck after rescue attempts"
echo "- \`❓ Decision needed:\` Use \`AskUserQuestion\` for user input"
echo ""
echo "Output status messages directly - users see them in real-time."
echo "Document blockers in \`han keep save blockers.md\` for persistence (unit-scoped)."
echo ""

# Team communication instructions (Agent Teams mode)
if [ -n "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" ]; then
  echo "### Team Communication"
  echo ""
  echo "You are a **teammate** in an Agent Teams session."
  echo "- Report completion/issues to team lead via SendMessage"
  echo "- Do NOT call /construct, /advance, or /fail — the lead handles orchestration"
  echo "- Use TaskUpdate to mark shared tasks as completed when done"
  echo "- Coordinate with other teammates through the team lead"
  echo ""
fi
