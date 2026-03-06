#!/bin/bash
# config.sh - HAIKU Configuration System
#
# Provides configuration loading with precedence:
# 1. Intent frontmatter (highest priority)
# 2. Project settings (.haiku/settings.yml)
# 3. Built-in defaults (lowest priority)
#
# Usage:
#   source config.sh
#   config=$(get_haiku_config "$intent_dir")

# Source storage abstraction
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=storage.sh
source "$SCRIPT_DIR/storage.sh"

# Default configuration values
HAIKU_DEFAULT_WORKFLOW="default"

# Find project root directory
# Works in both git and folder mode
# Usage: find_project_root [directory]
find_project_root() {
  local dir="${1:-.}"

  local mode
  mode=$(detect_storage_mode)

  case "$mode" in
    git)
      git -C "$dir" rev-parse --show-toplevel 2>/dev/null || echo ""
      ;;
    folder)
      # Walk up looking for .haiku directory
      local current
      current=$(cd "$dir" && pwd)
      while [ "$current" != "/" ]; do
        if [ -d "$current/.haiku" ]; then
          echo "$current"
          return
        fi
        current=$(dirname "$current")
      done
      # Fallback to current directory
      echo "$dir"
      ;;
  esac
}

# Load project settings from .haiku/settings.yml
# Usage: load_haiku_settings [project_root]
# Returns: JSON object or '{}'
load_haiku_settings() {
  local project_root="${1:-$(find_project_root)}"
  local settings_file="$project_root/.haiku/settings.yml"

  if [ ! -f "$settings_file" ]; then
    echo "{}"
    return
  fi

  if command -v han &>/dev/null; then
    han parse yaml --json < "$settings_file" 2>/dev/null || echo "{}"
  else
    echo "{}"
  fi
}

# Load quality gates from settings
# Usage: load_gates [project_root]
# Returns: JSON array of gate configurations
load_gates() {
  local project_root="${1:-$(find_project_root)}"
  local settings
  settings=$(load_haiku_settings "$project_root")

  if [ "$settings" = "{}" ]; then
    echo "[]"
    return
  fi

  local gates
  gates=$(echo "$settings" | jq -c '.gates // []' 2>/dev/null || echo "[]")
  echo "$gates"
}

# Get enabled gates for a specific event
# Usage: get_event_gates <event> [project_root]
# Returns: JSON array of matching gate configs
get_event_gates() {
  local event="$1"
  local project_root="${2:-$(find_project_root)}"
  local gates
  gates=$(load_gates "$project_root")

  echo "$gates" | jq -c "[.[] | select(.enabled != false and (.event // \"Stop\") == \"$event\")]" 2>/dev/null || echo "[]"
}

# Run command-type quality gates for an event
# Usage: run_gates <event> [project_root]
# Returns: 0 if all pass, 1 if any fail
run_gates() {
  local event="$1"
  local project_root="${2:-$(find_project_root)}"
  local gates
  gates=$(get_event_gates "$event" "$project_root")

  local count
  count=$(echo "$gates" | jq 'length' 2>/dev/null || echo "0")

  if [ "$count" -eq 0 ]; then
    return 0
  fi

  local i=0
  while [ "$i" -lt "$count" ]; do
    local gate
    gate=$(echo "$gates" | jq -c ".[$i]")
    local gate_type
    gate_type=$(echo "$gate" | jq -r '.type // "command"')
    local gate_name
    gate_name=$(echo "$gate" | jq -r '.name')

    if [ "$gate_type" = "command" ]; then
      local cmd
      cmd=$(echo "$gate" | jq -r '.command // ""')
      if [ -n "$cmd" ]; then
        echo "Running gate: $gate_name" >&2
        if ! eval "$cmd" >/dev/null 2>&1; then
          echo "Gate FAILED: $gate_name" >&2
          return 1
        fi
        echo "Gate PASSED: $gate_name" >&2
      fi
    fi

    i=$((i + 1))
  done

  return 0
}

# Get merged HAIKU configuration
# Usage: get_haiku_config [intent_dir] [project_root]
# Returns: JSON object
get_haiku_config() {
  local intent_dir="${1:-}"
  local project_root="${2:-$(find_project_root)}"
  local mode
  mode=$(detect_storage_mode)

  # Start with defaults
  local config
  config=$(cat <<EOF
{
  "storage_mode": "$mode",
  "workflow": "$HAIKU_DEFAULT_WORKFLOW"
}
EOF
)

  # Layer: Project settings
  if [ -n "$project_root" ]; then
    local settings
    settings=$(load_haiku_settings "$project_root")
    if [ "$settings" != "{}" ]; then
      local workflow
      workflow=$(echo "$settings" | jq -r '.workflow // empty' 2>/dev/null)
      if [ -n "$workflow" ]; then
        config=$(echo "$config" | jq --arg w "$workflow" '.workflow = $w')
      fi
    fi
  fi

  # Layer: Intent overrides (highest priority)
  if [ -n "$intent_dir" ] && [ -f "$intent_dir/intent.md" ]; then
    local intent_workflow
    if command -v han &>/dev/null; then
      intent_workflow=$(han parse yaml workflow -r --default "" < "$intent_dir/intent.md" 2>/dev/null || echo "")
    fi
    if [ -n "$intent_workflow" ]; then
      config=$(echo "$config" | jq --arg w "$intent_workflow" '.workflow = $w')
    fi
  fi

  echo "$config"
}

# Export config as environment variables
# Usage: export_haiku_config [intent_dir] [project_root]
export_haiku_config() {
  local intent_dir="${1:-}"
  local project_root="${2:-}"
  local config
  config=$(get_haiku_config "$intent_dir" "$project_root")

  export HAIKU_STORAGE_MODE
  HAIKU_STORAGE_MODE=$(echo "$config" | jq -r '.storage_mode')

  export HAIKU_WORKFLOW
  HAIKU_WORKFLOW=$(echo "$config" | jq -r '.workflow')
}
