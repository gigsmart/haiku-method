#!/bin/bash
# subagent-hook.sh - PreToolUse hook for Agent|Task|Skill
#
# Injects AI-DLC context into subagent prompts by:
# 1. Reading the PreToolUse payload from stdin
# 2. Running subagent-context.sh to generate markdown context
# 3. Wrapping context in <subagent-context> tags
# 4. Prepending to the original prompt (Agent/Task) or args (Skill)
# 5. Outputting JSON with updatedInput (no permissionDecision)
#
# Also injects permission_mode into Agent/Task tool_input when present.

set -e

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
source "${PLUGIN_ROOT}/lib/parse.sh"

# Read hook payload once
PAYLOAD=$(cat)

# Extract tool name
TOOL_NAME=$(echo "$PAYLOAD" | dlc_json_get "tool_name")

# Determine target field: prompt for Agent/Task, args for Skill
IS_AGENT_TOOL=false
TARGET_FIELD="args"
if [ "$TOOL_NAME" = "Agent" ] || [ "$TOOL_NAME" = "Task" ]; then
  IS_AGENT_TOOL=true
  TARGET_FIELD="prompt"
fi

# Extract the original tool_input and the target field value
TOOL_INPUT=$(echo "$PAYLOAD" | dlc_json_get_raw "tool_input")
[ -z "$TOOL_INPUT" ] || [ "$TOOL_INPUT" = "null" ] && TOOL_INPUT="{}"

ORIGINAL_VALUE=$(echo "$TOOL_INPUT" | jq -r ".${TARGET_FIELD} // \"\"" 2>/dev/null || echo "")

# For Agent/Task, skip if no prompt to inject into
if [ "$IS_AGENT_TOOL" = true ] && [ -z "$ORIGINAL_VALUE" ]; then
  exit 0
fi

# Skip if context already injected
if echo "$ORIGINAL_VALUE" | grep -q '<subagent-context>' 2>/dev/null; then
  exit 0
fi

# Run subagent-context.sh to generate markdown context
# NOTE: Do NOT pipe stdin to it — it reads state from filesystem
CONTEXT_OUTPUT=$(bash "${PLUGIN_ROOT}/hooks/subagent-context.sh" 2>/dev/null || echo "")

# Extract permission_mode from hook payload (for Agent/Task only)
PERMISSION_MODE=""
if [ "$IS_AGENT_TOOL" = true ]; then
  PERMISSION_MODE=$(echo "$PAYLOAD" | dlc_json_get "permission_mode")
fi

# If no context and no permission_mode to inject, exit silently
if [ -z "$CONTEXT_OUTPUT" ] && [ -z "$PERMISSION_MODE" ]; then
  exit 0
fi

# Start with the original tool_input
UPDATED_INPUT="$TOOL_INPUT"

# Inject context if present
if [ -n "$CONTEXT_OUTPUT" ]; then
  # Wrap context in tags and prepend to original value
  WRAPPED_CONTEXT="<subagent-context>
${CONTEXT_OUTPUT}
</subagent-context>

"
  MODIFIED_VALUE="${WRAPPED_CONTEXT}${ORIGINAL_VALUE}"
  UPDATED_INPUT=$(echo "$UPDATED_INPUT" | jq --arg val "$MODIFIED_VALUE" ".${TARGET_FIELD} = \$val" 2>/dev/null)
fi

# Inject permission_mode if present (Agent/Task only)
if [ -n "$PERMISSION_MODE" ]; then
  UPDATED_INPUT=$(echo "$UPDATED_INPUT" | jq --arg mode "$PERMISSION_MODE" '.mode = $mode' 2>/dev/null)
fi

# Output JSON with updatedInput — do NOT set permissionDecision
jq -n --argjson input "$UPDATED_INPUT" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    updatedInput: $input
  }
}'
