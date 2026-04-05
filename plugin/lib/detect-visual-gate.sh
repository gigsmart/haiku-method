#!/bin/bash
# detect-visual-gate.sh — Visual gate auto-detection for H·AI·K·U
#
# Determines whether a unit should trigger visual fidelity review
# using a 6-point heuristic. Any single match activates the gate.
#
# Heuristics:
#   1. Unit discipline is frontend or design
#   2. Unit has design_ref: field in frontmatter
#   3. Unit has wireframe: field in frontmatter
#   4. Changed files include UI extensions (.tsx, .jsx, .vue, .svelte, .html, .css, .scss)
#   5. Unit spec body mentions UI terms (page, view, screen, component, layout, dashboard, form)
#   6. Changed files include provider-native design files (.op, .pen, .excalidraw, .fig)
#
# Output: VISUAL_GATE=true|false SCORE=N
#   The boolean is the primary signal; the score provides granularity.
#   Heuristics 1-5 contribute 1 point each; heuristic 6 contributes 2 points.
#
# Usage (CLI):
#   detect-visual-gate.sh --unit-file <path> --changed-files <file-list>
#
# Usage (sourced):
#   source detect-visual-gate.sh
#   hku_detect_visual_gate --unit-file <path> --changed-files <file-list>

# Guard against double-sourcing
if [ -n "${_HKU_DETECT_VISUAL_GATE_SOURCED:-}" ]; then
  return 0 2>/dev/null || true
fi
_HKU_DETECT_VISUAL_GATE_SOURCED=1

DETECT_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=deps.sh
source "$DETECT_SCRIPT_DIR/deps.sh"
HAIKU_PARSE="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/..}/bin/haiku-parse.mjs"

# UI file extensions that trigger the visual gate
readonly _VISUAL_GATE_UI_EXTENSIONS="tsx jsx vue svelte html css scss"

# Provider-native design file extensions (weighted higher — strong design signal)
readonly _VISUAL_GATE_PROVIDER_EXTENSIONS="op pen excalidraw fig"

# UI terms in spec body that trigger the visual gate (case-insensitive word boundaries)
readonly _VISUAL_GATE_UI_TERMS="page|view|screen|component|layout|dashboard|form"

# ============================================================================
# Heuristic Functions
# ============================================================================

# Heuristic 1: Check if unit discipline is frontend or design
# Returns 0 if match, 1 if not
_check_discipline() {
  local unit_file="$1"

  local discipline
  discipline=$("$HAIKU_PARSE" get "$unit_file" "discipline")

  case "$discipline" in
    frontend|design) return 0 ;;
    *) return 1 ;;
  esac
}

# Heuristic 2: Check if unit has design_ref: field
# Returns 0 if present, 1 if not
_check_design_ref() {
  local unit_file="$1"

  local design_ref
  design_ref=$("$HAIKU_PARSE" get "$unit_file" "design_ref")

  [ -n "$design_ref" ] && return 0
  return 1
}

# Heuristic 3: Check if unit has wireframe: field
# Returns 0 if present, 1 if not
_check_wireframe() {
  local unit_file="$1"

  local wireframe
  wireframe=$("$HAIKU_PARSE" get "$unit_file" "wireframe")

  [ -n "$wireframe" ] && return 0
  return 1
}

# Heuristic 4: Check if changed files include UI extensions
# Returns 0 if any UI file found, 1 if not
_check_changed_files() {
  local changed_files="$1"

  [ -z "$changed_files" ] && return 1

  local file ext
  # Handle comma-separated list or newline-separated
  local normalized
  normalized=$(echo "$changed_files" | tr ',' '\n')

  while IFS= read -r file; do
    file=$(echo "$file" | xargs) # trim whitespace
    [ -z "$file" ] && continue

    # Extract extension (lowercase)
    ext="${file##*.}"
    ext=$(echo "$ext" | tr '[:upper:]' '[:lower:]')

    for ui_ext in $_VISUAL_GATE_UI_EXTENSIONS; do
      if [ "$ext" = "$ui_ext" ]; then
        return 0
      fi
    done
  done <<< "$normalized"

  return 1
}

