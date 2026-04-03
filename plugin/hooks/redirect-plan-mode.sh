#!/bin/bash
# redirect-plan-mode.sh - PreToolUse hook for EnterPlanMode
#
# Intercepts Claude Code's built-in EnterPlanMode tool and redirects users
# to use AI-DLC's /ai-dlc:elaborate workflow instead.
#
# AI-DLC's elaborate → execute flow is a more comprehensive planning process
# that replaces the need for Claude Code's generic plan mode.

set -e

# Source foundation libraries
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
source "${PLUGIN_ROOT}/lib/parse.sh"
dlc_check_deps || exit 0

# Read stdin to get PreToolUse payload
HOOK_INPUT=$(cat)

# Extract tool name
TOOL_NAME=$(echo "$HOOK_INPUT" | dlc_json_get "tool_name")

# Only intercept EnterPlanMode
if [ "$TOOL_NAME" != "EnterPlanMode" ]; then
  exit 0
fi

# Output JSON response to deny the tool and provide guidance
# Using the standard Claude Code PreToolUse hook output format
cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "AI-DLC: Use /ai-dlc:elaborate instead of plan mode.\n\nThe AI-DLC plugin replaces Claude Code's built-in plan mode with a more comprehensive workflow:\n\n**`/ai-dlc:elaborate`** - Structured mob elaboration that:\n- Defines intent and success criteria collaboratively\n- Decomposes work into independent units\n- Selects appropriate workflow (default, tdd, hypothesis, adversarial)\n- Creates isolated worktrees for safe iteration\n- Sets up the execution loop with quality gates\n\n**To start:** Run `/ai-dlc:elaborate` with a description of what you want to build.\n\nExample:\n```\n/ai-dlc:elaborate Add user authentication with OAuth2 support\n```"
  }
}
EOF
