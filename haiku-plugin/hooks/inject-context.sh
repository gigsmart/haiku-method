#!/bin/bash
# inject-context.sh - SessionStart hook for HAIKU Method
#
# Injects iteration context from storage:
# - Current hat and instructions
# - Intent and completion criteria
# - Previous scratchpad/blockers
# - Iteration number and workflow

set -e

# Read stdin to get SessionStart payload
HOOK_INPUT=$(cat)

# Extract source field
if [[ "$HOOK_INPUT" =~ \"source\":\ *\"([^\"]+)\" ]]; then
  SOURCE="${BASH_REMATCH[1]}"
else
  SOURCE="startup"
fi

# Source storage and config libraries
STORAGE_LIB="${CLAUDE_PLUGIN_ROOT}/lib/storage.sh"
if [ -f "$STORAGE_LIB" ]; then
  # shellcheck source=/dev/null
  source "$STORAGE_LIB"
fi

CONFIG_LIB="${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
if [ -f "$CONFIG_LIB" ]; then
  # shellcheck source=/dev/null
  source "$CONFIG_LIB"
fi

DAG_LIB="${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
if [ -f "$DAG_LIB" ]; then
  # shellcheck source=/dev/null
  source "$DAG_LIB"
fi

# Determine storage mode
STORAGE_MODE=$(detect_storage_mode 2>/dev/null || echo "folder")

# Load workflows from plugin and project
PLUGIN_WORKFLOWS="${CLAUDE_PLUGIN_ROOT}/workflows.yml"
PROJECT_WORKFLOWS=".haiku/workflows.yml"

parse_all_workflows() {
  local file="$1"
  [ -f "$file" ] || return
  local content
  content=$(cat "$file" 2>/dev/null) || return
  local names
  names=$(echo "$content" | grep -E '^[a-z][a-z0-9_-]*:' | sed 's/:.*//')
  for name in $names; do
    local desc hats
    if command -v han &>/dev/null; then
      desc=$(echo "$content" | han parse yaml "${name}.description" -r 2>/dev/null || echo "")
      hats=$(echo "$content" | han parse yaml "${name}.hats" 2>/dev/null | sed 's/^- //' | tr '\n' '|' | sed 's/|$//; s/|/ -> /g' || echo "")
    fi
    [ -n "$desc" ] && [ -n "$hats" ] && echo "$name|$desc|$hats"
  done
}

# Build workflow list
declare -A WORKFLOWS
KNOWN_WORKFLOWS=""

while IFS='|' read -r name desc hats; do
  [ -z "$name" ] && continue
  WORKFLOWS[$name]="$desc|$hats"
  KNOWN_WORKFLOWS="$KNOWN_WORKFLOWS $name"
done < <(parse_all_workflows "$PLUGIN_WORKFLOWS")

while IFS='|' read -r name desc hats; do
  [ -z "$name" ] && continue
  WORKFLOWS[$name]="$desc|$hats"
  if ! echo "$KNOWN_WORKFLOWS" | grep -qw "$name"; then
    KNOWN_WORKFLOWS="$KNOWN_WORKFLOWS $name"
  fi
done < <(parse_all_workflows "$PROJECT_WORKFLOWS")

AVAILABLE_WORKFLOWS=""
for name in $KNOWN_WORKFLOWS; do
  details="${WORKFLOWS[$name]}"
  if [ -n "$details" ]; then
    desc="${details%%|*}"
    hats="${details##*|}"
    AVAILABLE_WORKFLOWS="${AVAILABLE_WORKFLOWS}
- **$name**: $desc ($hats)"
  fi
done
AVAILABLE_WORKFLOWS="${AVAILABLE_WORKFLOWS#
}"

# Load iteration state using storage abstraction
ITERATION_JSON=$(storage_load_state "iteration.json" 2>/dev/null || echo "")

if [ -z "$ITERATION_JSON" ]; then
  # No active state - check for resumable intents
  FOUND_INTENTS=0
  INTENT_LIST=""

  for intent_file in .haiku/*/intent.md; do
    [ -f "$intent_file" ] || continue
    dir=$(dirname "$intent_file")
    slug=$(basename "$dir")
    status=$(_yaml_get_simple "status" "active" < "$intent_file" 2>/dev/null || echo "active")
    [ "$status" = "active" ] || continue
    FOUND_INTENTS=$((FOUND_INTENTS + 1))
    workflow=$(_yaml_get_simple "workflow" "default" < "$intent_file" 2>/dev/null || echo "default")
    INTENT_LIST="${INTENT_LIST}
- **$slug** (workflow: $workflow)"
  done

  if [ "$FOUND_INTENTS" -gt 0 ]; then
    echo "## HAIKU: Resumable Intents Found"
    echo ""
    echo "### In Current Directory"
    echo "$INTENT_LIST"
    echo ""
    echo "**To resume:** \`/resume <slug>\` or \`/resume\` if only one"
    echo ""
  else
    echo "## HAIKU Method Available"
    echo ""
    echo "**Storage mode:** $STORAGE_MODE"
    echo ""
    echo "No active HAIKU task. Run \`/elaborate\` to start a new task."
    echo ""
  fi

  if [ -n "$AVAILABLE_WORKFLOWS" ]; then
    echo "**Available workflows:**"
    echo "$AVAILABLE_WORKFLOWS"
    echo ""
  fi

  exit 0
fi

# Parse iteration state
ITERATION="1"
HAT="planner"
STATUS="active"
WORKFLOW_NAME="default"

if command -v han &>/dev/null; then
  ITERATION=$(echo "$ITERATION_JSON" | han parse json iteration -r --default 1 2>/dev/null || echo "1")
  HAT=$(echo "$ITERATION_JSON" | han parse json hat -r --default planner 2>/dev/null || echo "planner")
  STATUS=$(echo "$ITERATION_JSON" | han parse json status -r --default active 2>/dev/null || echo "active")
  WORKFLOW_NAME=$(echo "$ITERATION_JSON" | han parse json workflowName -r --default default 2>/dev/null || echo "default")
elif command -v jq &>/dev/null; then
  ITERATION=$(echo "$ITERATION_JSON" | jq -r '.iteration // 1')
  HAT=$(echo "$ITERATION_JSON" | jq -r '.hat // "planner"')
  STATUS=$(echo "$ITERATION_JSON" | jq -r '.status // "active"')
  WORKFLOW_NAME=$(echo "$ITERATION_JSON" | jq -r '.workflowName // "default"')
fi

# If task is complete, show completion message
if [ "$STATUS" = "complete" ]; then
  echo "## HAIKU: Task Complete"
  echo ""
  echo "Previous task was completed. Run \`/elaborate\` to start a new task."
  exit 0
fi

echo "## HAIKU Context"
echo ""
echo "**Iteration:** $ITERATION | **Hat:** $HAT | **Workflow:** $WORKFLOW_NAME"
echo "**Storage mode:** $STORAGE_MODE"
echo ""

# Load and display intent
INTENT_SLUG=$(storage_load_state "intent-slug" 2>/dev/null || echo "")
INTENT_DIR=""
if [ -n "$INTENT_SLUG" ]; then
  INTENT_DIR=".haiku/${INTENT_SLUG}"
fi

if [ -n "$INTENT_DIR" ] && [ -f "${INTENT_DIR}/intent.md" ]; then
  echo "### Intent"
  echo ""
  cat "${INTENT_DIR}/intent.md"
  echo ""
fi

# Load and display completion criteria
if [ -n "$INTENT_DIR" ] && [ -f "${INTENT_DIR}/completion-criteria.md" ]; then
  echo "### Completion Criteria"
  echo ""
  cat "${INTENT_DIR}/completion-criteria.md"
  echo ""
fi

# Load and display scratchpad
SCRATCHPAD=$(storage_load_state "scratchpad.md" 2>/dev/null || echo "")
if [ -n "$SCRATCHPAD" ]; then
  echo "### Learnings from Previous Iteration"
  echo ""
  echo "$SCRATCHPAD"
  echo ""
fi

# Load and display blockers
BLOCKERS=$(storage_load_state "blockers.md" 2>/dev/null || echo "")
if [ -n "$BLOCKERS" ]; then
  echo "### Previous Blockers"
  echo ""
  echo "$BLOCKERS"
  echo ""
fi

# Show DAG status
if [ -n "$INTENT_DIR" ] && [ -d "$INTENT_DIR" ] && ls "$INTENT_DIR"/unit-*.md 1>/dev/null 2>&1; then
  echo "### Unit Status"
  echo ""

  if type get_dag_status_table &>/dev/null; then
    get_dag_status_table "$INTENT_DIR"
    echo ""

    if type get_dag_summary &>/dev/null; then
      SUMMARY=$(get_dag_summary "$INTENT_DIR")
      PENDING=$(echo "$SUMMARY" | sed -n 's/.*pending:\([0-9]*\).*/\1/p')
      IN_PROG=$(echo "$SUMMARY" | sed -n 's/.*in_progress:\([0-9]*\).*/\1/p')
      COMPLETED=$(echo "$SUMMARY" | sed -n 's/.*completed:\([0-9]*\).*/\1/p')
      BLOCKED=$(echo "$SUMMARY" | sed -n 's/.*blocked:\([0-9]*\).*/\1/p')
      READY=$(echo "$SUMMARY" | sed -n 's/.*ready:\([0-9]*\).*/\1/p')
      echo "**Summary:** $COMPLETED completed, $IN_PROG in_progress, $PENDING pending ($BLOCKED blocked), $READY ready"
      echo ""
    fi

    if type find_ready_units &>/dev/null; then
      READY_UNITS=$(find_ready_units "$INTENT_DIR" | tr '\n' ' ' | sed 's/ $//')
      [ -n "$READY_UNITS" ] && echo "**Ready for execution:** $READY_UNITS" && echo ""
    fi
  fi
fi

# Load hat instructions
HAT_FILE=""
if [ -f ".haiku/hats/${HAT}.md" ]; then
  HAT_FILE=".haiku/hats/${HAT}.md"
elif [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md" ]; then
  HAT_FILE="${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md"
fi

echo "### Current Hat Instructions"
echo ""

if [ -n "$HAT_FILE" ] && [ -f "$HAT_FILE" ]; then
  NAME=""
  DESC=""
  if command -v han &>/dev/null; then
    NAME=$(han parse yaml name -r --default "" < "$HAT_FILE" 2>/dev/null || echo "")
    DESC=$(han parse yaml description -r --default "" < "$HAT_FILE" 2>/dev/null || echo "")
  fi

  INSTRUCTIONS=$(sed '1,/^---$/d' "$HAT_FILE" | sed '1,/^---$/d')

  if [ -n "$DESC" ]; then
    echo "**${NAME:-$HAT}** -- $DESC"
  else
    echo "**${NAME:-$HAT}**"
  fi
  echo ""
  if [ -n "$INSTRUCTIONS" ]; then
    echo "$INSTRUCTIONS"
  fi
else
  echo "**$HAT** (Custom hat -- no instructions found)"
  echo ""
  echo "Create a hat definition at \`.haiku/hats/${HAT}.md\`"
fi

echo ""
echo "---"
echo ""
echo "## Iteration Management (Required for ALL Hats)"
echo ""
echo "### Before Stopping (MANDATORY)"
echo ""
echo "Before every stop, you MUST:"
echo ""
echo "1. **Save progress**: Save working state to storage"
echo "2. **Save scratchpad**: Document learnings"
echo "3. **Write next prompt**: What to continue with next"
echo ""
echo "---"
echo ""
echo "**Commands:** \`/execute\` (continue loop) | \`/advance\` (next hat)"