# Heuristic 5: Check if unit spec body mentions UI terms
# Returns 0 if any term found, 1 if not
_check_spec_body() {
  local unit_file="$1"

  [ ! -f "$unit_file" ] && return 1

  # Extract body (everything after the second --- in frontmatter)
  local body
  body=$(awk '/^---$/{n++; next} n>=2' "$unit_file")

  [ -z "$body" ] && return 1

  # Case-insensitive word-boundary search for UI terms
  if echo "$body" | grep -iqE "\b($_VISUAL_GATE_UI_TERMS)\b"; then
    return 0
  fi

  return 1
}

# Heuristic 6: Check if changed files include provider-native design files
# Returns 0 if any provider-native file found, 1 if not
_check_provider_native_files() {
  local changed_files="$1"

  [ -z "$changed_files" ] && return 1

  local file ext
  local normalized
  normalized=$(echo "$changed_files" | tr ',' '\n')

  while IFS= read -r file; do
    file=$(echo "$file" | xargs) # trim whitespace
    [ -z "$file" ] && continue

    # Extract extension (lowercase)
    ext="${file##*.}"
    ext=$(echo "$ext" | tr '[:upper:]' '[:lower:]')

    for provider_ext in $_VISUAL_GATE_PROVIDER_EXTENSIONS; do
      if [ "$ext" = "$provider_ext" ]; then
        return 0
      fi
    done
  done <<< "$normalized"

  return 1
}

# ============================================================================
# Main Detection
# ============================================================================

# Detect whether the visual gate should be active for a unit.
#
# Usage: hku_detect_visual_gate --unit-file <path> [--changed-files <list>]
# Output: VISUAL_GATE=true SCORE=N or VISUAL_GATE=false SCORE=0 to stdout
#   Heuristics 1-5 contribute 1 point each; heuristic 6 contributes 2 points.
# Exit: 0 always (detection itself does not fail)
hku_detect_visual_gate() {
  local unit_file=""
  local changed_files=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --unit-file)  unit_file="$2"; shift 2 ;;
      --changed-files) changed_files="$2"; shift 2 ;;
      --help)
        echo "Usage: detect-visual-gate.sh [options]"
        echo ""
        echo "Options:"
        echo "  --unit-file <path>        Path to unit markdown file (required)"
        echo "  --changed-files <list>    Comma-separated file list or file with one path per line"
        echo ""
        echo "Output: VISUAL_GATE=true|false SCORE=N"
        echo ""
        echo "Any single heuristic match activates the gate:"
        echo "  1. discipline: frontend or design (1 point)"
        echo "  2. design_ref: field present (1 point)"
        echo "  3. wireframe: field present (1 point)"
        echo "  4. Changed files include UI extensions (1 point)"
        echo "  5. Spec body mentions UI terms (1 point)"
        echo "  6. Changed files include provider-native design files (2 points)"
        return 0
        ;;
      *)
        echo "haiku: detect-visual-gate: unknown argument: $1" >&2
        return 1
        ;;
    esac
  done

  if [ -z "$unit_file" ]; then
    echo "haiku: detect-visual-gate: --unit-file is required" >&2
    return 1
  fi

  if [ ! -f "$unit_file" ]; then
    echo "haiku: detect-visual-gate: unit file not found: $unit_file" >&2
    echo "VISUAL_GATE=false SCORE=0"
    return 0
  fi

  # If changed-files points to a file, read its contents
  if [ -n "$changed_files" ] && [ -f "$changed_files" ]; then
    changed_files=$(cat "$changed_files")
  fi

  # Run all heuristics and accumulate score
  local score=0

  if _check_discipline "$unit_file"; then
    score=$((score + 1))
  fi

  if _check_design_ref "$unit_file"; then
    score=$((score + 1))
  fi

  if _check_wireframe "$unit_file"; then
    score=$((score + 1))
  fi

  if _check_changed_files "$changed_files"; then
    score=$((score + 1))
  fi

  if _check_spec_body "$unit_file"; then
    score=$((score + 1))
  fi

  # Heuristic 6: provider-native files (weighted 2 points)
  if _check_provider_native_files "$changed_files"; then
    score=$((score + 2))
  fi

  if [ "$score" -gt 0 ]; then
    echo "VISUAL_GATE=true SCORE=$score"
  else
    echo "VISUAL_GATE=false SCORE=0"
  fi
  return 0
}

# ============================================================================
# CLI Entry Point
# ============================================================================

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  hku_check_deps
  hku_detect_visual_gate "$@"
  exit $?
fi
