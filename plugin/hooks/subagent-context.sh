#!/bin/bash
# subagent-context.sh - SubagentPrompt hook for AI-DLC
#
# Injects role-scoped AI-DLC context into subagent prompts:
# - Hat instructions (from hat file)
# - AI-DLC workflow rules (iteration management)
# - Unit/Bolt context (current unit, status, dependencies)
# - Intent and completion criteria
#
# Context scoping by role (saves ~400 tokens for review subagents):
#   review  (reviewer/red-team/blue-team) — skip bootstrap, worktree, resilience
#   build   (builder/implementer/refactorer) — full context
#   plan    (planner) — skip bootstrap, worktree, resilience; keep branch refs
#   full    (default) — everything included

set -e

# Source foundation libraries
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
source "${PLUGIN_ROOT}/lib/state.sh"
dlc_check_deps || exit 0

# Check for AI-DLC state
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
INTENT_DIR=$(dlc_find_active_intent)
[ -z "$INTENT_DIR" ] && exit 0
INTENT_SLUG=$(basename "$INTENT_DIR")
ITERATION_JSON=$(dlc_state_load "$INTENT_DIR" "iteration.json")
[ -z "$ITERATION_JSON" ] && exit 0

IS_UNIT_BRANCH=false
if [[ "$CURRENT_BRANCH" == ai-dlc/*/* ]] && [[ "$CURRENT_BRANCH" != ai-dlc/*/main ]]; then
  IS_UNIT_BRANCH=true
fi

