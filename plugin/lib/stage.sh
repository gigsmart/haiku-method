#!/bin/bash
# stage.sh — Stage resolution and metadata for H·AI·K·U
#
# Stages are lifecycle phases within a studio. Each stage has a
# STAGE.md definition and an outputs/ directory with output docs.
#
# Usage:
#   source stage.sh
#   path=$(hku_resolve_stage "design" "software")
#   metadata=$(hku_load_stage_metadata "design" "software")

# Guard
if [ -n "${_HKU_STAGE_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_HKU_STAGE_SOURCED=1

STAGE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=config.sh
source "$STAGE_SCRIPT_DIR/config.sh"
# shellcheck source=studio.sh
source "$STAGE_SCRIPT_DIR/studio.sh"

# Resolve a stage definition to its STAGE.md path
# Resolution order: project-level (.haiku/studios/) → built-in (plugin/studios/)
# Usage: hku_resolve_stage <stage_name> <studio_name>
# Returns: absolute path to STAGE.md, or empty + return 1
hku_resolve_stage() {
  local stage="$1"
  local studio="$2"

  # Validate names (path traversal guard)
  if [[ ! "$stage" =~ ^[a-zA-Z0-9_-]+$ ]] || [[ ! "$studio" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    return 1
  fi

  # Project-level override
  local repo_root
  repo_root=$(find_repo_root 2>/dev/null || echo "")
  if [[ -n "$repo_root" ]]; then
    local project="${repo_root}/.haiku/studios/${studio}/stages/${stage}/STAGE.md"
    if [[ -f "$project" ]]; then
      echo "$project"
      return 0
    fi
  fi

  # Built-in
  local plugin_root="${CLAUDE_PLUGIN_ROOT:-${STAGE_SCRIPT_DIR}/../..}"
  local builtin="${plugin_root}/studios/${studio}/stages/${stage}/STAGE.md"
  if [[ -f "$builtin" ]]; then
    echo "$builtin"
    return 0
  fi

  return 1
}

# Load stage metadata as JSON
# Usage: hku_load_stage_metadata <stage_name> <studio_name>
# Returns: JSON object with all frontmatter fields
hku_load_stage_metadata() {
  local stage="$1"
  local studio="$2"

  local stage_file
  stage_file=$(hku_resolve_stage "$stage" "$studio") || {
    echo "{}"
    return 1
  }

  yq --front-matter=extract -o json '.' "$stage_file" 2>/dev/null || echo "{}"
}

# Resolve the outputs directory for a stage
# Usage: hku_resolve_stage_outputs_dir <stage_name> <studio_name>
# Returns: absolute path to outputs/ directory (may not exist)
hku_resolve_stage_outputs_dir() {
  local stage="$1"
  local studio="$2"

  local stage_file
  stage_file=$(hku_resolve_stage "$stage" "$studio") || return 1

  echo "$(dirname "$stage_file")/outputs"
}

# Load output document definitions for a stage
# Usage: hku_load_stage_outputs <stage_name> <studio_name>
# Returns: JSON array of output definitions
hku_load_stage_outputs() {
  local stage="$1"
  local studio="$2"

  local outputs_dir
  outputs_dir=$(hku_resolve_stage_outputs_dir "$stage" "$studio") || {
    echo "[]"
    return 1
  }

  if [[ ! -d "$outputs_dir" ]] || ! ls "$outputs_dir"/*.md >/dev/null 2>&1; then
    echo "[]"
    return 0
  fi

  local result="["
  local first=true

  for f in "$outputs_dir"/*.md; do
    [[ -f "$f" ]] || continue
    local meta
    meta=$(yq --front-matter=extract -o json '.' "$f" 2>/dev/null || echo "{}")
    local filename
    filename=$(basename "$f")
    meta=$(echo "$meta" | jq --arg file "$filename" '. + {file: $file}')

    if [[ "$first" = "true" ]]; then
      first=false
    else
      result="${result},"
    fi
    result="${result}${meta}"
  done

  result="${result}]"
  echo "$result"
}

# Resolve stage inputs to prior stage outputs
# Usage: hku_resolve_stage_inputs <stage_name> <studio_name> [intent_dir]
# Returns: JSON array of {name, scope, resolved_path}
hku_resolve_stage_inputs() {
  local stage="$1"
  local studio="$2"
  local intent_dir="${3:-}"

  local meta
  meta=$(hku_load_stage_metadata "$stage" "$studio")

  local inputs
  inputs=$(echo "$meta" | jq -c '.inputs // []' 2>/dev/null)
  if [[ "$inputs" = "[]" ]] || [[ "$inputs" = "null" ]] || [[ -z "$inputs" ]]; then
    echo "[]"
    return 0
  fi

  local result="["
  local first=true

  while IFS= read -r entry; do
    local src_stage src_output
    src_stage=$(echo "$entry" | jq -r '.stage')
    src_output=$(echo "$entry" | jq -r '.output')
    local src_scope
    src_scope=$(echo "$entry" | jq -r '.scope // "intent"')

    local resolved_path=""
    local scope="$src_scope"

    if [[ -n "$intent_dir" ]]; then
      case "$scope" in
        project)
          # Project-scoped: look in .haiku/knowledge/
          local repo_root
          repo_root=$(find_repo_root 2>/dev/null || echo "")
          if [[ -n "$repo_root" && -f "${repo_root}/.haiku/knowledge/${src_output}" ]]; then
            resolved_path="${repo_root}/.haiku/knowledge/${src_output}"
          fi
          ;;
        stage)
          # Stage-scoped: look in intent's stages/{src_stage}/
          if [[ -f "${intent_dir}/stages/${src_stage}/${src_output}" ]]; then
            resolved_path="${intent_dir}/stages/${src_stage}/${src_output}"
          fi
          ;;
        *)
          # Intent-scoped (default): look in intent knowledge/ and stages/{src_stage}/outputs/
          if [[ -f "${intent_dir}/knowledge/${src_output}" ]]; then
            resolved_path="${intent_dir}/knowledge/${src_output}"
          elif [[ -f "${intent_dir}/stages/${src_stage}/outputs/${src_output}" ]]; then
            resolved_path="${intent_dir}/stages/${src_stage}/outputs/${src_output}"
          fi
          ;;
      esac
    fi

    # Fallback to built-in stage output definition
    if [[ -z "$resolved_path" ]]; then
      local src_outputs_dir
      src_outputs_dir=$(hku_resolve_stage_outputs_dir "$src_stage" "$studio" 2>/dev/null || echo "")
      if [[ -n "$src_outputs_dir" && -f "${src_outputs_dir}/${src_output}" ]]; then
        resolved_path="${src_outputs_dir}/${src_output}"
      fi
    fi

    local obj
    obj=$(jq -n --arg name "$src_output" --arg scope "$scope" --arg path "$resolved_path" \
      '{name: $name, scope: $scope, resolved_path: $path}')

    if [[ "$first" = "true" ]]; then
      first=false
    else
      result="${result},"
    fi
    result="${result}${obj}"
  done < <(echo "$inputs" | jq -c '.[]')

  result="${result}]"
  echo "$result"
}

# List stages with completion status for an intent
# Usage: hku_list_stages_with_status <intent_file>
# Returns: newline-separated "stage_name:status" pairs
hku_list_stages_with_status() {
  local intent_file="$1"

  local studio
  studio=$(hku_get_active_studio "$intent_file")

  local active_stage
  active_stage=$(hku_frontmatter_get "active_stage" "$intent_file" 2>/dev/null)

  if [[ -z "$active_stage" ]]; then
    # No active_stage set — first stage is active, rest are pending
    local first=true
    while IFS= read -r stage; do
      if [[ "$first" = "true" ]]; then
        echo "${stage}:active"
        first=false
      else
        echo "${stage}:pending"
      fi
    done < <(hku_load_studio_stages "$studio")
  else
    local found_active=false
    while IFS= read -r stage; do
      if [[ "$found_active" = "true" ]]; then
        echo "${stage}:pending"
      elif [[ "$stage" = "$active_stage" ]]; then
        echo "${stage}:active"
        found_active=true
      else
        echo "${stage}:completed"
      fi
    done < <(hku_load_studio_stages "$studio")
  fi
}
