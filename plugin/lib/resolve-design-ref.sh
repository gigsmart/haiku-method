#!/bin/bash
# resolve-design-ref.sh — Design reference resolver for AI-DLC
#
# Resolves which design reference to use for a unit's visual fidelity
# comparison. Implements a 3-level priority hierarchy:
#   1. External design (design_ref: field) — fidelity: high
#   2. Previous iteration screenshots (iterates_on) — fidelity: medium
#   3. Wireframe HTML (wireframe: field) — fidelity: low
#
# Generates reference screenshots using the capture infrastructure with
# ref- prefix, and outputs structured JSON metadata.
#
# Usage (CLI):
#   resolve-design-ref.sh --intent-slug <slug> --unit-slug <slug> --intent-dir <path>
#
# Usage (sourced):
#   source resolve-design-ref.sh
#   dlc_resolve_design_ref --intent-slug <slug> --unit-slug <slug> --intent-dir <path>

# Guard against double-sourcing
if [ -n "${_DLC_RESOLVE_DESIGN_REF_SOURCED:-}" ]; then
  return 0 2>/dev/null || true
fi
_DLC_RESOLVE_DESIGN_REF_SOURCED=1

RESOLVE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=deps.sh
source "$RESOLVE_SCRIPT_DIR/deps.sh"
# shellcheck source=parse.sh
source "$RESOLVE_SCRIPT_DIR/parse.sh"

# ============================================================================
# View Discovery
# ============================================================================

