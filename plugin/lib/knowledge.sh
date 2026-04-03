#!/bin/bash
# knowledge.sh — Knowledge artifact filesystem API for AI-DLC
#
# Stateless library providing read/write/query operations for
# `.ai-dlc/knowledge/` artifacts. Each artifact is a markdown file
# with YAML frontmatter containing design, architecture, product,
# conventions, or domain knowledge.
#
# Usage:
#   source knowledge.sh
#   dlc_knowledge_write "design" "$content"
#   dlc_knowledge_read "design"
#   dlc_knowledge_read_section "design" "Design Tokens"
#   dlc_knowledge_load_for_hat "builder"

# Guard against double-sourcing
if [ -n "${_DLC_KNOWLEDGE_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_DLC_KNOWLEDGE_SOURCED=1

# Source parse library (which sources deps.sh)
_DLC_KNOWLEDGE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=parse.sh
source "$_DLC_KNOWLEDGE_SCRIPT_DIR/parse.sh"

# Valid artifact types
_DLC_KNOWLEDGE_TYPES="design architecture product conventions domain"

# ============================================================================
# Internal helpers
# ============================================================================

# Validate an artifact type against the allowed list
# Usage: _dlc_knowledge_validate_type <type>
# Returns: 0 if valid, 1 if invalid (with error to stderr)
_dlc_knowledge_validate_type() {
  local type="$1"
  if [ -z "$type" ]; then
    echo "ai-dlc: knowledge: artifact type is required" >&2
    return 1
  fi
  local valid
  for valid in $_DLC_KNOWLEDGE_TYPES; do
    if [ "$valid" = "$type" ]; then
      return 0
    fi
  done
  echo "ai-dlc: knowledge: invalid artifact type '$type' (valid: $_DLC_KNOWLEDGE_TYPES)" >&2
  return 1
}

# Acquire a lock for a file using mkdir (portable across macOS and Linux)
# Usage: _dlc_knowledge_lock <lockdir>
# Returns: 0 on success, 1 on failure
_dlc_knowledge_lock() {
  local lockdir="$1"
  local attempts=0
  while ! mkdir "$lockdir" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 50 ]; then
      echo "ai-dlc: knowledge: failed to acquire lock after 50 attempts: $lockdir" >&2
      return 1
    fi
    sleep 0.1
  done
  return 0
}

# Release a lock
# Usage: _dlc_knowledge_unlock <lockdir>
_dlc_knowledge_unlock() {
  local lockdir="$1"
  rmdir "$lockdir" 2>/dev/null
}

# ============================================================================
# Public API
# ============================================================================

# Returns absolute path to .ai-dlc/knowledge/. Creates dir if missing.
# Usage: dlc_knowledge_dir
# Output: absolute path to knowledge directory
dlc_knowledge_dir() {
  local repo_root
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "ai-dlc: knowledge: cannot determine repository root" >&2
    return 1
  }

  local knowledge_dir="${repo_root}/.ai-dlc/knowledge"
  mkdir -p "$knowledge_dir" 2>/dev/null || {
    echo "ai-dlc: knowledge: cannot create knowledge directory: $knowledge_dir" >&2
    return 1
  }

  echo "$knowledge_dir"
}

# Check if a knowledge artifact exists.
# Usage: dlc_knowledge_exists <artifact_type>
# Returns: 0 if exists, 1 if not (or invalid type)
dlc_knowledge_exists() {
  local type="$1"
  _dlc_knowledge_validate_type "$type" || return 1

  local kdir
  kdir=$(dlc_knowledge_dir) || return 1

  [ -f "${kdir}/${type}.md" ]
}

# Read the full content of a knowledge artifact, including frontmatter.
# Usage: dlc_knowledge_read <artifact_type>
# Output: full file content to stdout
dlc_knowledge_read() {
  local type="$1"
  _dlc_knowledge_validate_type "$type" || return 1

  local kdir
  kdir=$(dlc_knowledge_dir) || return 1
  local filepath="${kdir}/${type}.md"

  if [ ! -f "$filepath" ]; then
    echo "ai-dlc: knowledge: artifact not found: $type" >&2
    return 1
  fi

  cat "$filepath"
}

# Extract content of a specific section by heading.
# Extracts text between `## heading` and next `## ` or EOF.
# Returns empty (no error) if section not found.
# Usage: dlc_knowledge_read_section <artifact_type> <section_heading>
# Output: section content (excluding heading line) to stdout
dlc_knowledge_read_section() {
  local type="$1"
  local section="$2"
  _dlc_knowledge_validate_type "$type" || return 1

  if [ -z "$section" ]; then
    echo "ai-dlc: knowledge: section heading is required" >&2
    return 1
  fi

  local kdir
  kdir=$(dlc_knowledge_dir) || return 1
  local filepath="${kdir}/${type}.md"

  [ -f "$filepath" ] || return 0

  awk -v section="$section" '
    BEGIN { found = 0 }
    /^## / {
      if (found) exit
      if ($0 == "## " section) { found = 1; next }
    }
    found { print }
  ' "$filepath"
}

