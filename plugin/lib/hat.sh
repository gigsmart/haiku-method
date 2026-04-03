#!/bin/bash
# hat.sh — Hat resolution and metadata for AI-DLC
#
# Hats define roles (builder, reviewer, planner, etc.).
# Definitions live in plugin/hats/*.md (built-in) and can be
# augmented or extended by project files in .ai-dlc/hats/*.md.
#
# Usage:
#   source hat.sh
#   instructions=$(load_hat_instructions "builder")
#   metadata=$(load_hat_metadata "builder")

# Guard against double-sourcing
if [ -n "${_DLC_HAT_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_DLC_HAT_SOURCED=1

# Source configuration system (chains to deps.sh, parse.sh, state.sh)
HAT_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=config.sh
source "$HAT_SCRIPT_DIR/config.sh"

# Load hat instructions (body text) with project augmentation
# Three cases:
#   1. Built-in hat, no project override: return built-in body
#   2. Built-in hat WITH project file: built-in body + project body under ## Project Augmentation
#   3. Custom project hat (no built-in): return project body only
# Usage: load_hat_instructions <hat_name>
# Returns: instruction text (empty string if neither exists)
load_hat_instructions() {
  local hat_name="$1"

  # Validate hat name is a simple identifier (no path traversal)
  if [[ ! "$hat_name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    return 1
  fi

  local plugin_root="${CLAUDE_PLUGIN_ROOT:-${HAT_SCRIPT_DIR}/../..}"
  local builtin="${plugin_root}/hats/${hat_name}.md"

  local repo_root
  repo_root=$(find_repo_root 2>/dev/null || echo "")
  local project=""
  if [[ -n "$repo_root" ]]; then
    local project_file="${repo_root}/.ai-dlc/hats/${hat_name}.md"
    [[ -f "$project_file" ]] && project="$project_file"
  fi

  local merged=""

  if [[ -f "$builtin" ]]; then
    # Extract body (everything after second ---)
    local body
    body=$(awk '/^---$/{n++; next} n>=2' "$builtin")
    merged="$body"

    # Append project augmentation if project file exists
    if [[ -n "$project" ]]; then
      local project_body
      project_body=$(awk '/^---$/{n++; next} n>=2' "$project")
      merged="${merged}

## Project Augmentation
${project_body}"
    fi
  elif [[ -n "$project" ]]; then
    # Custom project hat only
    merged=$(awk '/^---$/{n++; next} n>=2' "$project")
  fi

  printf '%s' "$merged"
}

# Load hat metadata (name, description) from the hat definition
# Checks built-in first, then project-level. For augmented hats,
# metadata comes from the built-in definition.
# Usage: load_hat_metadata <hat_name>
# Returns: JSON with name, description
load_hat_metadata() {
  local hat_name="$1"

  # Validate hat name is a simple identifier (no path traversal)
  if [[ ! "$hat_name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "{}"
    return 1
  fi

  local plugin_root="${CLAUDE_PLUGIN_ROOT:-${HAT_SCRIPT_DIR}/../..}"
  local builtin="${plugin_root}/hats/${hat_name}.md"

  local hat_file=""

  if [[ -f "$builtin" ]]; then
    hat_file="$builtin"
  else
    local repo_root
    repo_root=$(find_repo_root 2>/dev/null || echo "")
    if [[ -n "$repo_root" ]]; then
      local project_file="${repo_root}/.ai-dlc/hats/${hat_name}.md"
      [[ -f "$project_file" ]] && hat_file="$project_file"
    fi
  fi

  if [[ -z "$hat_file" ]]; then
    echo "{}"
    return 1
  fi

  local name description
  name=$(dlc_frontmatter_get "name" "$hat_file")
  description=$(dlc_frontmatter_get "description" "$hat_file")

  # JSON-escape string values
  name="${name//\"/\\\"}"
  description="${description//\"/\\\"}"

  printf '{"name":"%s","description":"%s"}' "$name" "$description"
}
