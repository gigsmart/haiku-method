#!/bin/bash
# parse.sh — JSON and YAML parsing utilities for AI-DLC
#
# Thin wrappers around jq and yq (mikefarah/Go) for JSON and YAML parsing.
# All functions handle errors gracefully (return empty/default, never crash hooks).
#
# Usage:
#   source parse.sh
#   echo '{"status":"active"}' | dlc_json_get status
#   dlc_frontmatter_get status intent.md

# Guard against double-sourcing
if [ -n "${_DLC_PARSE_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_DLC_PARSE_SOURCED=1

# Source dependency checker
PARSE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=deps.sh
source "$PARSE_SCRIPT_DIR/deps.sh"

# ============================================================================
# JSON Functions (jq wrappers)
# ============================================================================

# Extract a field from JSON on stdin, with optional default
# Usage: echo '{"key":"val"}' | dlc_json_get "key" ["default"]
dlc_json_get() {
  local field="$1"
  local default="${2:-}"
  if [ -n "$default" ]; then
    jq -r ".$field // \"$default\"" 2>/dev/null || echo "$default"
  else
    jq -r ".$field // empty" 2>/dev/null || echo ""
  fi
}

# Extract a field from JSON on stdin as raw JSON (arrays/objects preserved)
# Usage: echo '{"arr":[1,2]}' | dlc_json_get_raw "arr"
dlc_json_get_raw() {
  local field="$1"
  jq ".$field" 2>/dev/null || echo ""
}

# Set a field in JSON on stdin, output modified JSON to stdout
# Automatically detects boolean/number/null values for correct JSON typing.
# Usage: echo '{}' | dlc_json_set "key" "value"
dlc_json_set() {
  local field="$1"
  local value="$2"
  # Detect JSON literal values (boolean, null, number)
  if [[ "$value" =~ ^(true|false|null|-?[0-9]+\.?[0-9]*(e[+-]?[0-9]+)?)$ ]]; then
    jq --argjson v "$value" ".$field = \$v" 2>/dev/null
  else
    jq --arg v "$value" ".$field = \$v" 2>/dev/null
  fi
}

# Validate JSON on stdin
# Returns 0 if valid, 1 if invalid. No output on success.
dlc_json_validate() {
  jq empty 2>/dev/null
}

# ============================================================================
# YAML Functions (yq wrappers)
# ============================================================================

# Extract a field from YAML on stdin, with optional default
# Usage: cat file.yml | dlc_yaml_get "key" ["default"]
dlc_yaml_get() {
  local field="$1"
  local default="${2:-}"
  if [ -n "$default" ]; then
    yq -r ".$field // \"$default\"" 2>/dev/null || echo "$default"
  else
    yq -r ".$field // \"\"" 2>/dev/null || echo ""
  fi
}

# Extract a field from YAML on stdin as raw YAML
# Usage: cat file.yml | dlc_yaml_get_raw "key"
dlc_yaml_get_raw() {
  local field="$1"
  yq ".$field" 2>/dev/null || echo ""
}

# Update a YAML field in-place in a file
# Detects .md files (uses --front-matter=process) vs .yml/.yaml (plain yq).
# Uses tmp+mv for atomic writes.
# Usage: dlc_yaml_set "key" "value" "file.yml"
dlc_yaml_set() {
  local field="$1"
  local value="$2"
  local file="$3"

  if [ ! -f "$file" ]; then
    echo "ai-dlc: dlc_yaml_set: file not found: $file" >&2
    return 1
  fi

  local tmp="${file}.tmp.$$"
  local expr
  # Detect type for correct YAML encoding
  if [[ "$value" =~ ^(true|false|null|-?[0-9]+\.?[0-9]*)$ ]]; then
    expr=".$field = $value"
  else
    expr=".$field = \"$value\""
  fi

  case "$file" in
    *.md)
      yq --front-matter=process "$expr" "$file" > "$tmp" 2>/dev/null && mv "$tmp" "$file"
      ;;
    *)
      yq "$expr" "$file" > "$tmp" 2>/dev/null && mv "$tmp" "$file"
      ;;
  esac
}

