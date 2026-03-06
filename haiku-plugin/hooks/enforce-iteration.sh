#!/bin/bash
# enforce-iteration.sh - Stop hook for HAIKU Method
#
# Fires when a session ends. Determines the appropriate action:
# 1. Work remains (units ready or in progress): instruct to continue
# 2. All complete: no action needed
# 3. Truly blocked: alert the user

set -e

# Source libraries
STORAGE_LIB="${CLAUDE_PLUGIN_ROOT}/lib/storage.sh"
if [ -f "$STORAGE_LIB" ]; then
  # shellcheck source=/dev/null
  source "$STORAGE_LIB"
fi

# Load iteration state
ITERATION_JSON=$(storage_load_state "iteration.json" 2>/dev/null || echo "")

if [ -z "$ITERATION_JSON" ]; then
  exit 0
fi

# Parse state
STATUS="active"
CURRENT_ITERATION="1"
HAT="executor"

if command -v han &>/dev/null; then
  STATUS=$(echo "$ITERATION_JSON" | han parse json status -r --default active 2>/dev/null || echo "active")
  CURRENT_ITERATION=$(echo "$ITERATION_JSON" | han parse json iteration -r --default 1 2>/dev/null || echo "1")
  HAT=$(echo "$ITERATION_JSON" | han parse json hat -r --default executor 2>/dev/null || echo "executor")
elif command -v jq &>/dev/null; then
  STATUS=$(echo "$ITERATION_JSON" | jq -r '.status // "active"')
  CURRENT_ITERATION=$(echo "$ITERATION_JSON" | jq -r '.iteration // 1')
  HAT=$(echo "$ITERATION_JSON" | jq -r '.hat // "executor"')
fi

# If task is complete, don't enforce iteration
if [ "$STATUS" = "complete" ]; then
  exit 0
fi

# Get intent slug and check DAG status
INTENT_SLUG=$(storage_load_state "intent-slug" 2>/dev/null || echo "")
READY_COUNT=0
IN_PROGRESS_COUNT=0
ALL_COMPLETE="false"

if [ -n "$INTENT_SLUG" ]; then
  INTENT_DIR=".haiku/${INTENT_SLUG}"

  DAG_LIB="${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
  if [ -f "$DAG_LIB" ] && [ -d "$INTENT_DIR" ]; then
    # shellcheck source=/dev/null
    source "$DAG_LIB"

    if type get_dag_summary &>/dev/null; then
      DAG_SUMMARY=$(get_dag_summary "$INTENT_DIR" 2>/dev/null || echo "")
      if [ -n "$DAG_SUMMARY" ]; then
        READY_COUNT=$(echo "$DAG_SUMMARY" | sed -n 's/.*ready:\([0-9]*\).*/\1/p')
        IN_PROGRESS_COUNT=$(echo "$DAG_SUMMARY" | sed -n 's/.*in_progress:\([0-9]*\).*/\1/p')
        COMPLETED_COUNT=$(echo "$DAG_SUMMARY" | sed -n 's/.*completed:\([0-9]*\).*/\1/p')
        PENDING_COUNT=$(echo "$DAG_SUMMARY" | sed -n 's/.*pending:\([0-9]*\).*/\1/p')
        if [ "${PENDING_COUNT:-0}" -eq 0 ] && [ "${IN_PROGRESS_COUNT:-0}" -eq 0 ]; then
          ALL_COMPLETE="true"
        fi
      fi
    fi
  fi
fi

echo ""
echo "---"
echo ""

if [ "$ALL_COMPLETE" = "true" ]; then
  echo "## HAIKU: All Units Complete"
  echo ""
  echo "All units have been completed. Run \`/advance\` to finalize."
  echo ""
elif [ "${READY_COUNT:-0}" -gt 0 ] || [ "${IN_PROGRESS_COUNT:-0}" -gt 0 ]; then
  echo "## HAIKU: Session Exhausted - Continue Execution"
  echo ""
  echo "**Iteration:** $CURRENT_ITERATION | **Hat:** $HAT"
  echo "**Ready units:** ${READY_COUNT:-0} | **In progress:** ${IN_PROGRESS_COUNT:-0}"
  echo ""
  echo "### ACTION REQUIRED"
  echo ""
  echo "Call \`/execute\` to continue the autonomous loop."
  echo ""
else
  echo "## HAIKU: BLOCKED - Human Intervention Required"
  echo ""
  echo "**Iteration:** $CURRENT_ITERATION | **Hat:** $HAT"
  echo ""
  echo "No units are ready to work on. All remaining units are blocked."
  echo ""
  echo "**Action required:**"
  echo "1. Review blockers"
  echo "2. Unblock units or resolve dependencies"
  echo "3. Run \`/execute\` to resume"
  echo ""
fi

echo "Progress preserved in storage."
