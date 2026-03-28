#!/bin/bash
# state.sh — File-based state management for AI-DLC
#
# Replaces han keep with filesystem-backed state.
# State files live at .ai-dlc/{intent-slug}/state/.
# All writes are atomic (tmp + mv).
#
# Usage:
#   source state.sh
#   dlc_state_save "$intent_dir" "iteration.json" "$json_content"
#   content=$(dlc_state_load "$intent_dir" "iteration.json")

# Guard against double-sourcing
if [ -n "${_DLC_STATE_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_DLC_STATE_SOURCED=1

# Source parse library (which sources deps.sh)
STATE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=parse.sh
source "$STATE_SCRIPT_DIR/parse.sh"

# Save state: atomic write (tmp + mv)
# Usage: dlc_state_save <intent_dir> <key> <content>
dlc_state_save() {
  local intent_dir="$1"
  local key="$2"
  local content="$3"
  local state_dir="${intent_dir}/state"
  local filepath="${state_dir}/${key}"

  mkdir -p "$state_dir" 2>/dev/null || {
    echo "ai-dlc: dlc_state_save: cannot create state directory: $state_dir" >&2
    return 1
  }

  local tmp="${filepath}.tmp.$$"
  printf '%s' "$content" > "$tmp" && mv "$tmp" "$filepath"
}

# Load state: return file contents or empty string if missing
# Usage: dlc_state_load <intent_dir> <key>
dlc_state_load() {
  local intent_dir="$1"
  local key="$2"
  cat "${intent_dir}/state/${key}" 2>/dev/null || echo ""
}

# Delete state file
# Usage: dlc_state_delete <intent_dir> <key>
dlc_state_delete() {
  local intent_dir="$1"
  local key="$2"
  rm -f "${intent_dir}/state/${key}"
}

# List state keys (filenames in state directory)
# Usage: dlc_state_list <intent_dir>
dlc_state_list() {
  local intent_dir="$1"
  local state_dir="${intent_dir}/state"
  if [ -d "$state_dir" ]; then
    ls "$state_dir" 2>/dev/null
  fi
}

# Fast YAML scalar extraction from frontmatter (pure bash, no subprocess)
# Only handles simple "field: value" lines — used for performance-critical paths.
_state_yaml_get_simple() {
  local field="$1" default="$2"
  local in_frontmatter=false value=""
  while IFS= read -r line; do
    [[ "$line" == "---" ]] && { $in_frontmatter && break || in_frontmatter=true; continue; }
    $in_frontmatter || continue
    if [[ "$line" =~ ^${field}:\ *(.*)$ ]]; then
      value="${BASH_REMATCH[1]}"
      value="${value#\"}"
      value="${value%\"}"
      value="${value#\'}"
      value="${value%\'}"
      break
    fi
  done
  echo "${value:-$default}"
}

# Find the first active intent directory
# Scans .ai-dlc/*/intent.md for status: active. Works from any working directory.
# Returns the full path to the intent directory, or empty string if none found.
# Usage: dlc_find_active_intent
dlc_find_active_intent() {
  local repo_root
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || return 0

  local intent_file
  for intent_file in "$repo_root"/.ai-dlc/*/intent.md; do
    [ -f "$intent_file" ] || continue
    local status
    status=$(_state_yaml_get_simple "status" "pending" < "$intent_file")
    if [ "$status" = "active" ]; then
      dirname "$intent_file"
      return 0
    fi
  done

  echo ""
}
