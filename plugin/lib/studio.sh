#!/bin/bash
# studio.sh — Studio resolution and metadata for H·AI·K·U
#
# Studios are named lifecycle templates that define stage ordering,
# persistence type, and metadata. Definitions live in plugin/studios/
# (built-in) and .haiku/studios/ (project-level).
#
# Usage:
#   source studio.sh
#   path=$(hku_resolve_studio "software")
#   metadata=$(hku_load_studio_metadata "software")

# Guard
if [ -n "${_HKU_STUDIO_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_HKU_STUDIO_SOURCED=1

# Source config (chains to deps, parse, state)
STUDIO_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=config.sh
source "$STUDIO_SCRIPT_DIR/config.sh"

# Resolve a studio definition to its STUDIO.md path
# Resolution order: project-level (.haiku/studios/) → built-in (plugin/studios/)
# Usage: hku_resolve_studio <studio_name>
# Returns: absolute path to STUDIO.md, or empty + return 1
hku_resolve_studio() {
  local name="$1"

  # Validate name (path traversal guard)
  if [[ ! "$name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    return 1
  fi

  # Project-level override
  local repo_root
  repo_root=$(find_repo_root 2>/dev/null || echo "")
  if [[ -n "$repo_root" ]]; then
    local project="${repo_root}/.haiku/studios/${name}/STUDIO.md"
    if [[ -f "$project" ]]; then
      echo "$project"
      return 0
    fi
  fi

  # Built-in
  local plugin_root="${CLAUDE_PLUGIN_ROOT:-${STUDIO_SCRIPT_DIR}/../..}"
  local builtin="${plugin_root}/studios/${name}/STUDIO.md"
  if [[ -f "$builtin" ]]; then
    echo "$builtin"
    return 0
  fi

  return 1
}

# Load studio metadata as JSON
# Usage: hku_load_studio_metadata <studio_name>
# Returns: JSON object with name, description, stages, persistence
hku_load_studio_metadata() {
  local name="$1"

  local studio_file
  studio_file=$(hku_resolve_studio "$name") || {
    echo "{}"
    return 1
  }

  local sname sdescription stages persistence
  sname=$("$HAIKU_PARSE" get "$studio_file" "name")
  sdescription=$("$HAIKU_PARSE" get "$studio_file" "description")
  stages=$(yq --front-matter=extract -o json '.stages' "$studio_file" 2>/dev/null || echo "[]")
  persistence=$(yq --front-matter=extract -o json '.persistence' "$studio_file" 2>/dev/null || echo "null")

  # Default persistence if missing
  if [ "$persistence" = "null" ] || [ -z "$persistence" ]; then
    persistence='{"type":"git","delivery":"pull-request"}'
  fi

  jq -n --arg name "$sname" --arg description "$sdescription" \
    --argjson stages "$stages" --argjson persistence "$persistence" \
    '{"name":$name,"description":$description,"stages":$stages,"persistence":$persistence}'
}

# Load ordered stage names for a studio
# Usage: hku_load_studio_stages <studio_name>
# Returns: newline-separated stage names
hku_load_studio_stages() {
  local name="$1"

  local studio_file
  studio_file=$(hku_resolve_studio "$name") || return 1

  yq --front-matter=extract -r '.stages[]' "$studio_file" 2>/dev/null
}

# Validate that all stages in a studio have STAGE.md files
# Uses inline file checks to avoid circular dependency with stage.sh
# Usage: hku_validate_studio <studio_name>
# Returns: 0 if all valid, 1 if any missing
hku_validate_studio() {
  local name="$1"

  local studio_file
  studio_file=$(hku_resolve_studio "$name") || return 1

  local studio_dir
  studio_dir=$(dirname "$studio_file")
  local valid=0

  local repo_root
  repo_root=$(find_repo_root 2>/dev/null || echo "")

  while IFS= read -r stage; do
    local found=false

    # Check project-level first
    if [[ -n "$repo_root" && -f "${repo_root}/.haiku/studios/${name}/stages/${stage}/STAGE.md" ]]; then
      found=true
    fi

    # Check built-in (same studio dir)
    if [[ "$found" = "false" && -f "${studio_dir}/stages/${stage}/STAGE.md" ]]; then
      found=true
    fi

    if [[ "$found" = "false" ]]; then
      echo "haiku: studio '$name': stage '$stage' missing STAGE.md" >&2
      valid=1
    fi
  done < <(hku_load_studio_stages "$name")

  return "$valid"
}

# Get the active studio for the current context
# Fallthrough: intent frontmatter → settings → default
# Usage: hku_get_active_studio [intent_file]
# Returns: studio name string
hku_get_active_studio() {
  local intent_file="${1:-}"

  # 1. Intent frontmatter
  if [[ -n "$intent_file" && -f "$intent_file" ]]; then
    local studio
    studio=$("$HAIKU_PARSE" get "$intent_file" "studio")
    if [[ -n "$studio" ]]; then
      echo "$studio"
      return 0
    fi
  fi

  # 2. Settings
  local setting
  setting=$(get_setting_value "studio" 2>/dev/null)
  if [[ -n "$setting" ]]; then
    echo "$setting"
    return 0
  fi

  # 3. Default
  echo "ideation"
}

# List all available studios (built-in + project-level, deduplicated)
# Usage: hku_list_available_studios
# Returns: sorted, deduplicated studio names, one per line
hku_list_available_studios() {
  local plugin_root="${CLAUDE_PLUGIN_ROOT:-${STUDIO_SCRIPT_DIR}/../..}"
  local names=""

  # Built-in studios
  if [[ -d "${plugin_root}/studios" ]]; then
    for d in "${plugin_root}/studios"/*/; do
      [[ -f "${d}STUDIO.md" ]] || continue
      local name
      name=$(basename "$d")
      names="${names}${name}"$'\n'
    done
  fi

  # Project-level studios
  local repo_root
  repo_root=$(find_repo_root 2>/dev/null || echo "")
  if [[ -n "$repo_root" && -d "${repo_root}/.haiku/studios" ]]; then
    for d in "${repo_root}/.haiku/studios"/*/; do
      [[ -f "${d}STUDIO.md" ]] || continue
      local name
      name=$(basename "$d")
      names="${names}${name}"$'\n'
    done
  fi

  # Deduplicate and sort
  printf '%s' "$names" | sort -u
}
