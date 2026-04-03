#!/bin/bash
# workflow-guard.sh — Warn when editing files outside active H·AI·K·U workflow
set -euo pipefail

# Source foundation libraries
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
source "${PLUGIN_ROOT}/lib/state.sh"
hku_check_deps || exit 0

INPUT=$(cat)
TOOL=$(echo "$INPUT" | hku_json_get "tool_name")
[[ "$TOOL" =~ ^(Write|Edit)$ ]] || exit 0
# Check if an intent is active
INTENT_DIR=$(hku_find_active_intent)
[ -z "$INTENT_DIR" ] && exit 0  # No active intent, no guard needed
FILE=$(echo "$INPUT" | hku_json_get "tool_input.file_path")
# Skip .haiku files (those are expected)
[[ "$FILE" =~ /\.haiku/ ]] && exit 0
# Warn about source file edits outside hat context
ITERATION_JSON=$(hku_state_load "$INTENT_DIR" "iteration.json")
HAT=$(echo "$ITERATION_JSON" | hku_json_get "hat")
[ -z "$HAT" ] && echo "⚠️ WORKFLOW GUARD: Editing $FILE outside of hat context. Consider running /haiku:execute first."