# Single-pass extraction of iteration state fields
eval "$(echo "$ITERATION_JSON" | jq -r '@sh "
  ITERATION=\(.iteration // 1)
  HAT=\(.hat // \"\")
  STATUS=\(.status // \"active\")
  WORKFLOW_NAME=\(.workflowName // \"default\")
  WORKFLOW_HATS=\((.workflow // [\"planner\",\"builder\",\"reviewer\"]) | tostring)
"')"

# Skip if no active task
if [ "$STATUS" = "completed" ] || [ -z "$HAT" ]; then
  exit 0
fi

# Extract active_pass from intent frontmatter (zero-overhead when empty)
ACTIVE_PASS=""
if [ -f "${INTENT_DIR}/intent.md" ]; then
  ACTIVE_PASS=$(_state_yaml_get_simple "active_pass" "" < "${INTENT_DIR}/intent.md")
fi

PASS_INSTRUCTIONS=""
if [ -n "$ACTIVE_PASS" ]; then
  # shellcheck source=/dev/null
  source "${PLUGIN_ROOT}/lib/pass.sh"
  PASS_INSTRUCTIONS=$(load_pass_instructions "$ACTIVE_PASS")
fi

# Constrain workflow to pass's available workflows when active_pass is set
if [ -n "$ACTIVE_PASS" ]; then
  CONSTRAINED=$(constrain_workflow "$ACTIVE_PASS" "$WORKFLOW_NAME")
  if [ "$CONSTRAINED" != "$WORKFLOW_NAME" ]; then
    echo "Note: Workflow '$WORKFLOW_NAME' not available for '$ACTIVE_PASS' pass; using '$CONSTRAINED'." >&2
    WORKFLOW_NAME="$CONSTRAINED"
  fi
fi

# Role-scoped context — skip irrelevant sections for review-focused subagents
# Review hats don't need bootstrap, worktree setup, or resilience boilerplate
# This saves ~400 tokens per review subagent invocation
case "$HAT" in
  reviewer|red-team|blue-team)
    CONTEXT_SCOPE="review"
    ;;
  builder|implementer|refactorer)
    CONTEXT_SCOPE="build"
    ;;
  planner)
    CONTEXT_SCOPE="plan"
    ;;
  *)
    CONTEXT_SCOPE="full"
    ;;
esac

# Format workflow hats as arrow-separated list
WORKFLOW_HATS_STR=$(echo "$WORKFLOW_HATS" | tr -d '[]"' | sed 's/,/ → /g')
[ -z "$WORKFLOW_HATS_STR" ] && WORKFLOW_HATS_STR="planner → builder → reviewer"

# Read content from filesystem (source of truth)
INTENT_FILE="${INTENT_DIR}/intent.md"

if [ ! -f "$INTENT_FILE" ]; then
  # Intent file doesn't exist on disk - nothing to inject
  exit 0
fi

# Read intent from filesystem
INTENT=$(cat "$INTENT_FILE")

echo "## AI-DLC Subagent Context"
echo ""
STATUS_LINE="**Iteration:** $ITERATION | **Role:** $HAT | **Workflow:** $WORKFLOW_NAME ($WORKFLOW_HATS_STR)"
if [ -n "$ACTIVE_PASS" ]; then
  STATUS_LINE="$STATUS_LINE | **Pass:** $ACTIVE_PASS"
fi
echo "$STATUS_LINE"
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

# Source H•AI•K•U workspace integration (opt-in org memory)
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
      UNIT_STATUS=$(dlc_frontmatter_get "status" "$unit_file")
      [ -z "$UNIT_STATUS" ] && UNIT_STATUS="pending"
      DISCIPLINE=$(dlc_frontmatter_get "discipline" "$unit_file")
      [ -z "$DISCIPLINE" ] && DISCIPLINE="-"
      echo "| $NAME | $UNIT_STATUS | $DISCIPLINE |"
    done
    echo ""
  fi
fi

# In team mode, hat instructions are embedded in teammate prompts by /ai-dlc:execute
# Skip here to avoid injecting the orchestrator's hat instead of the per-unit hat
if [ -z "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" ]; then
  # Inject pass instructions before hat instructions (pass sets the lens, hat sets the role)
  if [ -n "$PASS_INSTRUCTIONS" ]; then
    PASS_META=$(load_pass_metadata "$ACTIVE_PASS" 2>/dev/null || echo "{}")
    PASS_DESC=$(printf '%s' "$PASS_META" | sed -n 's/.*"description":"\([^"]*\)".*/\1/p')
    echo "### Active Pass: $ACTIVE_PASS"
    echo ""
    if [ -n "$PASS_DESC" ]; then
      echo "**${ACTIVE_PASS}** — $PASS_DESC"
    else
      echo "**${ACTIVE_PASS}**"
    fi
    echo ""
    echo "$PASS_INSTRUCTIONS"
    echo ""
  fi

  # Load role/hat instructions using augmentation pattern (plugin hat + project augmentation)
  # shellcheck source=/dev/null
  source "${PLUGIN_ROOT}/lib/hat.sh"

  INSTRUCTIONS=$(load_hat_instructions "$HAT")
  HAT_META=$(load_hat_metadata "$HAT" 2>/dev/null || echo "{}")
  NAME=$(printf '%s' "$HAT_META" | sed -n 's/.*"name":"\([^"]*\)".*/\1/p')

  echo "### Current Role: $HAT"
  echo ""

  if [ -n "$INSTRUCTIONS" ]; then
    echo "**${NAME:-$HAT}**"
    echo ""
    echo "$INSTRUCTIONS"
    echo ""
  else
    # No hat file - role is an orchestrator that spawns discipline-specific agents
    echo "**$HAT** orchestrates work by spawning discipline-specific agents based on unit requirements."
    echo ""
  fi

fi

# Inject H•AI•K•U organizational memory (if workspace configured)
if type haiku_is_configured &>/dev/null && haiku_is_configured; then
  ORG_MEMORY=$(haiku_memory_context 60)
  if [ -n "$ORG_MEMORY" ]; then
    echo "### Organizational Memory (H•AI•K•U)"
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

# Branch references - useful for build and plan scopes, skip for review
REPO_ROOT=$(git worktree list --porcelain 2>/dev/null | head -1 | sed 's/^worktree //')
if [ "$CONTEXT_SCOPE" != "review" ]; then
  echo "### Branch References"
  echo ""
  echo "- **Intent branch:** \`ai-dlc/${INTENT_SLUG}/main\`"
  echo "- **Intent worktree:** \`${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}/\`"
  echo ""
  echo "To access intent-level state from a unit branch:"
  echo "\`\`\`bash"
  echo "cat .ai-dlc/${INTENT_SLUG}/state/<key>"
  echo "\`\`\`"
  echo ""
fi

# Bootstrap and Worktree — only for build/full scopes (not review or plan)
if [ "$CONTEXT_SCOPE" = "build" ] || [ "$CONTEXT_SCOPE" = "full" ]; then
  echo "### Bootstrap (MANDATORY)"
  echo ""
  echo "Your spawn prompt tells you which worktree and branch to use."
  echo "After entering your unit worktree, load unit-scoped state:"
  echo ""
  echo "\`\`\`bash"
  echo "# Load previous context from state files"
  echo "cat .ai-dlc/${INTENT_SLUG}/state/current-plan.md 2>/dev/null || true"
  echo "cat .ai-dlc/${INTENT_SLUG}/state/scratchpad.md 2>/dev/null || true"
  echo "cat .ai-dlc/${INTENT_SLUG}/state/blockers.md 2>/dev/null || true"
  echo "cat .ai-dlc/${INTENT_SLUG}/state/next-prompt.md 2>/dev/null || true"
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
fi

# Before Stopping and Resilience — only for build/full scopes
if [ "$CONTEXT_SCOPE" = "build" ] || [ "$CONTEXT_SCOPE" = "full" ]; then
  echo "### Before Stopping"
  echo ""
  echo "1. **Commit changes**: \`git add -A && git commit\`"
  echo "2. **Save scratchpad** (unit-scoped): save to \`.ai-dlc/${INTENT_SLUG}/state/scratchpad.md\`"
  echo "3. **Write next prompt** (unit-scoped): save to \`.ai-dlc/${INTENT_SLUG}/state/next-prompt.md\`"
  echo ""
  echo "**Note:** Unit-level state (scratchpad.md, next-prompt.md, blockers.md) is saved to \`.ai-dlc/${INTENT_SLUG}/state/\`."
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
fi
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
echo "Document blockers in \`.ai-dlc/${INTENT_SLUG}/state/blockers.md\` for persistence (unit-scoped)."
echo ""

# Team communication instructions (Agent Teams mode)
if [ -n "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" ]; then
  echo "### Team Communication"
  echo ""
  echo "You are a **teammate** in an Agent Teams session."
  echo "- Report completion/issues to team lead via SendMessage"
  echo "- Do NOT call /ai-dlc:execute, or read/execute the advance or fail skill definitions directly — the lead handles orchestration"
  echo "- Use TaskUpdate to mark shared tasks as completed when done"
  echo "- Coordinate with other teammates through the team lead"
  echo ""
fi