# Write a knowledge artifact. Validates type and frontmatter presence.
# Uses atomic write (tmp + mv).
# Usage: dlc_knowledge_write <artifact_type> <content>
dlc_knowledge_write() {
  local type="$1"
  local content="$2"
  _dlc_knowledge_validate_type "$type" || return 1

  if [ -z "$content" ]; then
    echo "ai-dlc: knowledge: content is required" >&2
    return 1
  fi

  # Validate frontmatter: content must start with --- and contain required fields
  local first_line
  first_line=$(printf '%s' "$content" | head -n 1)
  if [ "$first_line" != "---" ]; then
    echo "ai-dlc: knowledge: content must begin with YAML frontmatter (---)" >&2
    return 1
  fi

  # Validate that frontmatter is closed (second --- line exists)
  if ! printf '%s' "$content" | tail -n +2 | grep -qm1 "^---$"; then
    echo "ai-dlc: knowledge: content frontmatter is not closed (missing second ---)" >&2
    return 1
  fi

  # Extract frontmatter block (between first and second ---)
  local frontmatter
  frontmatter=$(printf '%s' "$content" | sed -n '2,/^---$/p' | sed '$d')

  # Validate required frontmatter fields: type, version, created
  local field
  for field in type version created; do
    if ! printf '%s\n' "$frontmatter" | grep -q "^${field}:"; then
      echo "ai-dlc: knowledge: frontmatter missing required field: $field" >&2
      return 1
    fi
  done

  local kdir
  kdir=$(dlc_knowledge_dir) || return 1
  local filepath="${kdir}/${type}.md"
  local tmp="${filepath}.tmp.$$"

  printf '%s\n' "$content" > "$tmp" && mv "$tmp" "$filepath"
}

# Replace or append a section in a knowledge artifact.
# Uses mkdir-based locking for TOCTOU safety. Atomic output via tmp + mv.
# Usage: dlc_knowledge_update_section <artifact_type> <section_heading> <new_content>
dlc_knowledge_update_section() {
  local type="$1"
  local section="$2"
  local new_content="$3"
  _dlc_knowledge_validate_type "$type" || return 1

  if [ -z "$section" ]; then
    echo "ai-dlc: knowledge: section heading is required" >&2
    return 1
  fi

  local kdir
  kdir=$(dlc_knowledge_dir) || return 1
  local filepath="${kdir}/${type}.md"

  if [ ! -f "$filepath" ]; then
    echo "ai-dlc: knowledge: artifact not found: $type (cannot update section in non-existent artifact)" >&2
    return 1
  fi

  local lockdir="${filepath}.lock"
  _dlc_knowledge_lock "$lockdir" || return 1

  # Ensure lock is released on exit from this function
  trap '_dlc_knowledge_unlock "'"$lockdir"'"' RETURN

  local current
  current=$(cat "$filepath")

  local tmp="${filepath}.tmp.$$"

  # Check if section exists in the file
  if printf '%s\n' "$current" | grep -qxF "## ${section}"; then
    # Replace existing section using temp file for multi-line safety.
    # Awk's -v flag cannot handle literal newlines, so we write
    # new_content to a temp file and use getline to read it in awk.
    local content_tmp="${filepath}.content.$$"
    printf '%s\n' "$new_content" > "$content_tmp"

    printf '%s\n' "$current" | awk -v section="$section" -v cfile="$content_tmp" '
      BEGIN { in_section = 0 }
      /^## / {
        if (in_section) {
          in_section = 0
        }
        if ($0 == "## " section) {
          in_section = 1
          print $0
          while ((getline line < cfile) > 0) print line
          close(cfile)
          next
        }
      }
      !in_section { print }
    ' > "$tmp" && mv "$tmp" "$filepath" || {
      rm -f "$content_tmp" "$tmp"
      echo "ai-dlc: knowledge: failed to update section '${section}' in ${type}" >&2
      return 1
    }
    rm -f "$content_tmp"
  else
    # Append new section at end of file
    {
      printf '%s\n' "$current"
      printf '\n## %s\n%s\n' "$section" "$new_content"
    } > "$tmp" && mv "$tmp" "$filepath"
  fi
}

# List existing artifact type names, one per line.
# Only returns types that are in the valid types list.
# Usage: dlc_knowledge_list
# Output: one type name per line
dlc_knowledge_list() {
  local kdir
  kdir=$(dlc_knowledge_dir) || return 1

  if [ ! -d "$kdir" ]; then
    return 0
  fi

  local file basename_no_ext
  for file in "$kdir"/*.md; do
    [ -f "$file" ] || continue
    basename_no_ext=$(basename "$file" .md)
    # Only output if it's a valid type
    local valid
    for valid in $_DLC_KNOWLEDGE_TYPES; do
      if [ "$valid" = "$basename_no_ext" ]; then
        echo "$basename_no_ext"
        break
      fi
    done
  done
}

# Load relevant knowledge artifacts for a given hat.
# Outputs artifact content with separator headers for each found artifact.
# Usage: dlc_knowledge_load_for_hat <hat_name>
# Output: concatenated artifact contents with headers
dlc_knowledge_load_for_hat() {
  local hat="$1"
  if [ -z "$hat" ]; then
    echo "ai-dlc: knowledge: hat name is required" >&2
    return 1
  fi

  local types
  case "$hat" in
    designer)
      types="design"
      ;;
    builder)
      types="architecture conventions domain"
      ;;
    planner)
      types="product domain architecture"
      ;;
    reviewer)
      types="conventions architecture"
      ;;
    *)
      types="domain"
      ;;
  esac

  local type
  for type in $types; do
    if dlc_knowledge_exists "$type"; then
      echo "--- knowledge: ${type} ---"
      dlc_knowledge_read "$type"
      echo ""
    fi
  done

  return 0
}
