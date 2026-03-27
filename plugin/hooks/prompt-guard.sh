#!/bin/bash
# prompt-guard.sh — Advisory scan for prompt injection in spec files
set -euo pipefail
INPUT=$(cat)
TOOL=$(echo "$INPUT" | han parse json tool_name -r --default "" 2>/dev/null || echo "")
[[ "$TOOL" =~ ^(Write|Edit)$ ]] || exit 0
FILE=$(echo "$INPUT" | han parse json tool_input.file_path -r --default "" 2>/dev/null || echo "")
[[ "$FILE" =~ /\.ai-dlc/ ]] || exit 0
CONTENT=$(echo "$INPUT" | han parse json tool_input.content -r --default "" 2>/dev/null || echo "$INPUT" | han parse json tool_input.new_string -r --default "" 2>/dev/null || echo "")
# Check for injection patterns
if echo "$CONTENT" | grep -qiE '(ignore previous|disregard|override instructions|you are now|system prompt|<system>|</system>)'; then
  echo "⚠️ PROMPT GUARD: Potential injection pattern detected in spec file write to $FILE"
  echo "Review the content before proceeding."
fi
