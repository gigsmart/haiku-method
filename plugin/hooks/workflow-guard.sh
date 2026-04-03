#!/bin/bash
# workflow-guard.sh — Warn when editing files outside active AI-DLC workflow
set -euo pipefail

# Source foundation libraries
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
source "${PLUGIN_ROOT}/lib/state.sh"
dlc_check_deps || exit 0

INPUT=$(cat)
TOOL=$(echo "$INPUT" | dlc_json_get "tool_name")
[[ "$TOOL" =~ ^(Write|Edit)$ ]] || exit 0
# Check if an intent is active
INTENT_DIR=$(dlc_find_active_intent)
[ -z "$INTENT_DIR" ] && exit 0  # No active intent, no guard needed
FILE=$(echo "$INPUT" | dlc_json_get "tool_input.file_path")
# Skip .ai-dlc files (those are expected)
[[ "$FILE" =~ /\.ai-dlc/ ]] && exit 0
# Warn about source file edits outside hat context
ITERATION_JSON=$(dlc_state_load "$INTENT_DIR" "iteration.json")
HAT=$(echo "$ITERATION_JSON" | dlc_json_get "hat")
[ -z "$HAT" ] && echo "⚠️ WORKFLOW GUARD: Editing $FILE outside of hat context. Consider running /ai-dlc:execute first."
