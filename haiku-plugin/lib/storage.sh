#!/bin/bash
# storage.sh - HAIKU Storage Abstraction Layer
#
# Provides a unified API for state persistence across two modes:
# - Git mode: uses han keep (branch-scoped key-value storage)
# - Folder mode: uses .haiku/{intent-slug}/state/ directory
#
# Usage:
#   source storage.sh
#   MODE=$(detect_storage_mode)
#   storage_save_state "iteration.json" "$STATE"
#   VALUE=$(storage_load_state "iteration.json")

# Detect whether the project uses git or plain filesystem
# Returns: "git" | "folder"
detect_storage_mode() {
  # Allow override from settings
  if [ -n "${HAIKU_STORAGE_MODE:-}" ]; then
    echo "$HAIKU_STORAGE_MODE"
    return
  fi

  # Check settings file for explicit mode
  local settings_file=".haiku/settings.yml"
  if [ -f "$settings_file" ] && command -v han &>/dev/null; then
    local mode
    mode=$(han parse yaml "storage.mode" -r --default "auto" < "$settings_file" 2>/dev/null || echo "auto")
    if [ "$mode" != "auto" ]; then
      echo "$mode"
      return
    fi
  fi

  # Auto-detect
  if git rev-parse --git-dir >/dev/null 2>&1; then
    echo "git"
  else
    echo "folder"
  fi
}

# Get the state directory for folder mode
# Usage: _folder_state_dir [intent_slug]
_folder_state_dir() {
  local intent_slug="${1:-${HAIKU_INTENT_SLUG:-}}"
  if [ -n "$intent_slug" ]; then
    echo ".haiku/${intent_slug}/state"
  else
    echo ".haiku/state"
  fi
}

# Save state to storage
# Usage: storage_save_state <key> <value> [--branch <branch>]
storage_save_state() {
  local key="$1"
  local value="$2"
  shift 2

  local mode
  mode=$(detect_storage_mode)

  case "$mode" in
    git)
      han keep save "$@" "$key" "$value" 2>/dev/null
      ;;
    folder)
      local state_dir
      state_dir=$(_folder_state_dir)
      mkdir -p "$state_dir"
      printf '%s' "$value" > "$state_dir/$key"
      ;;
  esac
}

# Load state from storage
# Usage: storage_load_state <key> [--branch <branch>]
storage_load_state() {
  local key="$1"
  shift

  local mode
  mode=$(detect_storage_mode)

  case "$mode" in
    git)
      han keep load "$@" "$key" --quiet 2>/dev/null || echo ""
      ;;
    folder)
      local state_dir
      state_dir=$(_folder_state_dir)
      if [ -f "$state_dir/$key" ]; then
        cat "$state_dir/$key"
      else
        echo ""
      fi
      ;;
  esac
}

# Save unit-scoped state
# Usage: storage_save_unit_state <unit_name> <key> <value>
storage_save_unit_state() {
  local unit_name="$1"
  local key="$2"
  local value="$3"

  local mode
  mode=$(detect_storage_mode)

  case "$mode" in
    git)
      # In git mode, unit state is scoped to the unit branch via han keep
      han keep save "$key" "$value" 2>/dev/null
      ;;
    folder)
      local intent_slug="${HAIKU_INTENT_SLUG:-}"
      local unit_dir=".haiku/${intent_slug}/units/${unit_name}/state"
      mkdir -p "$unit_dir"
      printf '%s' "$value" > "$unit_dir/$key"
      ;;
  esac
}

# Load unit-scoped state
# Usage: storage_load_unit_state <unit_name> <key>
storage_load_unit_state() {
  local unit_name="$1"
  local key="$2"

  local mode
  mode=$(detect_storage_mode)

  case "$mode" in
    git)
      han keep load "$key" --quiet 2>/dev/null || echo ""
      ;;
    folder)
      local intent_slug="${HAIKU_INTENT_SLUG:-}"
      local unit_dir=".haiku/${intent_slug}/units/${unit_name}/state"
      if [ -f "$unit_dir/$key" ]; then
        cat "$unit_dir/$key"
      else
        echo ""
      fi
      ;;
  esac
}

# List all state keys
# Usage: storage_list_keys [prefix]
storage_list_keys() {
  local prefix="${1:-}"

  local mode
  mode=$(detect_storage_mode)

  case "$mode" in
    git)
      han keep list --quiet 2>/dev/null | grep "^${prefix}" || true
      ;;
    folder)
      local state_dir
      state_dir=$(_folder_state_dir)
      if [ -d "$state_dir" ]; then
        ls "$state_dir" 2>/dev/null | grep "^${prefix}" || true
      fi
      ;;
  esac
}

# Delete a state key
# Usage: storage_delete_state <key>
storage_delete_state() {
  local key="$1"

  local mode
  mode=$(detect_storage_mode)

  case "$mode" in
    git)
      han keep delete "$key" --quiet 2>/dev/null || true
      ;;
    folder)
      local state_dir
      state_dir=$(_folder_state_dir)
      rm -f "$state_dir/$key" 2>/dev/null || true
      ;;
  esac
}
