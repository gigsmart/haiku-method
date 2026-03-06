#!/bin/bash
# subagent-context.sh - SubagentPrompt hook for HAIKU Method
#
# Injects HAIKU context into subagent prompts:
# - Hat instructions
# - Workflow rules
# - Unit/iteration context
# - Intent and completion criteria

set -e

# Source libraries
STORAGE_LIB="${CLAUDE_PLUGIN_ROOT}/lib/storage.sh"
if [ -f "$STORAGE_LIB" ]; then
  # shellcheck source=/dev/null
  source "$STORAGE_LIB"
fi

DAG_LIB="${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
if [ -f "$DAG_LIB" ]; then
  # shellcheck source=/dev/null
  source "$DAG_LIB"
fi

# Load iteration state
ITERATION_JSON=$(storage_load_state "iteration.json" 2>/dev/null || echo "")

if [ -z "$ITERATION_JSON" ]; then
  exit 0
fi

# Parse state
ITERATION="1"
HAT=""
STATUS="active"
WORKFLOW_NAME="default"

if command -v han &>/dev/null; then
  ITERATION=$(echo "$ITERATION_JSON" | han parse json iteration -r --default 1 2>/dev/null || echo "1")
  HAT=$(echo "$ITERATION_JSON" | han parse json hat -r --default "" 2>/dev/null || echo "")
  STATUS=$(echo "$ITERATION_JSON" | han parse json status -r --default active 2>/dev/null || echo "active")
  WORKFLOW_NAME=$(echo "$ITERATION_JSON" | han parse json workflowName -r --default default 2>/dev/null || echo "default")
elif command -v jq &>/dev/null; then
  ITERATION=$(echo "$ITERATION_JSON" | jq -r '.iteration // 1')
  HAT=$(echo "$ITERATION_JSON" | jq -r '.hat // ""')
  STATUS=$(echo "$ITERATION_JSON" | jq -r '.status // "active"')
  WORKFLOW_NAME=$(echo "$ITERATION_JSON" | jq -r '.workflowName // "default"')
fi

if [ "$STATUS" = "complete" ] || [ -z "$HAT" ]; then
  exit 0
fi

# Get intent slug
INTENT_SLUG=$(storage_load_state "intent-slug" 2>/dev/null || echo "")
if [ -z "$INTENT_SLUG" ]; then
  exit 0
fi

INTENT_DIR=".haiku/${INTENT_SLUG}"
INTENT_FILE="${INTENT_DIR}/intent.md"

if [ ! -f "$INTENT_FILE" ]; then
  exit 0
fi

echo "## HAIKU Subagent Context"
echo ""
echo "**Iteration:** $ITERATION | **Role:** $HAT | **Workflow:** $WORKFLOW_NAME"
echo ""

# Output intent
echo "### Intent"
echo ""
cat "$INTENT_FILE"
echo ""

# Output completion criteria
if [ -f "${INTENT_DIR}/completion-criteria.md" ]; then
  echo "### Completion Criteria"
  echo ""
  cat "${INTENT_DIR}/completion-criteria.md"
  echo ""
fi

# Unit status
if [ -d "$INTENT_DIR" ] && ls "$INTENT_DIR"/unit-*.md 1>/dev/null 2>&1; then
  echo "### Unit Status"
  echo ""
  if type get_dag_status_table &>/dev/null; then
    get_dag_status_table "$INTENT_DIR"
    echo ""
  fi
fi

# Load hat instructions
HAT_FILE=""
if [ -f ".haiku/hats/${HAT}.md" ]; then
  HAT_FILE=".haiku/hats/${HAT}.md"
elif [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md" ]; then
  HAT_FILE="${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md"
fi

echo "### Current Role: $HAT"
echo ""

if [ -n "$HAT_FILE" ] && [ -f "$HAT_FILE" ]; then
  INSTRUCTIONS=$(sed '1,/^---$/d' "$HAT_FILE" | sed '1,/^---$/d')
  if [ -n "$INSTRUCTIONS" ]; then
    echo "$INSTRUCTIONS"
    echo ""
  fi
fi

# Workflow rules
echo "---"
echo ""
echo "## HAIKU Workflow Rules"
echo ""
echo "### Before Stopping"
echo ""
echo "1. **Save progress**: Commit or save working state"
echo "2. **Save scratchpad**: Document learnings"
echo "3. **Write next prompt**: What to continue with next"
echo ""
echo "### Resilience"
echo ""
echo "1. Save progress early and often"
echo "2. If stuck, document blocker and try alternative approach"
echo "3. Only declare blocked after 3+ genuine attempts"
