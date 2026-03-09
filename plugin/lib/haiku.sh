#!/bin/bash
# haiku.sh - HAIKU Workspace Integration for AI-DLC
#
# Detects and reads from an organization's HAIKU workspace.
# This is opt-in: only activates if .haiku.yml exists in the project
# or HAIKU_WORKSPACE is set.
#
# Usage:
#   source haiku.sh
#   ws=$(haiku_resolve_workspace)
#   context=$(haiku_memory_context 100)
#   haiku_memory_write "learnings" "$CONTENT" "append"

# Resolve the HAIKU workspace path (if configured)
# Returns empty string if not configured.
# Usage: haiku_resolve_workspace
haiku_resolve_workspace() {
  # 1. Environment variable (highest priority)
  if [ -n "${HAIKU_WORKSPACE:-}" ]; then
    echo "$HAIKU_WORKSPACE"
    return
  fi

  # 2. .haiku.yml in project root (walk up from cwd)
  local current
  current=$(pwd)
  while [ "$current" != "/" ]; do
    if [ -f "$current/.haiku.yml" ]; then
      local configured
      configured=$(_yaml_get_simple "workspace" "" < "$current/.haiku.yml" 2>/dev/null)
      if [ -n "$configured" ]; then
        # Expand ~ to home directory
        configured="${configured/#\~/$HOME}"
        echo "$configured"
        return
      fi
    fi
    current=$(dirname "$current")
  done

  # Not configured
  echo ""
}

# Read organizational memory from the HAIKU workspace.
# Returns formatted markdown context block.
# Usage: haiku_memory_context [max_lines]
haiku_memory_context() {
  local max_lines="${1:-100}"
  local workspace
  workspace=$(haiku_resolve_workspace)
  [ -z "$workspace" ] && return

  local memory_dir="$workspace/memory"
  [ -d "$memory_dir" ] || return

  local output="" has_content=false

  # Read top-level memory files
  for f in "$memory_dir"/*.md; do
    [ -f "$f" ] || continue
    local name content
    name=$(basename "$f" .md)
    content=$(cat "$f")
    [ -z "$content" ] && continue
    has_content=true
    output="${output}#### ${name}

${content}

"
  done

  # Read subdirectory memory files (e.g., domain/)
  for subdir in "$memory_dir"/*/; do
    [ -d "$subdir" ] || continue
    local subdir_name
    subdir_name=$(basename "$subdir")
    for f in "$subdir"/*.md; do
      [ -f "$f" ] || continue
      local name content
      name=$(basename "$f" .md)
      content=$(cat "$f")
      [ -z "$content" ] && continue
      has_content=true
      output="${output}#### ${subdir_name}/${name}

${content}

"
    done
  done

  if [ "$has_content" = "true" ]; then
    echo "$output" | head -n "$max_lines"
  fi
}

# Write to organizational memory in the HAIKU workspace.
# Usage: haiku_memory_write <name> <content> [mode]
# mode: "overwrite" (default) or "append"
haiku_memory_write() {
  local name="$1"
  local content="$2"
  local mode="${3:-overwrite}"
  local workspace
  workspace=$(haiku_resolve_workspace)
  [ -z "$workspace" ] && return 1

  local dir="$workspace/memory"
  mkdir -p "$dir"
  local file="$dir/${name}.md"

  case "$mode" in
    append)
      printf '\n%s' "$content" >> "$file"
      ;;
    *)
      printf '%s' "$content" > "$file"
      ;;
  esac
}

# Check if a HAIKU workspace is configured.
# Usage: haiku_is_configured && echo "yes"
haiku_is_configured() {
  local ws
  ws=$(haiku_resolve_workspace)
  [ -n "$ws" ]
}
