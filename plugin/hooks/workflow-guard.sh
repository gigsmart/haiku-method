#!/bin/bash
# workflow-guard.sh — Warn when editing files outside active AI-DLC workflow
set -euo pipefail
INPUT=$(cat)
TOOL=$(echo "$INPUT" | han parse json tool_name -r --default "" 2>/dev/null || echo "")
[[ "$TOOL" =~ ^(Write|Edit)$ ]] || exit 0
# Check if an intent is active
INTENT=$(han keep load intent-slug --quiet 2>/dev/null || echo "")
[ -z "$INTENT" ] && exit 0  # No active intent, no guard needed
FILE=$(echo "$INPUT" | han parse json tool_input.file_path -r --default "" 2>/dev/null || echo "")
# Skip .ai-dlc files (those are expected)
[[ "$FILE" =~ /\.ai-dlc/ ]] && exit 0
# Warn about source file edits outside hat context
ITERATION_JSON=$(han keep load iteration.json --quiet 2>/dev/null || echo "")
HAT=$(echo "$ITERATION_JSON" | han parse json hat -r --default "" 2>/dev/null || echo "")
[ -z "$HAT" ] && echo "⚠️ WORKFLOW GUARD: Editing $FILE outside of hat context. Consider running /execute first."
