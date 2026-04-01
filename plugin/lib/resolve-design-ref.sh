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
# shellcheck source=config.sh
source "$RESOLVE_SCRIPT_DIR/config.sh"

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
# Provider URI Utilities
# ============================================================================

# Parse a provider URI into provider type and resource path.
# Usage: _parse_provider_uri <uri>
# Output: Two lines — provider type, then resource path
# Returns: 0 on success, 1 if unrecognized scheme
_parse_provider_uri() {
  local uri="$1"
  local scheme="${uri%%://*}"
  local rest="${uri#*://}"

  case "$scheme" in
    canva|figma|openpencil|pencil|penpot|excalidraw) ;;
    *) return 1 ;;
  esac

  echo "$scheme"
  echo "$rest"
}

# Generate a cache-safe hash from a URI string and iteration number.
# Uses SHA-256 truncated to 8 hex characters. Including the iteration
# ensures that a new bolt invalidates stale provider exports.
# Usage: _uri_cache_hash <uri> [iteration]
# Output: 8-char hex hash
_uri_cache_hash() {
  local uri="$1"
  local iteration="${2:-0}"
  local input="${uri}:${iteration}"
  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$input" | shasum -a 256 | cut -c1-8
  elif command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$input" | sha256sum | cut -c1-8
  else
    printf '%s' "$input" | md5 | cut -c1-8
  fi
}

# Generate an instruction file for agent-based design export.
# Writes a YAML-frontmatter Markdown file that agents consume to perform
# MCP tool calls (which shell scripts cannot invoke directly).
#
# Usage: _generate_export_instructions <provider> <source> <output_path> <instructions_path> [timeout]
_generate_export_instructions() {
  local provider="$1"
  local source="$2"
  local output_path="$3"
  local instructions_path="$4"
  local timeout="${5:-30}"

  local mcp_hint
  mcp_hint=$(_provider_mcp_hint "$provider")

  local tool_name=""
  local parameters=""

  case "$provider" in
    canva)
      local design_id="${source#canva://}"
      design_id="${design_id#design/}"
      tool_name="mcp__claude_ai_Canva__export-design"
      parameters="design_id: \"$design_id\"
format: \"png\""
      ;;
    figma)
      local file_key="${source#figma://}"
      file_key="${file_key#file/}"
      tool_name="figma_mcp_export"
      parameters="file_key: \"$file_key\"
