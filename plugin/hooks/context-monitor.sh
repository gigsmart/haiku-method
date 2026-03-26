#!/bin/bash
# context-monitor.sh - PostToolUse hook for AI-DLC
#
# Monitors context window usage during bolts and warns when
# approaching limits. Prevents "context rot" — the degradation
# of AI output quality as context fills up.
#
# Thresholds:
#   >35% remaining: Normal operation
#   <=35% remaining: WARNING — wrap up current task
#   <=25% remaining: CRITICAL — checkpoint and stop

set -e

# Read stdin for hook payload
HOOK_INPUT=$(cat)

# Only run during active AI-DLC sessions
if ! command -v han &> /dev/null; then
  exit 0
fi

# Check for AI-DLC state
ITERATION_JSON=$(han keep load iteration.json --quiet 2>/dev/null || echo "")
if [ -z "$ITERATION_JSON" ]; then
  exit 0
fi

STATUS=$(echo "$ITERATION_JSON" | han parse json status -r --default active 2>/dev/null || echo "active")
if [ "$STATUS" = "complete" ]; then
  exit 0
fi

# Try to get session context metrics from statusline data
# Claude Code writes session metrics that can be read from the hook payload
# The payload includes tool_name, tool_input, tool_output but not context metrics directly
#
# Strategy: Track tool use count as a proxy for context consumption
# Every tool use adds tokens. After N tool uses, warn about context limits.

# Debounce file (per-session)
SESSION_ID=$(echo "$HOOK_INPUT" | han parse json session_id -r --default "" 2>/dev/null || echo "default")
DEBOUNCE_FILE="/tmp/ai-dlc-ctx-${SESSION_ID}.json"

# Debounce settings
DEBOUNCE_CALLS=5
WARNING_TOOL_COUNT=80   # ~35% context remaining estimate
CRITICAL_TOOL_COUNT=120 # ~25% context remaining estimate

# Read or initialize debounce state
CALLS_SINCE_WARN=0
TOTAL_CALLS=0
LAST_LEVEL="none"

if [ -f "$DEBOUNCE_FILE" ]; then
  CALLS_SINCE_WARN=$(han parse json callsSinceWarn -r --default 0 < "$DEBOUNCE_FILE" 2>/dev/null || echo "0")
  TOTAL_CALLS=$(han parse json totalCalls -r --default 0 < "$DEBOUNCE_FILE" 2>/dev/null || echo "0")
  LAST_LEVEL=$(han parse json lastLevel -r --default "none" < "$DEBOUNCE_FILE" 2>/dev/null || echo "none")
fi

# Increment counters
TOTAL_CALLS=$((TOTAL_CALLS + 1))
CALLS_SINCE_WARN=$((CALLS_SINCE_WARN + 1))

# Determine severity level
CURRENT_LEVEL="normal"
if [ "$TOTAL_CALLS" -ge "$CRITICAL_TOOL_COUNT" ]; then
  CURRENT_LEVEL="critical"
elif [ "$TOTAL_CALLS" -ge "$WARNING_TOOL_COUNT" ]; then
  CURRENT_LEVEL="warning"
fi

# Should we emit a warning?
EMIT_WARNING=false

if [ "$CURRENT_LEVEL" = "critical" ] && [ "$LAST_LEVEL" != "critical" ]; then
  # Severity escalation always fires immediately
  EMIT_WARNING=true
elif [ "$CURRENT_LEVEL" = "warning" ] && [ "$LAST_LEVEL" = "none" ]; then
  # First warning always fires
  EMIT_WARNING=true
elif [ "$CURRENT_LEVEL" != "normal" ] && [ "$CALLS_SINCE_WARN" -ge "$DEBOUNCE_CALLS" ]; then
  # Debounced repeat warning
  EMIT_WARNING=true
fi

# Save debounce state
if [ "$EMIT_WARNING" = "true" ]; then
  CALLS_SINCE_WARN=0
fi

cat > "$DEBOUNCE_FILE" << EOF
{"totalCalls":$TOTAL_CALLS,"callsSinceWarn":$CALLS_SINCE_WARN,"lastLevel":"$CURRENT_LEVEL"}
EOF

# Emit warning if needed
if [ "$EMIT_WARNING" = "true" ]; then
  if [ "$CURRENT_LEVEL" = "critical" ]; then
    echo "## CONTEXT BUDGET: CRITICAL"
    echo ""
    echo "**Tool uses:** $TOTAL_CALLS (estimated ~25% context remaining)"
    echo ""
    echo "Context is nearly exhausted. You MUST:"
    echo "1. **Commit all working changes** immediately"
    echo "2. **Save scratchpad** with current progress: \`han keep save scratchpad.md \"...\"\`"
    echo "3. **Write next prompt**: \`han keep save next-prompt.md \"...\"\`"
    echo "4. **Do NOT start new complex work** — finish current task only"
    echo ""
    echo "The Stop hook will continue execution in a fresh context."
  elif [ "$CURRENT_LEVEL" = "warning" ]; then
    echo "## CONTEXT BUDGET: WARNING"
    echo ""
    echo "**Tool uses:** $TOTAL_CALLS (estimated ~35% context remaining)"
    echo ""
    echo "Context is getting limited. You SHOULD:"
    echo "- Avoid starting new complex work"
    echo "- Commit working increments more frequently"
    echo "- Wrap up the current task if possible"
    echo ""
    echo "If not between defined plan steps, prepare to checkpoint."
  fi
fi
