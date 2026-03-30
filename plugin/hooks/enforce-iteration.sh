#!/bin/bash
# enforce-iteration.sh - Stop hook for AI-DLC
#
# PURPOSE: Rescue mechanism when the execution loop exits unexpectedly.
#
# This hook fires when a session ends. It determines the appropriate action:
# 1. **Work remains** (units ready or in progress):
#    - Instruct agent to call `/execute` to continue
#    - Subagents have CLEAN CONTEXT - no need for /clear
# 2. **All complete** (no pending units):
#    - Intent is done, no action needed
# 3. **Truly blocked** (no ready units, human MUST intervene):
#    - This is the only "real stop" - alert the user

set -e

# Source foundation libraries
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
source "${PLUGIN_ROOT}/lib/state.sh"
dlc_check_deps || exit 0

# Check for AI-DLC state
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
IS_UNIT_BRANCH=false
if [[ "$CURRENT_BRANCH" == ai-dlc/*/* ]] && [[ "$CURRENT_BRANCH" != ai-dlc/*/main ]]; then
  IS_UNIT_BRANCH=true
fi

# Load iteration state from filesystem
INTENT_DIR=$(dlc_find_active_intent)
ITERATION_JSON=""
[ -n "$INTENT_DIR" ] && ITERATION_JSON=$(dlc_state_load "$INTENT_DIR" "iteration.json")

# Unit-branch sessions (teammates or subagents) should NOT be told to /execute
# The orchestrator on the intent branch manages the execution loop
if [ "$IS_UNIT_BRANCH" = "true" ]; then
  echo "## AI-DLC: Unit Session Ending"
  echo ""
  echo "Ensure you committed changes and saved progress."
  exit 0
fi

if [ -z "$ITERATION_JSON" ]; then
  # No AI-DLC state - not using the methodology, skip
  exit 0
fi

# Validate JSON
if ! echo "$ITERATION_JSON" | dlc_json_validate; then
  # Invalid JSON - skip silently
  exit 0
fi