format: \"png\""
      ;;
    openpencil)
      local op_path="$source"
      [[ "$source" == openpencil://* ]] && op_path="${source#openpencil://}"
      tool_name="mcp__openpencil__export_nodes"
      parameters="path: \"$op_path\"
format: \"png\""
      ;;
    pencil)
      local pen_path="$source"
      [[ "$source" == pencil://* ]] && pen_path="${source#pencil://}"
      tool_name="mcp__pencil__export_nodes"
      parameters="path: \"$pen_path\"
format: \"png\""
      ;;
    penpot)
      local penpot_path="${source#penpot://}"
      tool_name="penpot_mcp_export"
      parameters="path: \"$penpot_path\"
format: \"png\""
      ;;
    excalidraw)
      local scene_path="$source"
      [[ "$source" == excalidraw://* ]] && scene_path="${source#excalidraw://}"
      tool_name="excalidraw_mcp_export"
      parameters="path: \"$scene_path\"
format: \"png\""
      ;;
  esac

  {
    printf -- '---\n'
    printf 'tool: "%s"\n' "$tool_name"
    printf 'mcp_hint: "%s"\n' "$mcp_hint"
    printf 'provider: "%s"\n' "$provider"
    printf 'source_uri: "%s"\n' "$source"
    printf 'output_path: "%s"\n' "$output_path"
    printf 'timeout: %s\n' "$timeout"
    printf -- '---\n\n'
    cat <<'EOF'
# Export Instructions

This file was generated by resolve-design-ref.sh because the design reference
requires provider tools to export to PNG.

## Action Required
EOF
    printf '\n1. Use `ToolSearch` to find: `%s`\n' "$mcp_hint"
    printf '2. Call `%s` with:\n' "$tool_name"
    echo "$parameters" | sed 's/^/   /'
    printf '3. Save the exported PNG to: `%s`\n' "$output_path"
  } > "$instructions_path"
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

  # Check for provider URI (e.g., figma://, canva://)
  if [[ "$design_ref" =~ ^[a-z]+:// ]]; then
    local _uri_provider
    _uri_provider=$(_parse_provider_uri "$design_ref" | head -1)

    if [ -z "$_uri_provider" ]; then
      echo "ai-dlc: resolve-design-ref: unrecognized provider URI scheme: $design_ref" >&2
      return 1
    fi

    _RESOLVED_TYPE="external"
    _RESOLVED_FIDELITY="high"
    _RESOLVED_SOURCE="$design_ref"
    _RESOLVED_FORMAT="provider-uri"
    _RESOLVED_PROVIDER="$_uri_provider"
    _RESOLVED_FROM="$design_ref"
    return 0
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
      op)   format="op" ;;
      pen)  format="pen" ;;
      excalidraw) format="excalidraw" ;;
      fig)  format="fig" ;;
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

  # Set provider for native design file formats
  case "$format" in
    op)         _RESOLVED_PROVIDER="openpencil"; _RESOLVED_FROM="$resolved_path" ;;
    pen)        _RESOLVED_PROVIDER="pencil"; _RESOLVED_FROM="$resolved_path" ;;
    excalidraw) _RESOLVED_PROVIDER="excalidraw"; _RESOLVED_FROM="$resolved_path" ;;
    fig)        _RESOLVED_PROVIDER="figma"; _RESOLVED_FROM="$resolved_path" ;;
  esac

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
          _RESOLVED_TMP_DIR="$tmp_dir"  # caller is responsible for cleanup
          return 0
        fi
        # Fall back to first available directory
        for d in "$tmp_dir"/*/; do
          [ -d "$d" ] || continue
          _RESOLVED_TYPE="iteration"
          _RESOLVED_FIDELITY="medium"
          _RESOLVED_SOURCE="${d%/}"
          _RESOLVED_FORMAT="directory"
          _RESOLVED_TMP_DIR="$tmp_dir"  # caller is responsible for cleanup
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
      [ $rc -ne 0 ] && return $rc
      # Rename manifest to ref-manifest so it doesn't collide with built-output manifest
      if [ -f "$output_dir/manifest.json" ]; then
        mv "$output_dir/manifest.json" "$output_dir/ref-manifest.json"
      fi
      return 0
      ;;
    html)
      # Use Playwright provider in --static mode with ref- prefix
      bash "$capture_script" \
        --provider playwright \
        --output-dir "$output_dir" \
        --prefix "ref-" \
        --static "$source_path"
      local rc=$?
      [ $rc -ne 0 ] && return $rc
      # Rename manifest to ref-manifest so it doesn't collide with built-output manifest
      if [ -f "$output_dir/manifest.json" ]; then
        mv "$output_dir/manifest.json" "$output_dir/ref-manifest.json"
      fi
      return 0
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
  _RESOLVED_TMP_DIR=""
  _RESOLVED_PROVIDER=""
  _RESOLVED_FROM=""
  _NEEDS_AGENT_EXPORT=false
  _EXPORT_INSTRUCTIONS=""

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

  # Handle provider URI and native format exports
  local output_dir="$repo_root/.ai-dlc/$intent_slug/screenshots/$unit_slug"
  if [ "$_RESOLVED_FORMAT" = "provider-uri" ] || [[ "$_RESOLVED_FORMAT" =~ ^(op|pen|excalidraw|fig)$ ]]; then
    mkdir -p "$output_dir"

    # Read current bolt iteration to invalidate cache across bolts
    local current_iteration="0"
    local iter_json
    iter_json=$(dlc_state_load "$intent_dir" "iteration.json" 2>/dev/null)
    if [ -n "$iter_json" ]; then
      current_iteration=$(echo "$iter_json" | jq -r '.iteration // 0' 2>/dev/null || echo "0")
    fi

    local cache_hash cached_path instructions_path
    cache_hash=$(_uri_cache_hash "$_RESOLVED_SOURCE" "$current_iteration")
    cached_path="$output_dir/ref-${cache_hash}.png"
    instructions_path="$output_dir/ref-${cache_hash}.instructions.md"

    # Check cache — reuse if exported PNG already exists
    if [ -f "$cached_path" ]; then
      _RESOLVED_SOURCE="$cached_path"
      _RESOLVED_FORMAT="png"
      _NEEDS_AGENT_EXPORT=false
    else
      local exported=false

      # Try CLI export for local native formats
      if [ "$_RESOLVED_FORMAT" != "provider-uri" ]; then
        case "$_RESOLVED_FORMAT" in
          op)
            if command -v op >/dev/null 2>&1; then
              op export --format png --input "$_RESOLVED_SOURCE" --output "$cached_path" 2>/dev/null && exported=true
            fi
            ;;
          pen)
            if command -v pencil >/dev/null 2>&1; then
              pencil --in "$_RESOLVED_SOURCE" --export png --out "$cached_path" 2>/dev/null && exported=true
            fi
            ;;
          excalidraw|fig)
            # Binary/JSON formats without standard CLI — requires agent export
            ;;
        esac
      fi

      if [ "$exported" = "true" ]; then
        _RESOLVED_SOURCE="$cached_path"
        _RESOLVED_FORMAT="png"
        _NEEDS_AGENT_EXPORT=false
      else
        # Generate instruction file for agent-based export
        _generate_export_instructions "$_RESOLVED_PROVIDER" "${_RESOLVED_FROM:-$_RESOLVED_SOURCE}" "$cached_path" "$instructions_path"
        _NEEDS_AGENT_EXPORT=true
        _EXPORT_INSTRUCTIONS="$instructions_path"
        echo "ai-dlc: resolve-design-ref: generated export instructions at $instructions_path" >&2
        echo "ai-dlc: resolve-design-ref: agent must execute export before visual comparison" >&2
      fi
    fi
  fi

  # Discover views
  local views
  views=$(dlc_discover_views "$unit_file" "$_RESOLVED_SOURCE")

  # Generate reference screenshots (skip for pending agent exports)
  if [ "$_NEEDS_AGENT_EXPORT" = "false" ]; then
    if ! dlc_generate_ref_screenshots "$_RESOLVED_SOURCE" "$_RESOLVED_FORMAT" "$output_dir" >&2; then
      echo "ai-dlc: resolve-design-ref: failed to generate reference screenshots from $_RESOLVED_SOURCE" >&2
      # Clean up any temp dir created by the git branch fallback
      if [ -n "$_RESOLVED_TMP_DIR" ]; then
        rm -rf "$_RESOLVED_TMP_DIR"
      fi
      return 1
    fi
  fi

  # Clean up temp dir created by git branch fallback (files have been copied out)
  if [ -n "$_RESOLVED_TMP_DIR" ]; then
    rm -rf "$_RESOLVED_TMP_DIR"
    _RESOLVED_TMP_DIR=""
  fi

  # Output JSON metadata
  jq -n \
    --arg type "$_RESOLVED_TYPE" \
    --arg fidelity "$_RESOLVED_FIDELITY" \
    --arg source_path "$_RESOLVED_SOURCE" \
    --arg source_format "$_RESOLVED_FORMAT" \
    --arg provider "${_RESOLVED_PROVIDER:-}" \
    --arg resolved_from "${_RESOLVED_FROM:-}" \
    --argjson needs_agent_export "$( [ "$_NEEDS_AGENT_EXPORT" = "true" ] && echo true || echo false )" \
    --arg export_instructions "${_EXPORT_INSTRUCTIONS:-}" \
    --argjson views "$views" \
    '{
      type: $type,
      fidelity: $fidelity,
      source_path: $source_path,
      source_format: $source_format,
      provider: (if $provider == "" then null else $provider end),
      resolved_from: (if $resolved_from == "" then null else $resolved_from end),
      needs_agent_export: $needs_agent_export,
      export_instructions: (if $export_instructions == "" then null else $export_instructions end),
      views: $views
    }'
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
