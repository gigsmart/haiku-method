#!/bin/bash
# state.sh — File-based state management for H·AI·K·U
#
# Filesystem-backed state management.
# State files live at .haiku/{intent-slug}/state/.
# All writes are atomic (tmp + mv).
#
# Usage:
#   source state.sh
#   hku_state_save "$intent_dir" "iteration.json" "$json_content"
#   content=$(hku_state_load "$intent_dir" "iteration.json")

# Guard against double-sourcing
if [ -n "${_HKU_STATE_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_HKU_STATE_SOURCED=1

# Source parse library (which sources deps.sh)
STATE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=parse.sh
source "$STATE_SCRIPT_DIR/parse.sh"

# Save state: atomic write (tmp + mv)
# Usage: hku_state_save <intent_dir> <key> <content>
hku_state_save() {
  local intent_dir="$1"
  local key="$2"
  local content="$3"
  local state_dir="${intent_dir}/state"
  local filepath="${state_dir}/${key}"

  mkdir -p "$state_dir" 2>/dev/null || {
    echo "haiku: hku_state_save: cannot create state directory: $state_dir" >&2
    return 1
  }

  local tmp="${filepath}.tmp.$$"
  printf '%s' "$content" > "$tmp" && mv "$tmp" "$filepath"
}

# Load state: return file contents or empty string if missing
# Usage: hku_state_load <intent_dir> <key>
hku_state_load() {
  local intent_dir="$1"
  local key="$2"
  cat "${intent_dir}/state/${key}" 2>/dev/null || echo ""
}

# Delete state file
# Usage: hku_state_delete <intent_dir> <key>
hku_state_delete() {
  local intent_dir="$1"
  local key="$2"
  rm -f "${intent_dir}/state/${key}"
}

# List state keys (filenames in state directory)
# Usage: hku_state_list <intent_dir>
hku_state_list() {
  local intent_dir="$1"
  local state_dir="${intent_dir}/state"
  if [ -d "$state_dir" ]; then
    ls "$state_dir" 2>/dev/null
  fi
}

# Validate phase against known enum; return default if unknown
# Usage: hku_validate_phase <phase> [default]
hku_validate_phase() {
  local phase="$1" default="${2:-execution}"
  case "$phase" in
    elaboration|execution|operation|reflection|closed) echo "$phase" ;;
    *)
      [ -n "$phase" ] && echo "haiku: unknown phase '$phase', defaulting to '$default'" >&2
      echo "$default"
      ;;
  esac
}

# Fast YAML scalar extraction from frontmatter (pure bash, no subprocess)
# Only handles simple "field: value" lines — used for performance-critical paths.
_state_yaml_get_simple() {
  local field="$1" default="$2"
  local in_frontmatter=false value=""
  while IFS= read -r line; do
    [[ "$line" == "---" ]] && { $in_frontmatter && break || in_frontmatter=true; continue; }
    $in_frontmatter || continue
    if [[ "$line" == ${field}:* ]]; then
      value="${line#${field}:}"
      value="${value# }"
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
# Checks .haiku/intents/*/intent.md (new structure) first, then falls back
# to .haiku/*/intent.md (legacy structure). Works from any working directory.
# Returns the full path to the intent directory, or empty string if none found.
# Usage: hku_find_active_intent
hku_find_active_intent() {
  local repo_root
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || return 0

  # New structure: .haiku/intents/*/intent.md
  local intent_file
  for intent_file in "$repo_root"/.haiku/intents/*/intent.md; do
    [ -f "$intent_file" ] || continue
    local intent_status
    intent_status=$(_state_yaml_get_simple "status" "pending" < "$intent_file")
    if [ "$intent_status" = "active" ]; then
      dirname "$intent_file"
      return 0
    fi
  done

  # Legacy structure: .haiku/*/intent.md
  for intent_file in "$repo_root"/.haiku/*/intent.md; do
    [ -f "$intent_file" ] || continue
    # Skip directories that are part of the new structure
    case "$intent_file" in
      */.haiku/intents/*) continue ;;
    esac
    local intent_status
    intent_status=$(_state_yaml_get_simple "status" "pending" < "$intent_file")
    if [ "$intent_status" = "active" ]; then
      dirname "$intent_file"
      return 0
    fi
  done

  echo ""
}

# Get intent mode (continuous | discrete)
# Usage: hku_get_intent_mode <intent_file>
# Returns: "continuous" or "discrete" (defaults to "continuous")
hku_get_intent_mode() {
  local intent_file="$1"
  if [ ! -f "$intent_file" ]; then
    echo "continuous"
    return 0
  fi
  _state_yaml_get_simple "mode" "continuous" < "$intent_file"
}
