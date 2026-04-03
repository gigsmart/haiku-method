#!/bin/bash
# inject-context.sh - SessionStart hook for H·AI·K·U
#
# Injects iteration context from filesystem state:
# - Current hat and instructions (from hats/ directory)
# - Intent and completion criteria
# - Previous scratchpad/blockers
# - Iteration number and workflow

set -e

# Read stdin to get SessionStart payload
HOOK_INPUT=$(cat)

# Extract source field using bash pattern matching (avoid subprocess)
if [[ "$HOOK_INPUT" =~ \"source\":\ *\"([^\"]+)\" ]]; then
  SOURCE="${BASH_REMATCH[1]}"
else
  SOURCE="startup"
fi

# Source foundation libraries
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
source "${PLUGIN_ROOT}/lib/state.sh"
hku_check_deps || exit 0

# Cache git branch (used multiple times)
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")

# Source DAG library if available
DAG_LIB="${PLUGIN_ROOT}/lib/dag.sh"
if [ -f "$DAG_LIB" ]; then
  # shellcheck source=/dev/null
  source "$DAG_LIB"
fi

# Source config library once (used for providers, maturity detection, etc.)
CONFIG_LIB="${PLUGIN_ROOT}/lib/config.sh"
if [ -f "$CONFIG_LIB" ]; then
  # shellcheck source=/dev/null
  source "$CONFIG_LIB"
fi

# Detect legacy AI-DLC intents (notice only, no auto-migration)
# migrate.sh is sourced transitively via config.sh above
if type hku_detect_legacy_intents &>/dev/null; then
  hku_detect_legacy_intents "$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
fi

# Source H•AI•K•U workspace integration (opt-in org memory)
HAIKU_LIB="${PLUGIN_ROOT}/lib/haiku.sh"
if [ -f "$HAIKU_LIB" ]; then
  # shellcheck source=/dev/null
  source "$HAIKU_LIB"
fi

# Source telemetry library (non-blocking, no-op when disabled)
TELEMETRY_LIB="${PLUGIN_ROOT}/lib/telemetry.sh"
if [ -f "$TELEMETRY_LIB" ]; then
  # shellcheck source=/dev/null
  source "$TELEMETRY_LIB"
  haiku_telemetry_init
fi

# Detect project maturity (greenfield / early / established)
PROJECT_MATURITY=""
if type detect_project_maturity &>/dev/null; then
  PROJECT_MATURITY=$(detect_project_maturity)
fi

# Source stage and hat libraries for stage-based resolution
source "${PLUGIN_ROOT}/lib/hat.sh"

# Note: _yaml_get_simple is provided by dag.sh (sourced above)
# Alias for consistency in this file
yaml_get_simple() {
  _yaml_get_simple "$@"
}

# POST-MERGE RECONCILIATION: Fix stale statuses on default branch
# When an intent PR merges to main with status: active, fix it automatically
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@.*/@@' || echo "main")
if [ "$CURRENT_BRANCH" = "$DEFAULT_BRANCH" ]; then
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
  for reconcile_intent_file in "$REPO_ROOT"/.haiku/*/intent.md; do
    [ -f "$reconcile_intent_file" ] || continue
    reconcile_dir=$(dirname "$reconcile_intent_file")
    reconcile_status=$(_state_yaml_get_simple "status" "pending" < "$reconcile_intent_file")

    # Only reconcile active intents
    [ "$reconcile_status" = "active" ] || continue

    # Check if all units are completed
    reconcile_all_done=true
    reconcile_has_units=false
    for reconcile_unit_file in "$reconcile_dir"/unit-*.md; do
      [ -f "$reconcile_unit_file" ] || continue
      reconcile_has_units=true
      reconcile_unit_status=$(_state_yaml_get_simple "status" "pending" < "$reconcile_unit_file")
      if [ "$reconcile_unit_status" != "completed" ]; then
        reconcile_all_done=false
        break
      fi
    done

    # If has units and all completed, mark intent as completed
    if [ "$reconcile_has_units" = "true" ] && [ "$reconcile_all_done" = "true" ]; then
      hku_frontmatter_set "status" "completed" "$reconcile_intent_file"
      # Check off intent-level completion criteria checkboxes
      hku_check_intent_criteria "$reconcile_dir"
      # Also check off unit criteria
      for reconcile_unit_file in "$reconcile_dir"/unit-*.md; do
        [ -f "$reconcile_unit_file" ] || continue
        hku_check_unit_criteria "$reconcile_unit_file"
      done
      source "${PLUGIN_ROOT}/lib/persistence.sh"
      persistence_save "$(basename "$reconcile_dir")" "status: reconcile $(basename "$reconcile_dir") after merge" \
        "$reconcile_intent_file" "$reconcile_dir"/unit-*.md \
        "$reconcile_dir/completion-criteria.md" "$reconcile_dir/state/completion-criteria.md" 2>/dev/null || true
    fi
  done
fi

# Check for H·AI·K·U state
# Load iteration state from filesystem
INTENT_DIR=$(hku_find_active_intent)
ITERATION_JSON=""
IS_UNIT_BRANCH=false
[[ "$CURRENT_BRANCH" == haiku/*/* ]] && [[ "$CURRENT_BRANCH" != haiku/*/main ]] && IS_UNIT_BRANCH=true
if [ -n "$INTENT_DIR" ]; then
  ITERATION_JSON=$(hku_state_load "$INTENT_DIR" "iteration.json")
fi

if [ -z "$ITERATION_JSON" ]; then
  # Greenfield fast-path: skip all scanning for brand new projects
  if [ "$PROJECT_MATURITY" = "greenfield" ]; then
    echo "## H·AI·K·U Available (Greenfield Project)"
    echo ""
    echo "**Project maturity:** greenfield"
    echo ""
    echo "No active H·AI·K·U task. This looks like a new project — run \`/ai-dlc:elaborate\` to start defining your first intent."
    echo ""
    if [ ! -f ".haiku/settings.yml" ]; then
      echo "> **First time?** Run \`/ai-dlc:setup\` to configure H·AI·K·U for this project (auto-detects providers, VCS settings, etc.)"
      echo ""
    fi
    # Inject provider context
    if type format_providers_markdown &>/dev/null; then
      PROVIDERS_MD=$(format_providers_markdown)
      if [ -n "$PROVIDERS_MD" ]; then
        echo "$PROVIDERS_MD"
        echo ""
      fi
    fi
    echo "### Task Routing"
    echo ""
    echo "When a user describes a task without a slash command, assess scope and suggest a path:"
    echo ""
    echo "| Signal | Quick | Elaborate |"
    echo "|--------|-------|-----------|"
    echo "| Files touched | 1-2 files | 3+ files or cross-cutting |"
    echo "| Nature | Typo, rename, config, lint fix | New feature, refactor, architecture |"
    echo "| Tests needed | None or existing pass | New tests required |"
    echo "| Design decisions | None | Any |"
    echo ""
    echo "**Routing:**"
    echo "- Simple fix/typo/rename → \`/ai-dlc:quick <task>\`"
    echo "- New feature / multi-file / architecture → \`/ai-dlc:elaborate\`"
    echo ""
    echo "Always confirm your routing suggestion with the user before proceeding."
    echo ""
    exit 0
  fi

  # Discover resumable intents from filesystem and git branches
  declare -A FILESYSTEM_INTENTS
  declare -A BRANCH_INTENTS

  # 1. Check filesystem first (highest priority - source of truth)
  for intent_file in .haiku/*/intent.md; do
    [ -f "$intent_file" ] || continue
    dir=$(dirname "$intent_file")
    slug=$(basename "$dir")
    # Use fast yaml extraction (no subprocess)
    status=$(yaml_get_simple "status" "active" < "$intent_file")
    [ "$status" = "active" ] || continue
    studio=$(yaml_get_simple "studio" "software" < "$intent_file")

    # Get unit summary if DAG functions are available
    summary=""
    if type get_dag_summary &>/dev/null && [ -d "$dir" ]; then
      summary=$(get_dag_summary "$dir")
    fi
    FILESYSTEM_INTENTS[$slug]="$studio|$summary"
  done

  # 2. Discover intents on git branches (local only for performance)
  if type discover_branch_intents &>/dev/null; then
    while IFS='|' read -r slug studio source branch; do
      [ -z "$slug" ] && continue
      # Skip if already found in filesystem
      [ -n "${FILESYSTEM_INTENTS[$slug]}" ] && continue
      BRANCH_INTENTS[$slug]="$studio|$source|$branch"
    done < <(discover_branch_intents false)
  fi

  # Build output if any intents found
  if [ ${#FILESYSTEM_INTENTS[@]} -gt 0 ] || [ ${#BRANCH_INTENTS[@]} -gt 0 ]; then
    echo "## H·AI·K·U: Resumable Intents Found"
    echo ""

    # Show filesystem intents first
    if [ ${#FILESYSTEM_INTENTS[@]} -gt 0 ]; then
      echo "### In Current Directory"
      echo ""
      for slug in "${!FILESYSTEM_INTENTS[@]}"; do
        IFS='|' read -r studio summary <<< "${FILESYSTEM_INTENTS[$slug]}"
        echo "- **$slug**"
        if [ -n "$summary" ]; then
          completed=$(echo "$summary" | sed -n 's/.*completed:\([0-9]*\).*/\1/p')
          pending=$(echo "$summary" | sed -n 's/.*pending:\([0-9]*\).*/\1/p')
          in_prog=$(echo "$summary" | sed -n 's/.*in_progress:\([0-9]*\).*/\1/p')
          total=$((completed + pending + in_prog))
          [ "$total" -gt 0 ] && echo "  - Units: $completed/$total completed"
        fi
      done
      echo ""
    fi

    # Show branch intents grouped by source
    declare -A LOCAL_BRANCH_INTENTS
    declare -A REMOTE_BRANCH_INTENTS
    for slug in "${!BRANCH_INTENTS[@]}"; do
      IFS='|' read -r studio source branch <<< "${BRANCH_INTENTS[$slug]}"
      case "$source" in
        worktree|local)
          LOCAL_BRANCH_INTENTS[$slug]="$studio|$branch"
          ;;
        remote)
          REMOTE_BRANCH_INTENTS[$slug]="$studio|$branch"
          ;;
      esac
    done

    if [ ${#LOCAL_BRANCH_INTENTS[@]} -gt 0 ]; then
      echo "### On Local Branches (no worktree)"
      echo ""
      for slug in "${!LOCAL_BRANCH_INTENTS[@]}"; do
        IFS='|' read -r studio branch <<< "${LOCAL_BRANCH_INTENTS[$slug]}"
        echo "- **$slug**"
        echo "  - *Branch: \`$branch\`*"
      done
      echo ""
    fi

    # Note: Remote intents not scanned by default for performance
    # Show hint instead
    if type discover_branch_intents &>/dev/null; then
      echo "*Run \`git fetch\` for remote intents (not scanned at startup for performance)*"
      echo ""
    fi

    echo "**To resume:** \`/ai-dlc:resume <slug>\` or \`/ai-dlc:resume\` if only one"
    echo ""
    if [ ! -f ".haiku/settings.yml" ]; then
      echo "> **Tip:** Run \`/ai-dlc:setup\` to configure providers and VCS settings. This enables automatic ticket sync during elaboration."
      echo ""
    fi
    # Inject provider context for pre-elaboration awareness
    if type format_providers_markdown &>/dev/null; then
      PROVIDERS_MD=$(format_providers_markdown)
      if [ -n "$PROVIDERS_MD" ]; then
        echo "$PROVIDERS_MD"
        echo ""
      fi
    fi
  else
    echo "## H·AI·K·U Available"
    echo ""
    if [ -n "$PROJECT_MATURITY" ]; then
      echo "**Project maturity:** $PROJECT_MATURITY"
      echo ""
    fi
    echo "No active H·AI·K·U task. Run \`/ai-dlc:elaborate\` to start a new task."
    echo ""
    if [ ! -f ".haiku/settings.yml" ]; then
      echo "> **First time?** Run \`/ai-dlc:setup\` to configure H·AI·K·U for this project (auto-detects providers, VCS settings, etc.)"
      echo ""
    fi
    # Inject provider context
    if type format_providers_markdown &>/dev/null; then
      PROVIDERS_MD=$(format_providers_markdown)
      if [ -n "$PROVIDERS_MD" ]; then
        echo "$PROVIDERS_MD"
        echo ""
      fi
    fi
    echo "### Task Routing"
    echo ""
    echo "When a user describes a task without a slash command, assess scope and suggest a path:"
    echo ""
    echo "| Signal | Quick | Elaborate |"
    echo "|--------|-------|-----------|"
    echo "| Files touched | 1-2 files | 3+ files or cross-cutting |"
    echo "| Nature | Typo, rename, config, lint fix | New feature, refactor, architecture |"
    echo "| Tests needed | None or existing pass | New tests required |"
    echo "| Design decisions | None | Any |"
    echo ""
    echo "**Routing:**"
    echo "- Simple fix/typo/rename → \`/ai-dlc:quick <task>\`"
    echo "- New feature / multi-file / architecture → \`/ai-dlc:elaborate\`"
    echo ""
    echo "Always confirm your routing suggestion with the user before proceeding."
    echo ""
  fi
  exit 0
fi

# Validate JSON syntax
if ! echo "$ITERATION_JSON" | hku_json_validate; then
  echo "Warning: Invalid iteration.json format. Run /ai-dlc:reset to clear state." >&2
  exit 0
fi

# Migration: strip deprecated unitStates field
if echo "$ITERATION_JSON" | jq -e '.unitStates' &>/dev/null; then
  ITERATION_JSON=$(echo "$ITERATION_JSON" | jq 'del(.unitStates)')
  [ -n "$INTENT_DIR" ] && hku_state_save "$INTENT_DIR" "iteration.json" "$ITERATION_JSON" 2>/dev/null || true
fi

# Single-pass extraction of all iteration state fields (one jq subprocess instead of 10+)
eval "$(echo "$ITERATION_JSON" | jq -r '@sh "
  PHASE=\(.phase // \"\")
  NEEDS_ADVANCE=\(.needsAdvance // false)
  ITERATION=\(.iteration // 1)
  HAT=\(.hat // \"planner\")
  STATUS=\(.status // \"active\")
  CURRENT_UNIT=\(.currentUnit // \"\")
  MAX_ITERATIONS=\(.maxIterations // 0)
  TARGET_UNIT=\(.targetUnit // \"\")
  INTENT_SLUG_STATE=\(.intentSlug // \"\")
"')"

# State migration: add 'phase' field if missing (backward compat with pre-H•AI•K•U state)
if [ -z "$PHASE" ]; then
  # Infer phase from current hat
  case "$HAT" in
    planner) PHASE="elaboration" ;;
    *) PHASE="execution" ;;
  esac
  ITERATION_JSON=$(echo "$ITERATION_JSON" | hku_json_set "phase" "$PHASE" || echo "$ITERATION_JSON")
  [ -n "$INTENT_DIR" ] && hku_state_save "$INTENT_DIR" "iteration.json" "$ITERATION_JSON" 2>/dev/null || true
fi

# Validate phase against known enum
PHASE=$(hku_validate_phase "$PHASE")

# Check for needsAdvance flag (set by Stop hook to signal iteration should increment)
# Only advance on 'clear' or 'startup' sources - NOT on 'compact' events.
#
# Source types:
#   - startup: New session starting (may advance iteration)
#   - clear: Context was manually cleared (may advance iteration)
#   - compact: Context window compaction by Claude (NEVER advance - this is just summarization)
#
# Note: This read-modify-write pattern is safe because Claude Code serializes
# hook execution within a session. Cross-session race conditions are possible
# but unlikely in practice since iterations are scoped to a branch/intent.
if [ "$NEEDS_ADVANCE" = "true" ] && [ "$SOURCE" != "compact" ]; then
  # Increment iteration and clear the flag
  NEW_ITER=$((ITERATION + 1))
  ITERATION_JSON=$(echo "$ITERATION_JSON" | hku_json_set "iteration" "$NEW_ITER")
  ITERATION_JSON=$(echo "$ITERATION_JSON" | hku_json_set "needsAdvance" "false")
  ITERATION=$NEW_ITER
  NEEDS_ADVANCE="false"
  # Save updated state
  [ -n "$INTENT_DIR" ] && hku_state_save "$INTENT_DIR" "iteration.json" "$ITERATION_JSON" 2>/dev/null || true

  # Emit telemetry for bolt iteration advance
  if type haiku_log_event &>/dev/null; then
    haiku_record_bolt_iteration "$INTENT_SLUG_STATE" "$TARGET_UNIT" "$NEW_ITER" "advanced"
  fi
fi

# Extract active_pass from intent frontmatter (zero-overhead when empty)
ACTIVE_PASS=""
if [ -n "$INTENT_DIR" ] && [ -f "${INTENT_DIR}/intent.md" ]; then
  ACTIVE_PASS=$(yaml_get_simple "active_pass" "" < "${INTENT_DIR}/intent.md")
fi

PASS_INSTRUCTIONS=""
if [ -n "$ACTIVE_PASS" ]; then
  # shellcheck source=/dev/null
  source "${PLUGIN_ROOT}/lib/pass.sh"
  PASS_INSTRUCTIONS=$(load_pass_instructions "$ACTIVE_PASS")
fi

# Resolve active stage and studio from intent for stage-based hat resolution
ACTIVE_STAGE=""
STUDIO=""
if [ -n "$INTENT_DIR" ] && [ -f "${INTENT_DIR}/intent.md" ]; then
  ACTIVE_STAGE=$(yaml_get_simple "active_stage" "" < "${INTENT_DIR}/intent.md")
  STUDIO=$(yaml_get_simple "studio" "software" < "${INTENT_DIR}/intent.md")
fi
[ -z "$ACTIVE_STAGE" ] && ACTIVE_STAGE="development"
[ -z "$STUDIO" ] && STUDIO="software"

# Get hat sequence from stage
STAGE_HATS_STR=$(hku_get_hat_sequence "$ACTIVE_STAGE" "$STUDIO" 2>/dev/null | sed 's/ / → /g')
[ -z "$STAGE_HATS_STR" ] && STAGE_HATS_STR="planner → builder → reviewer"

# If task is complete, just show completion message
if [ "$STATUS" = "complete" ] || [ "$STATUS" = "completed" ]; then
  echo "## H·AI·K·U: Task Complete"
  echo ""
  echo "Previous task was completed. Run \`/ai-dlc:reset\` to start a new task."
  exit 0
fi

echo "## H·AI·K·U Context"
echo ""
STATUS_LINE="**Iteration:** $ITERATION | **Hat:** $HAT | **Stage:** $ACTIVE_STAGE ($STAGE_HATS_STR)"
if [ -n "$ACTIVE_PASS" ]; then
  STATUS_LINE="$STATUS_LINE | **Pass:** $ACTIVE_PASS"
fi
echo "$STATUS_LINE"
echo ""

# Inject provider context and maturity signal
if type format_providers_markdown &>/dev/null; then
  PROVIDERS_MD=$(format_providers_markdown)
  if [ -n "$PROVIDERS_MD" ]; then
    echo "$PROVIDERS_MD"
    echo ""
  fi
fi
if [ -n "$PROJECT_MATURITY" ]; then
  echo "**Project maturity:** $PROJECT_MATURITY"
  echo ""
fi

# Lazy learnings injection — count-based pointer instead of eager loading
LEARNINGS_DIR="docs/solutions"
if [ -d "$LEARNINGS_DIR" ]; then
  LEARNING_COUNT=$(find "$LEARNINGS_DIR" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [ "$LEARNING_COUNT" -gt 0 ]; then
    echo ""
    echo "📚 **${LEARNING_COUNT} compound learnings available** in \`docs/solutions/\`."
    echo "The Planner hat will search these automatically before planning."
    echo "Use \`/ai-dlc:compound\` to capture new learnings."
  fi
fi

# Batch load all state values from filesystem
load_all_state_values() {
  declare -gA STATE_VALUES

  if [ -z "$INTENT_DIR" ]; then
    return
  fi

  # Load intent-level keys
  STATE_VALUES[current-plan.md]=$(hku_state_load "$INTENT_DIR" "current-plan.md")

  # Load unit-level keys
  STATE_VALUES[blockers.md]=$(hku_state_load "$INTENT_DIR" "blockers.md")
  STATE_VALUES[scratchpad.md]=$(hku_state_load "$INTENT_DIR" "scratchpad.md")
  STATE_VALUES[next-prompt.md]=$(hku_state_load "$INTENT_DIR" "next-prompt.md")
}

# Derive intent slug from directory
INTENT_SLUG=""
[ -n "$INTENT_DIR" ] && INTENT_SLUG=$(basename "$INTENT_DIR")

# Load all state values in batch
load_all_state_values

# Load and display intent from filesystem (source of truth)
if [ -n "$INTENT_DIR" ] && [ -f "${INTENT_DIR}/intent.md" ]; then
  echo "### Intent"
  echo ""
  cat "${INTENT_DIR}/intent.md"
  echo ""
fi

# Load completion criteria from filesystem if exists
if [ -n "$INTENT_DIR" ] && [ -f "${INTENT_DIR}/completion-criteria.md" ]; then
  echo "### Completion Criteria"
  echo ""
  cat "${INTENT_DIR}/completion-criteria.md"
  echo ""
fi

# Show discovery.md availability indicator
if [ -n "$INTENT_DIR" ] && [ -f "${INTENT_DIR}/discovery.md" ]; then
  DISCOVERY_COUNT=$(grep -cE '^## ' "${INTENT_DIR}/discovery.md" 2>/dev/null || echo "0")
  if [ "$DISCOVERY_COUNT" -gt 0 ]; then
    echo "### Discovery Log"
    echo ""
    echo "**${DISCOVERY_COUNT} sections** of elaboration findings available in \`.haiku/${INTENT_SLUG}/discovery.md\`"
    echo ""
  fi
fi

# Load and display current plan (from cached values)
PLAN="${STATE_VALUES[current-plan.md]}"
if [ -n "$PLAN" ]; then
  echo "### Current Plan"
  echo ""
  echo "$PLAN"
  echo ""
fi

# Load and display blockers (from cached values)
BLOCKERS="${STATE_VALUES[blockers.md]}"
if [ -n "$BLOCKERS" ]; then
  echo "### Previous Blockers"
  echo ""
  echo "$BLOCKERS"
  echo ""
fi

# Load and display scratchpad (from cached values)
SCRATCHPAD="${STATE_VALUES[scratchpad.md]}"
if [ -n "$SCRATCHPAD" ]; then
  echo "### Learnings from Previous Iteration"
  echo ""
  echo "$SCRATCHPAD"
  echo ""
fi

# Load and display next prompt (from cached values)
NEXT_PROMPT="${STATE_VALUES[next-prompt.md]}"
if [ -n "$NEXT_PROMPT" ]; then
  echo "### Continue With"
  echo ""
  echo "$NEXT_PROMPT"
  echo ""
fi

# Load and display DAG status (if units exist)
# INTENT_SLUG and INTENT_DIR already set above
if [ -n "$INTENT_DIR" ] && [ -d "$INTENT_DIR" ] && ls "$INTENT_DIR"/unit-*.md 1>/dev/null 2>&1; then
    echo "### Unit Status"
    echo ""

    # Use DAG functions if available
    if type get_dag_status_table &>/dev/null; then
      get_dag_status_table "$INTENT_DIR"
      echo ""

      # Show summary
      if type get_dag_summary &>/dev/null; then
        SUMMARY=$(get_dag_summary "$INTENT_DIR")
        # Parse summary into human-readable format
        # Format: "pending:N in_progress:N completed:N blocked:N ready:N"
        PENDING=$(echo "$SUMMARY" | sed -n 's/.*pending:\([0-9]*\).*/\1/p')
        IN_PROG=$(echo "$SUMMARY" | sed -n 's/.*in_progress:\([0-9]*\).*/\1/p')
        COMPLETED=$(echo "$SUMMARY" | sed -n 's/.*completed:\([0-9]*\).*/\1/p')
        BLOCKED=$(echo "$SUMMARY" | sed -n 's/.*blocked:\([0-9]*\).*/\1/p')
        READY=$(echo "$SUMMARY" | sed -n 's/.*ready:\([0-9]*\).*/\1/p')
        echo "**Summary:** $COMPLETED completed, $IN_PROG in_progress, $PENDING pending ($BLOCKED blocked), $READY ready"
        echo ""
      fi

      # Show ready units
      if type find_ready_units &>/dev/null; then
        READY_UNITS=$(find_ready_units "$INTENT_DIR" | tr '\n' ' ' | sed 's/ $//')
        if [ -n "$READY_UNITS" ]; then
          echo "**Ready for execution:** $READY_UNITS"
          echo ""
        fi
      fi

      # Show in-progress units
      if type find_in_progress_units &>/dev/null; then
        IN_PROGRESS=$(find_in_progress_units "$INTENT_DIR" | tr '\n' ' ' | sed 's/ $//')
        if [ -n "$IN_PROGRESS" ]; then
          echo "**Currently in progress:** $IN_PROGRESS"
          echo ""
        fi
      fi
    else
      # Fallback: simple unit list without DAG analysis
      echo "| Unit | Status |"
      echo "|------|--------|"
      for unit_file in "$INTENT_DIR"/unit-*.md; do
        [ -f "$unit_file" ] || continue
        NAME=$(basename "$unit_file" .md)
        STATUS=$(hku_frontmatter_get "status" "$unit_file")
        [ -z "$STATUS" ] && STATUS="pending"
        echo "| $NAME | $STATUS |"
      done
      echo ""
    fi
fi

# Display Agent Teams status if enabled
if [ -n "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" ]; then
  TEAM_NAME="ai-dlc-${INTENT_SLUG}"
  TEAM_CONFIG="${CLAUDE_CONFIG_DIR}/teams/${TEAM_NAME}/config.json"
  if [ -f "$TEAM_CONFIG" ]; then
    echo "### Agent Teams"
    echo ""
    echo "**Team:** \`${TEAM_NAME}\`"
    echo "**Mode:** Parallel execution enabled"
    echo ""
  fi
fi

# Load hat instructions from stage-based resolution
INSTRUCTIONS=$(hku_resolve_hat_instructions "$HAT" "$ACTIVE_STAGE" "$STUDIO")
HAT_META=$(load_hat_metadata "$HAT" "$ACTIVE_STAGE" "$STUDIO" 2>/dev/null || echo "{}")
NAME=$(printf '%s' "$HAT_META" | sed -n 's/.*"name":"\([^"]*\)".*/\1/p')
DESC=$(printf '%s' "$HAT_META" | sed -n 's/.*"description":"\([^"]*\)".*/\1/p')

# Inject pass instructions before hat instructions (pass sets the lens, hat sets the role)
if [ -n "$PASS_INSTRUCTIONS" ]; then
  PASS_META=$(load_pass_metadata "$ACTIVE_PASS" 2>/dev/null || echo "{}")
  PASS_DESC=$(printf '%s' "$PASS_META" | sed -n 's/.*"description":"\([^"]*\)".*/\1/p')
  echo "### Active Pass Instructions"
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

echo "### Current Hat Instructions"
echo ""

if [ -n "$INSTRUCTIONS" ]; then
  if [ -n "$DESC" ]; then
    echo "**${NAME:-$HAT}** — $DESC"
  else
    echo "**${NAME:-$HAT}**"
  fi
  echo ""
  echo "$INSTRUCTIONS"

else
  # No hat file found - show generic message
  echo "**$HAT** (Custom hat - no instructions found)"
  echo ""
  echo "Create a hat definition at \`.haiku/hats/${HAT}.md\` with:"
  echo ""
  echo "\`\`\`markdown"
  echo "---"
  echo "name: \"Your Hat Name\""
  echo "description: \"What this hat does\""
  echo "---"
  echo ""
  echo "# Hat Name"
  echo ""
  echo "Instructions for this hat..."
  echo "\`\`\`"
fi

# Designer and reviewer hats: inject design provider capabilities for tool discovery
if [ "$HAT" = "designer" ] || [ "$HAT" = "reviewer" ]; then
  _DESIGN_PROVIDER_TYPE=""
  if type load_providers &>/dev/null; then
    _DESIGN_PROVIDERS_JSON=$(load_providers)
    _DESIGN_PROVIDER_TYPE=$(echo "$_DESIGN_PROVIDERS_JSON" | jq -r '.design.type // empty')
  fi

  if [ -n "$_DESIGN_PROVIDER_TYPE" ]; then
    echo ""
    echo "### Design Provider Capabilities"
    echo ""
    echo "**Active provider:** $_DESIGN_PROVIDER_TYPE"

    if type get_provider_capabilities &>/dev/null; then
      _DESIGN_CAPS=$(get_provider_capabilities "$_DESIGN_PROVIDER_TYPE")
      echo "**Capabilities:** \`$_DESIGN_CAPS\`"
    fi

    if type _provider_mcp_hint &>/dev/null; then
      _DESIGN_HINT=$(_provider_mcp_hint "$_DESIGN_PROVIDER_TYPE")
      echo "**MCP tool pattern:** \`$_DESIGN_HINT\`"
      echo ""
      echo "Use \`ToolSearch\` with pattern \`$_DESIGN_HINT\` to discover available design tools."
    fi

    if type get_provider_uri_scheme &>/dev/null; then
      _DESIGN_URI_SCHEME=$(get_provider_uri_scheme "$_DESIGN_PROVIDER_TYPE")
      [ -n "$_DESIGN_URI_SCHEME" ] && echo "**URI scheme:** \`$_DESIGN_URI_SCHEME\`"
    fi
    echo ""
  fi
fi

# Inject H•AI•K•U organizational memory (if workspace configured)
if type haiku_is_configured &>/dev/null && haiku_is_configured; then
  ORG_MEMORY=$(haiku_memory_context 100)
  if [ -n "$ORG_MEMORY" ]; then
    echo "### Organizational Memory (H•AI•K•U)"
    echo ""
    echo "The following learnings are from your organization's H•AI•K•U workspace:"
    echo ""
    echo "$ORG_MEMORY"
    echo ""
  fi
fi

# ============================================================================
# SHARED ITERATION MANAGEMENT INSTRUCTIONS
# These apply to ALL hats and are not customizable
# ============================================================================

echo ""
echo "---"
echo ""
echo "## Iteration Management (Required for ALL Hats)"
echo ""
echo "### Branch Per Unit (MANDATORY)"
echo ""
echo "You MUST work on a dedicated branch for this unit:"
echo ""
echo "\`\`\`bash"
echo "# Create if not exists:"
echo "git checkout -b haiku/{intent-slug}/{unit-number}-{unit-slug}"
echo "# Or use worktrees for parallel work:"
echo "git worktree add ../{unit-slug} haiku/{intent-slug}/{unit-number}-{unit-slug}"
echo "\`\`\`"
echo ""
echo "You MUST NOT work directly on main/master. This isolates work and prevents conflicts."
echo ""
echo "### Before Stopping (MANDATORY)"
echo ""
echo "Before every stop, you MUST:"
echo ""
echo "1. **Commit working changes**: \`git add -A && git commit\`"
echo "2. **Save scratchpad**: save to \`.haiku/{intent-slug}/state/scratchpad.md\`"
echo "3. **Write next prompt**: save to \`.haiku/{intent-slug}/state/next-prompt.md\`"
echo ""
echo "The next-prompt.md should contain what to continue with in the next iteration."
echo "Without this, progress may be lost if the session ends."
echo ""
echo "### Never Stop Arbitrarily"
echo ""
echo "- You MUST NOT stop mid-bolt without saving state"
echo "- If you need user input, use \`AskUserQuestion\` tool"
echo "- If blocked, document in \`.haiku/{intent-slug}/state/blockers.md\`"
echo ""

# Check branch naming convention (informational only)
# Note: CURRENT_BRANCH already cached at top of script
if [ -n "$CURRENT_BRANCH" ] && [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
  if ! echo "$CURRENT_BRANCH" | grep -qE '^haiku/[a-z0-9-]+/(main|[0-9]+-[a-z0-9-]+)$'; then
    echo "> **WARNING:** Current branch \`$CURRENT_BRANCH\` doesn't follow H·AI·K·U convention."
    echo "> Expected: \`haiku/{intent-slug}/main\` or \`haiku/{intent-slug}/{unit-number}-{unit-slug}\`"
    echo "> Create correct branch before proceeding."
    echo ""
  fi
else
  echo "> **WARNING:** You are on \`${CURRENT_BRANCH:-main}\`. Create a unit branch before working."
  echo ""
fi

echo "---"
echo ""
echo "**Commands:** \`/ai-dlc:execute\` (continue loop) | \`/ai-dlc:construct\` (deprecated alias) | \`/ai-dlc:reset\` (abandon task)"
echo ""
echo "> **No file changes?** If this hat's work is complete but no files were modified,"
echo "> save findings to scratchpad and read \`plugin/skills/execute/subskills/advance/SKILL.md\` then execute it to continue."