# Discover views for a unit from available sources.
# Priority: explicit views: frontmatter > directory contents > filename inference > ["main"]
#
# Usage: dlc_discover_views <unit_file> [source_path]
# Output: JSON array of view names to stdout
dlc_discover_views() {
  local unit_file="$1"
  local source_path="${2:-}"

  # 1. Explicit views: frontmatter field
  if [ -f "$unit_file" ]; then
    local views_raw
    views_raw=$(yq --front-matter=extract -o json '.views' "$unit_file" 2>/dev/null || echo "null")
    if [ "$views_raw" != "null" ] && [ -n "$views_raw" ]; then
      # views: can be array of strings or array of objects with .name
      local views_array
      views_array=$(echo "$views_raw" | jq -c '
        if type == "array" then
          [ .[] | if type == "object" then .name else . end ] | select(length > 0)
        else null end
      ' 2>/dev/null || echo "null")
      if [ "$views_array" != "null" ] && [ "$views_array" != "[]" ]; then
        echo "$views_array"
        return 0
      fi
    fi
  fi

  # 2. Directory contents (if source_path is a directory)
  if [ -n "$source_path" ] && [ -d "$source_path" ]; then
    local dir_views="[]"
    local found=false
    while IFS= read -r -d '' file; do
      local fname
      fname="$(basename "$file")"
      local name="${fname%.*}"
      dir_views=$(echo "$dir_views" | jq --arg v "$name" '. + [$v]')
      found=true
    done < <(find "$source_path" -maxdepth 1 -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.html" \) -print0 | sort -z)
    if [ "$found" = "true" ]; then
      echo "$dir_views"
      return 0
    fi
  fi

  # 3. Filename inference from source_path
  if [ -n "$source_path" ] && [ -f "$source_path" ]; then
    local fname
    fname="$(basename "$source_path")"
    local name="${fname%.*}"
    # Strip common suffixes: -wireframe, -mockup, -design, -ref
    name=$(echo "$name" | sed -E 's/-(wireframe|mockup|design|ref)$//')
    # Strip unit slug prefix if present (e.g., unit-02-dashboard -> dashboard)
    name=$(echo "$name" | sed -E 's/^unit-[0-9]+-//')
    echo "[\"$name\"]"
    return 0
  fi

  # 4. Default fallback
  echo '["main"]'
}

# ============================================================================
# Resolution Functions
# ============================================================================

# Resolve design_ref: field (Level 1 — highest priority)
# Returns 0 if resolved, 1 if not found/applicable
# Sets: _RESOLVED_TYPE, _RESOLVED_FIDELITY, _RESOLVED_SOURCE, _RESOLVED_FORMAT
_resolve_design_ref_field() {
  local unit_file="$1"
  local repo_root="$2"

  local design_ref
  design_ref=$(dlc_frontmatter_get "design_ref" "$unit_file")

  [ -z "$design_ref" ] && return 1

  # Check for provider URI (e.g., figma://)
  if [[ "$design_ref" =~ ^[a-z]+:// ]]; then
    echo "ai-dlc: resolve-design-ref: provider URI not yet supported: $design_ref" >&2
    echo "ai-dlc: resolve-design-ref: falling through to next priority level" >&2
    return 1
  fi

  # Resolve relative paths against repo root
  local resolved_path="$design_ref"
  if [[ "$design_ref" != /* ]]; then
    resolved_path="$repo_root/$design_ref"
  fi

  # Verify file/directory exists
  if [ ! -e "$resolved_path" ]; then
    echo "ai-dlc: resolve-design-ref: design_ref path not found: $resolved_path" >&2
    return 1
  fi

  # Determine format
  local format=""
  if [ -d "$resolved_path" ]; then
    format="directory"
  elif [ -f "$resolved_path" ]; then
    local ext="${resolved_path##*.}"
    ext=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
    case "$ext" in
      png)  format="png" ;;
      jpg|jpeg) format="jpg" ;;
      html|htm) format="html" ;;
      webp) format="webp" ;;
      *)
        echo "ai-dlc: resolve-design-ref: unsupported design_ref format: $ext" >&2
        return 1
        ;;
    esac
  fi

  _RESOLVED_TYPE="external"
  _RESOLVED_FIDELITY="high"
  _RESOLVED_SOURCE="$resolved_path"
  _RESOLVED_FORMAT="$format"
  return 0
}

# Resolve previous iteration screenshots (Level 2)
# Returns 0 if resolved, 1 if not found/applicable
_resolve_iteration_screenshots() {
  local intent_file="$1"
  local unit_slug="$2"
  local repo_root="$3"

  local iterates_on
  iterates_on=$(dlc_frontmatter_get "iterates_on" "$intent_file")

  [ -z "$iterates_on" ] && return 1

  # Search filesystem first
  local prev_screenshots_dir="$repo_root/.ai-dlc/$iterates_on/screenshots"

  # Try exact unit slug match
  if [ -d "$prev_screenshots_dir/$unit_slug" ]; then
    local has_files=false
    for f in "$prev_screenshots_dir/$unit_slug"/*.png "$prev_screenshots_dir/$unit_slug"/*.jpg; do
      [ -f "$f" ] && { has_files=true; break; }
    done
    if [ "$has_files" = "true" ]; then
      _RESOLVED_TYPE="iteration"
      _RESOLVED_FIDELITY="medium"
      _RESOLVED_SOURCE="$prev_screenshots_dir/$unit_slug"
      _RESOLVED_FORMAT="directory"
      return 0
    fi
  fi

  # Try any screenshots directory from previous intent
  if [ -d "$prev_screenshots_dir" ]; then
    local first_dir=""
    for d in "$prev_screenshots_dir"/*/; do
      [ -d "$d" ] || continue
      for f in "$d"*.png "$d"*.jpg; do
        [ -f "$f" ] && { first_dir="$d"; break 2; }
      done
    done
    if [ -n "$first_dir" ]; then
      _RESOLVED_TYPE="iteration"
      _RESOLVED_FIDELITY="medium"
      _RESOLVED_SOURCE="${first_dir%/}"
      _RESOLVED_FORMAT="directory"
      return 0
    fi
  fi

  # Git branch fallback: try to find screenshots on the previous intent's branch
  local prev_branch="ai-dlc/$iterates_on/main"
  if git rev-parse --verify "$prev_branch" >/dev/null 2>&1; then
    # Check if screenshots exist on that branch
    local git_screenshots
    git_screenshots=$(git ls-tree -r --name-only "$prev_branch" -- ".ai-dlc/$iterates_on/screenshots/" 2>/dev/null || echo "")
    if [ -n "$git_screenshots" ]; then
      # Extract screenshots to a temporary location
      local tmp_dir
      tmp_dir=$(mktemp -d)
      local extracted=false

      # Prefer unit-slug-matching path
      while IFS= read -r git_path; do
        case "$git_path" in
          *.png|*.jpg|*.jpeg)
            local dir_part
            dir_part=$(dirname "$git_path")
            mkdir -p "$tmp_dir/$(basename "$dir_part")"
            git show "$prev_branch:$git_path" > "$tmp_dir/$(basename "$dir_part")/$(basename "$git_path")" 2>/dev/null && extracted=true
            ;;
        esac
      done <<< "$git_screenshots"

      if [ "$extracted" = "true" ]; then
        # Find the best matching subdirectory
        if [ -d "$tmp_dir/$unit_slug" ]; then
          _RESOLVED_TYPE="iteration"
          _RESOLVED_FIDELITY="medium"
          _RESOLVED_SOURCE="$tmp_dir/$unit_slug"
          _RESOLVED_FORMAT="directory"
          return 0
        fi
        # Fall back to first available directory
        for d in "$tmp_dir"/*/; do
          [ -d "$d" ] || continue
          _RESOLVED_TYPE="iteration"
          _RESOLVED_FIDELITY="medium"
          _RESOLVED_SOURCE="${d%/}"
          _RESOLVED_FORMAT="directory"
          return 0
        done
      fi

      rm -rf "$tmp_dir"
    fi
  fi

  return 1
}

# Resolve wireframe HTML (Level 3 — lowest priority)
# Returns 0 if resolved, 1 if not found/applicable
_resolve_wireframe() {
  local unit_file="$1"
  local repo_root="$2"

  local wireframe
  wireframe=$(dlc_frontmatter_get "wireframe" "$unit_file")

  [ -z "$wireframe" ] && return 1

  # Resolve relative paths against repo root
  local resolved_path="$wireframe"
  if [[ "$wireframe" != /* ]]; then
    resolved_path="$repo_root/$wireframe"
  fi

  if [ ! -f "$resolved_path" ]; then
    echo "ai-dlc: resolve-design-ref: wireframe file not found: $resolved_path" >&2
    return 1
  fi

  _RESOLVED_TYPE="wireframe"
  _RESOLVED_FIDELITY="low"
  _RESOLVED_SOURCE="$resolved_path"
  _RESOLVED_FORMAT="html"
  return 0
}

# ============================================================================
# Reference Screenshot Generation
# ============================================================================

# Generate reference screenshots from the resolved source.
# Uses unit-01's capture infrastructure with ref- prefix.
#
# Usage: dlc_generate_ref_screenshots <source_path> <source_format> <output_dir>
# Returns: 0 on success, 1 on failure
dlc_generate_ref_screenshots() {
  local source_path="$1"
  local source_format="$2"
  local output_dir="$3"

  mkdir -p "$output_dir"

  local capture_script="$RESOLVE_SCRIPT_DIR/capture-screenshots.sh"

  case "$source_format" in
    png|jpg|jpeg|webp|directory)
      # Use manual provider to copy images with ref- prefix
      local input_dir="$source_path"
      if [ -f "$source_path" ]; then
        # Single file: create temp dir with the file
        input_dir=$(mktemp -d)
        cp "$source_path" "$input_dir/"
      fi
      bash "$capture_script" \
        --provider manual \
        --output-dir "$output_dir" \
        --prefix "ref-" \
        --input-dir "$input_dir"
      local rc=$?
      # Clean up temp dir if we created one
      if [ -f "$source_path" ] && [ -d "$input_dir" ]; then
        rm -rf "$input_dir"
      fi
      return $rc
      ;;
    html)
      # Use Playwright provider in --static mode with ref- prefix
      bash "$capture_script" \
        --provider playwright \
        --output-dir "$output_dir" \
        --prefix "ref-" \
        --static "$source_path"
      return $?
      ;;
    *)
      echo "ai-dlc: resolve-design-ref: unsupported format for screenshot generation: $source_format" >&2
      return 1
      ;;
  esac
}

# ============================================================================
# Main Resolver
# ============================================================================

# Resolve design reference for a unit.
# Implements 3-level priority hierarchy, generates reference screenshots,
# and outputs JSON metadata to stdout.
#
# Usage: dlc_resolve_design_ref --intent-slug <slug> --unit-slug <slug> --intent-dir <path>
# Output: JSON to stdout
# Exit: 0 on success, 1 on failure
dlc_resolve_design_ref() {
  local intent_slug=""
  local unit_slug=""
  local intent_dir=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --intent-slug) intent_slug="$2"; shift 2 ;;
      --unit-slug)   unit_slug="$2"; shift 2 ;;
      --intent-dir)  intent_dir="$2"; shift 2 ;;
      --help)
        echo "Usage: resolve-design-ref.sh [options]"
        echo ""
        echo "Options:"
        echo "  --intent-slug <slug>  Intent slug (required)"
        echo "  --unit-slug <slug>    Unit slug (required)"
        echo "  --intent-dir <path>   Path to intent directory (required)"
        echo ""
        echo "Resolution priority (first match wins):"
        echo "  1. design_ref: field in unit frontmatter (fidelity: high)"
        echo "  2. iterates_on: previous iteration screenshots (fidelity: medium)"
        echo "  3. wireframe: field in unit frontmatter (fidelity: low)"
        return 0
        ;;
      *)
        echo "ai-dlc: resolve-design-ref: unknown argument: $1" >&2
        return 1
        ;;
    esac
  done

  # Validate required arguments
  if [ -z "$intent_slug" ]; then
    echo "ai-dlc: resolve-design-ref: --intent-slug is required" >&2
    return 1
  fi
  if [ -z "$unit_slug" ]; then
    echo "ai-dlc: resolve-design-ref: --unit-slug is required" >&2
    return 1
  fi
  if [ -z "$intent_dir" ]; then
    echo "ai-dlc: resolve-design-ref: --intent-dir is required" >&2
    return 1
  fi

  # Derive paths
  local repo_root
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
  if [ -z "$repo_root" ]; then
    echo "ai-dlc: resolve-design-ref: not inside a git repository" >&2
    return 1
  fi

  local intent_file="$intent_dir/intent.md"
  local unit_file="$intent_dir/$unit_slug.md"

  if [ ! -f "$unit_file" ]; then
    echo "ai-dlc: resolve-design-ref: unit file not found: $unit_file" >&2
    return 1
  fi

  # Initialize resolution state
  _RESOLVED_TYPE=""
  _RESOLVED_FIDELITY=""
  _RESOLVED_SOURCE=""
  _RESOLVED_FORMAT=""

  # 3-level priority resolution
  if ! _resolve_design_ref_field "$unit_file" "$repo_root"; then
    if ! _resolve_iteration_screenshots "$intent_file" "$unit_slug" "$repo_root"; then
      if ! _resolve_wireframe "$unit_file" "$repo_root"; then
        echo "ai-dlc: resolve-design-ref: no design reference found for unit '$unit_slug'." >&2
        echo "ai-dlc: Add a \`design_ref:\` field to unit frontmatter, ensure \`iterates_on\` has prior screenshots, or generate wireframes during elaboration." >&2
        return 1
      fi
    fi
  fi

  # Discover views
  local views
  views=$(dlc_discover_views "$unit_file" "$_RESOLVED_SOURCE")

  # Generate reference screenshots
  local output_dir="$repo_root/.ai-dlc/$intent_slug/screenshots/$unit_slug"
  dlc_generate_ref_screenshots "$_RESOLVED_SOURCE" "$_RESOLVED_FORMAT" "$output_dir" >&2

  # Output JSON metadata
  jq -n \
    --arg type "$_RESOLVED_TYPE" \
    --arg fidelity "$_RESOLVED_FIDELITY" \
    --arg source_path "$_RESOLVED_SOURCE" \
    --arg source_format "$_RESOLVED_FORMAT" \
    --argjson views "$views" \
    '{type: $type, fidelity: $fidelity, source_path: $source_path, source_format: $source_format, views: $views}'
}

# ============================================================================
# CLI Entry Point
# ============================================================================

# When invoked directly (not sourced), run the resolver
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  dlc_check_deps
  dlc_resolve_design_ref "$@"
  exit $?
fi