# Single-pass extraction of iteration state fields
eval "$(echo "$ITERATION_JSON" | jq -r '@sh "
  STATUS=\(.status // \"active\")
  CURRENT_ITERATION=\(.iteration // 1)
  HAT=\(.hat // \"builder\")
  MAX_ITERATIONS=\(.maxIterations // 0)
  TARGET_UNIT=\(.targetUnit // \"\")
"')"

# If task is already complete, don't enforce iteration
if [ "$STATUS" = "complete" ] || [ "$STATUS" = "completed" ]; then
  exit 0
fi

# Check if iteration limit exceeded
if [ "$MAX_ITERATIONS" -gt 0 ] && [ "$CURRENT_ITERATION" -ge "$MAX_ITERATIONS" ]; then
  echo ""
  echo "---"
  echo ""
  echo "## AI-DLC: ITERATION LIMIT REACHED"
  echo ""
  echo "**Iteration:** $CURRENT_ITERATION / $MAX_ITERATIONS (max)"
  echo "**Hat:** $HAT"
  echo ""
  echo "The maximum iteration limit has been reached. This is a safety mechanism"
  echo "to prevent infinite loops."
  echo ""
  echo "**Options:**"
  echo "1. Review progress and decide if work is complete"
  echo "2. Increase limit: edit \`.ai-dlc/{intent-slug}/state/iteration.json\` and set maxIterations"
  echo "3. Reset iteration count: \`/reset\` and start fresh"
  echo ""
  echo "Progress preserved in \`.ai-dlc/{intent-slug}/state/\`."
  exit 0
fi

# Get intent slug and check DAG status
INTENT_SLUG=""
[ -n "$INTENT_DIR" ] && INTENT_SLUG=$(basename "$INTENT_DIR")
READY_COUNT=0
IN_PROGRESS_COUNT=0
ALL_COMPLETE="false"

if [ -n "$INTENT_SLUG" ] && [ -n "$INTENT_DIR" ]; then
  # Check if DAG library is available and intent dir exists
  DAG_LIB="${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
  if [ -f "$DAG_LIB" ] && [ -d "$INTENT_DIR" ]; then
    # shellcheck source=/dev/null
    source "$DAG_LIB"

    # Get DAG status
    if type get_dag_summary &>/dev/null; then
      DAG_SUMMARY=$(get_dag_summary "$INTENT_DIR" 2>/dev/null || echo "")
      # Format: "pending:N in_progress:N completed:N blocked:N ready:N"
      READY_COUNT=$(echo "$DAG_SUMMARY" | sed -n 's/.*ready:\([0-9]*\).*/\1/p')
      IN_PROGRESS_COUNT=$(echo "$DAG_SUMMARY" | sed -n 's/.*in_progress:\([0-9]*\).*/\1/p')
      PENDING=$(echo "$DAG_SUMMARY" | sed -n 's/.*pending:\([0-9]*\).*/\1/p')
      BLOCKED=$(echo "$DAG_SUMMARY" | sed -n 's/.*blocked:\([0-9]*\).*/\1/p')
      READY_COUNT=${READY_COUNT:-0}
      IN_PROGRESS_COUNT=${IN_PROGRESS_COUNT:-0}
      PENDING=${PENDING:-0}
      BLOCKED=${BLOCKED:-0}
      if [ "$READY_COUNT" -eq 0 ] && [ "$IN_PROGRESS_COUNT" -eq 0 ] && [ "$PENDING" -eq 0 ] && [ "$BLOCKED" -eq 0 ]; then
        ALL_COMPLETE="true"
      fi
    fi
  fi
fi

echo ""
echo "---"
echo ""

# Determine action based on DAG state
if [ "$ALL_COMPLETE" = "true" ]; then
  # Auto-reconcile: if all units complete but intent not marked completed, fix it now
  if [ -n "$INTENT_DIR" ] && [ -f "${INTENT_DIR}/intent.md" ]; then
    source "${PLUGIN_ROOT}/lib/parse.sh"
    INTENT_STATUS=$(dlc_frontmatter_get "status" "${INTENT_DIR}/intent.md" 2>/dev/null || echo "")
    if [ "$INTENT_STATUS" = "active" ]; then
      dlc_frontmatter_set "status" "completed" "${INTENT_DIR}/intent.md"
      # Check off intent-level completion criteria checkboxes
      dlc_check_intent_criteria "${INTENT_DIR}"
      # Also update iteration.json status
      if [ -n "$ITERATION_JSON" ]; then
        UPDATED_STATE=$(echo "$ITERATION_JSON" | jq -c '.status = "completed"')
        dlc_state_save "$INTENT_DIR" "iteration.json" "$UPDATED_STATE"
      fi
      git add "${INTENT_DIR}/intent.md" "${INTENT_DIR}/state/iteration.json" "${INTENT_DIR}/completion-criteria.md" "${INTENT_DIR}/state/completion-criteria.md" 2>/dev/null || true
      git commit -m "status: mark $(basename "$INTENT_DIR") as completed (auto-reconciled)" 2>/dev/null || true
    fi
  fi
  echo "## AI-DLC: All Units Complete"
  echo ""
  echo "All units have been completed. Intent has been marked as completed."
  echo ""
elif [ "$READY_COUNT" -gt 0 ] || [ "$IN_PROGRESS_COUNT" -gt 0 ]; then
  # Work remains - instruct agent to continue
  echo "## AI-DLC: Session Exhausted - Continue Execution"
  echo ""
  echo "**Iteration:** $CURRENT_ITERATION | **Hat:** $HAT"
  echo "**Ready units:** $READY_COUNT | **In progress:** $IN_PROGRESS_COUNT"
  echo ""
  echo "### ACTION REQUIRED"
  echo ""
  if [ -n "$TARGET_UNIT" ]; then
    echo "Call \`/execute ${INTENT_SLUG} ${TARGET_UNIT}\` to continue targeted execution."
  else
    echo "Call \`/execute\` to continue the autonomous loop."
  fi
  echo ""
  echo "**Note:** Subagents have clean context. No \`/clear\` needed."
  echo ""
else
  # Truly blocked - human must intervene
  echo "## AI-DLC: BLOCKED - Human Intervention Required"
  echo ""
  echo "**Iteration:** $CURRENT_ITERATION | **Hat:** $HAT"
  echo ""
  echo "No units are ready to work on. All remaining units are blocked."
  echo ""
  echo "**User action required:**"
  echo "1. Review blockers: read \`.ai-dlc/${INTENT_SLUG}/state/blockers.md\`"
  echo "2. Unblock units or resolve dependencies"
  echo "3. Run \`/execute\` to resume"
  echo ""
fi

echo "Progress preserved in \`.ai-dlc/${INTENT_SLUG}/state/\`."