# Convert YAML on stdin to JSON on stdout
# Usage: cat file.yml | dlc_yaml_to_json
dlc_yaml_to_json() {
  yq -o json 2>/dev/null || echo "{}"
}

# ============================================================================
# Frontmatter Functions (markdown-specific)
# ============================================================================

# Extract a field from markdown frontmatter
# Usage: dlc_frontmatter_get "status" "intent.md"
dlc_frontmatter_get() {
  local field="$1"
  local file="$2"

  if [ ! -f "$file" ]; then
    echo ""
    return 0
  fi

  yq --front-matter=extract -r ".$field // \"\"" "$file" 2>/dev/null || echo ""
}

# Update a field in markdown frontmatter in-place
# Uses tmp+mv for atomic writes.
# Usage: dlc_frontmatter_set "status" "active" "intent.md"
dlc_frontmatter_set() {
  local field="$1"
  local value="$2"
  local file="$3"

  if [ ! -f "$file" ]; then
    echo "ai-dlc: dlc_frontmatter_set: file not found: $file" >&2
    return 1
  fi

  local tmp="${file}.tmp.$$"
  local expr
  if [[ "$value" =~ ^(true|false|null|-?[0-9]+\.?[0-9]*)$ ]]; then
    expr=".$field = $value"
  else
    expr=".$field = \"$value\""
  fi

  yq --front-matter=process "$expr" "$file" > "$tmp" 2>/dev/null && mv "$tmp" "$file"
}

# ============================================================================
# Markdown Checkbox Functions (completion criteria helpers)
# ============================================================================

# Check off all markdown checkboxes in a file (or within a specific section)
# Converts all "- [ ]" to "- [x]" within the target section(s).
# If no section is specified, checks off ALL checkboxes in the file.
# Usage: dlc_check_all_criteria <file> [section_heading]
dlc_check_all_criteria() {
  local file="$1"
  local section="${2:-}"

  [ -f "$file" ] || return 1

  if [ -z "$section" ]; then
    # No section filter: check all checkboxes in the entire file
    local tmp="${file}.tmp.$$"
    sed 's/- \[ \]/- [x]/g' "$file" > "$tmp" && mv "$tmp" "$file"
  else
    # Section-scoped: only check boxes between the section heading and the next ## heading
    local tmp="${file}.tmp.$$"
    awk -v section="$section" '
      BEGIN { in_section = 0 }
      /^## / {
        if (index($0, section) > 0) {
          in_section = 1
        } else if (in_section) {
          in_section = 0
        }
      }
      in_section && /- \[ \]/ {
        gsub(/- \[ \]/, "- [x]")
      }
      { print }
    ' "$file" > "$tmp" && mv "$tmp" "$file"
  fi
}

# Check off all completion criteria checkboxes in a unit file
# Handles both "Success Criteria" and "Completion Criteria" section names
# Usage: dlc_check_unit_criteria <unit_file>
dlc_check_unit_criteria() {
  local unit_file="$1"
  [ -f "$unit_file" ] || return 1

  if grep -q '^## Success Criteria' "$unit_file"; then
    dlc_check_all_criteria "$unit_file" "Success Criteria"
  elif grep -q '^## Completion Criteria' "$unit_file"; then
    dlc_check_all_criteria "$unit_file" "Completion Criteria"
  fi
}

# Check off all completion criteria in intent-level files
# Handles: intent.md Success Criteria section + standalone completion-criteria.md
# Usage: dlc_check_intent_criteria <intent_dir>
dlc_check_intent_criteria() {
  local intent_dir="$1"

  if [ -f "$intent_dir/intent.md" ]; then
    if grep -q '^## Success Criteria' "$intent_dir/intent.md"; then
      dlc_check_all_criteria "$intent_dir/intent.md" "Success Criteria"
    elif grep -q '^## Completion Criteria' "$intent_dir/intent.md"; then
      dlc_check_all_criteria "$intent_dir/intent.md" "Completion Criteria"
    fi
  fi

  # Check standalone completion-criteria.md files (all checkboxes)
  for criteria_file in "$intent_dir/completion-criteria.md" "$intent_dir/state/completion-criteria.md"; do
    [ -f "$criteria_file" ] && dlc_check_all_criteria "$criteria_file"
  done
}
