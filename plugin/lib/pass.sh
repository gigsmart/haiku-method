#!/bin/bash
# pass.sh — Pass definition resolution and metadata for AI-DLC
#
# Passes are typed disciplinary iterations (design, product, dev).
# Definitions live in plugin/passes/*.md (built-in) and can be
# augmented or extended by project files in .ai-dlc/passes/*.md.
#
# Usage:
#   source pass.sh
#   path=$(resolve_pass_definition "design")
#   instructions=$(load_pass_instructions "design")
#   metadata=$(load_pass_metadata "design")

# Guard against double-sourcing
if [ -n "${_DLC_PASS_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_DLC_PASS_SOURCED=1

# Source configuration system (chains to deps.sh, parse.sh, state.sh)
PASS_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=config.sh
source "$PASS_SCRIPT_DIR/config.sh"
# shellcheck source=dag.sh
source "$PASS_SCRIPT_DIR/dag.sh"

# Resolve the file path for a pass definition
# Checks built-in passes first, then project-level custom passes.
# Usage: resolve_pass_definition <pass_name>
# Returns: absolute path to the pass definition file, or returns 1 if not found
resolve_pass_definition() {
  local pass_name="$1"

  # Validate pass name is a simple identifier (no path traversal)
  if [[ ! "$pass_name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    return 1
  fi

  # Determine plugin root
  local plugin_root="${CLAUDE_PLUGIN_ROOT:-${PASS_SCRIPT_DIR}/../..}"

  # Built-in pass
  local builtin="${plugin_root}/passes/${pass_name}.md"
  if [[ -f "$builtin" ]]; then
    echo "$builtin"
    return 0
  fi

  # Project-level custom pass
  local repo_root
  repo_root=$(find_repo_root 2>/dev/null || echo "")
  if [[ -n "$repo_root" ]]; then
    local project="${repo_root}/.ai-dlc/passes/${pass_name}.md"
    if [[ -f "$project" ]]; then
      echo "$project"
      return 0
    fi
  fi

  return 1
}

# Load pass instructions (body text) with project augmentation
# Three cases:
#   1. Built-in pass, no project override: return built-in body
#   2. Built-in pass WITH project file: built-in body + project body under ## Project Augmentation
#   3. Custom project pass (no built-in): return project body only
# Usage: load_pass_instructions <pass_name>
# Returns: instruction text
load_pass_instructions() {
  local pass_name="$1"

  # Validate pass name is a simple identifier (no path traversal)
  if [[ ! "$pass_name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    return 1
  fi

  local plugin_root="${CLAUDE_PLUGIN_ROOT:-${PASS_SCRIPT_DIR}/../..}"
  local builtin="${plugin_root}/passes/${pass_name}.md"

  local repo_root
  repo_root=$(find_repo_root 2>/dev/null || echo "")
  local project=""
  if [[ -n "$repo_root" ]]; then
    local project_file="${repo_root}/.ai-dlc/passes/${pass_name}.md"
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
    # Custom project pass only
    merged=$(awk '/^---$/{n++; next} n>=2' "$project")
  fi

  printf '%s' "$merged"
}

# Load pass metadata as JSON
# Usage: load_pass_metadata <pass_name>
# Returns: JSON with name, description, available_workflows, default_workflow
load_pass_metadata() {
  local pass_name="$1"

  local def_file
  def_file=$(resolve_pass_definition "$pass_name") || {
    echo "{}"
    return 1
  }

  local name description available_workflows default_workflow
  name=$(dlc_frontmatter_get "name" "$def_file")
  description=$(dlc_frontmatter_get "description" "$def_file")
  available_workflows=$(dlc_frontmatter_get "available_workflows" "$def_file")
  default_workflow=$(dlc_frontmatter_get "default_workflow" "$def_file")

  # Convert YAML array to JSON array: [default, tdd] -> ["default","tdd"]
  local json_workflows
  json_workflows=$(echo "$available_workflows" | sed 's/\[//;s/\]//' | tr ',' '\n' | \
    sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' | \
    sed 's/.*/"&"/' | paste -sd ',' - | sed 's/^/[/;s/$/]/')
  [ -z "$json_workflows" ] && json_workflows="[]"

  # JSON-escape string values
  name="${name//\"/\\\"}"
  description="${description//\"/\\\"}"
  default_workflow="${default_workflow//\"/\\\"}"

  printf '{"name":"%s","description":"%s","available_workflows":%s,"default_workflow":"%s"}' \
    "$name" "$description" "$json_workflows" "$default_workflow"
}

# List all available pass names (union of built-in and project passes, deduplicated)
# Usage: list_available_passes
# Returns: sorted, deduplicated pass names, one per line
list_available_passes() {
  local plugin_root="${CLAUDE_PLUGIN_ROOT:-${PASS_SCRIPT_DIR}/../..}"
  local names=""

  # Built-in passes
  for f in "$plugin_root"/passes/*.md; do
    [[ -f "$f" ]] || continue
    local name
    name=$(basename "$f" .md)
    names="${names}${name}"$'\n'
  done

  # Project passes
  local repo_root
  repo_root=$(find_repo_root 2>/dev/null || echo "")
  if [[ -n "$repo_root" && -d "${repo_root}/.ai-dlc/passes" ]]; then
    for f in "${repo_root}/.ai-dlc/passes"/*.md; do
      [[ -f "$f" ]] || continue
      local name
      name=$(basename "$f" .md)
      names="${names}${name}"$'\n'
    done
  fi

  # Deduplicate and sort
  printf '%s' "$names" | sort -u
}

# Validate that a pass exists (built-in or project-defined)
# Usage: validate_pass_exists <pass_name>
# Returns: 0 if found, 1 if not
validate_pass_exists() {
  local pass_name="$1"
  resolve_pass_definition "$pass_name" >/dev/null 2>&1
}

# Constrain a requested workflow to those available for a pass
# If the requested workflow is in the pass's available_workflows, return it.
# Otherwise, return the pass's default_workflow.
# Usage: constrain_workflow <pass_name> <requested_workflow>
# Returns: the constrained workflow name
constrain_workflow() {
  local pass_name="$1"
  local requested_workflow="$2"

  local def_file
  def_file=$(resolve_pass_definition "$pass_name") || {
    # Pass not found — return requested as-is
    echo "$requested_workflow"
    return 1
  }

  # Extract available_workflows array from frontmatter
  local available_raw
  available_raw=$(dlc_frontmatter_get "available_workflows" "$def_file")

  # Check if requested workflow is in the available list
  # available_raw is a YAML array like [default, tdd, adversarial, bdd]
  # Strip brackets and check each element
  local available_clean
  available_clean="${available_raw#\[}"
  available_clean="${available_clean%\]}"

  local IFS=','
  for item in $available_clean; do
    # Trim whitespace
    item="${item#"${item%%[![:space:]]*}"}"
    item="${item%"${item##*[![:space:]]}"}"
    if [[ "$item" == "$requested_workflow" ]]; then
      echo "$requested_workflow"
      return 0
    fi
  done

  # Not in available list — return default
  local default_workflow
  default_workflow=$(dlc_frontmatter_get "default_workflow" "$def_file")
  echo "$default_workflow"
  return 0
}
