#!/bin/bash
# run-visual-comparison.sh — Visual fidelity comparison orchestrator for AI-DLC
#
# Ties together gate detection, reference resolution, screenshot capture,
# and prepares comparison context for the reviewer agent's vision analysis.
#
# Key insight: Bash cannot call Claude vision. This script prepares screenshots
# and context. The reviewer agent performs the actual AI vision comparison by
# reading the images with the Read tool.
#
# Usage (CLI):
#   run-visual-comparison.sh --intent-slug <slug> --unit-slug <slug> --intent-dir <path> \
#     [--base-url <url>] [--output-dir <path>] [--dry-run]
#
# Usage (sourced):
#   source run-visual-comparison.sh
#   dlc_run_visual_comparison --intent-slug <slug> --unit-slug <slug> --intent-dir <path>

# Guard against double-sourcing
if [ -n "${_DLC_RUN_VISUAL_COMPARISON_SOURCED:-}" ]; then
  return 0 2>/dev/null || true
fi
_DLC_RUN_VISUAL_COMPARISON_SOURCED=1

VISUAL_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=deps.sh
source "$VISUAL_SCRIPT_DIR/deps.sh"
# shellcheck source=parse.sh
source "$VISUAL_SCRIPT_DIR/parse.sh"
# shellcheck source=detect-visual-gate.sh
source "$VISUAL_SCRIPT_DIR/detect-visual-gate.sh"
# shellcheck source=resolve-design-ref.sh
source "$VISUAL_SCRIPT_DIR/resolve-design-ref.sh"

# ============================================================================
# Screenshot Pairing
# ============================================================================

# Build screenshot pairs from ref and built manifests.
# Matches screenshots by breakpoint and view name.
#
# Usage: _build_screenshot_pairs <output_dir>
# Output: JSON array of pairs to stdout
_build_screenshot_pairs() {
  local output_dir="$1"

  local ref_manifest="$output_dir/ref-manifest.json"
  local built_manifest="$output_dir/manifest.json"

  # Collect ref screenshots (files with ref- prefix)
  local ref_files="[]"
  for f in "$output_dir"/ref-*.png "$output_dir"/ref-*.jpg; do
    [ -f "$f" ] || continue
    ref_files=$(echo "$ref_files" | jq --arg f "$(basename "$f")" '. + [$f]')
  done

  # Collect built screenshots (non-ref files)
  local built_files="[]"
  for f in "$output_dir"/*.png "$output_dir"/*.jpg; do
    [ -f "$f" ] || continue
    local basename_f
    basename_f=$(basename "$f")
    # Skip ref- prefixed files and manifests
    case "$basename_f" in
      ref-*) continue ;;
    esac
    built_files=$(echo "$built_files" | jq --arg f "$basename_f" '. + [$f]')
  done

  # If we have manifests, use them for precise pairing
  if [ -f "$ref_manifest" ] && [ -f "$built_manifest" ]; then
    _pair_from_manifests "$ref_manifest" "$built_manifest" "$output_dir"
    return $?
  fi

  # Fallback: pair by stripping ref- prefix and matching filenames
  _pair_by_filename "$output_dir" "$ref_files" "$built_files"
}

# Pair screenshots using manifest metadata
_pair_from_manifests() {
  local ref_manifest="$1"
  local built_manifest="$2"
  local output_dir="$3"

  local pairs="[]"

  # For each built screenshot, find matching ref screenshot
  local built_count
  built_count=$(jq '.screenshots | length' "$built_manifest")

  local i=0
  while [ "$i" -lt "$built_count" ]; do
    local breakpoint view built_path
    breakpoint=$(jq -r ".screenshots[$i].breakpoint" "$built_manifest")
    view=$(jq -r ".screenshots[$i].view" "$built_manifest")
    built_path=$(jq -r ".screenshots[$i].path" "$built_manifest")

    # Find matching ref screenshot (same breakpoint + view)
    local ref_path
    ref_path=$(jq -r --arg bp "$breakpoint" --arg v "$view" \
      '.screenshots[] | select(.breakpoint == ($bp | tonumber) and .view == $v) | .path' \
      "$ref_manifest" 2>/dev/null || echo "")

    if [ -n "$ref_path" ] && [ -f "$output_dir/$ref_path" ]; then
      pairs=$(echo "$pairs" | jq \
        --arg bp "$breakpoint" \
        --arg view "$view" \
        --arg ref "$output_dir/$ref_path" \
        --arg built "$output_dir/$built_path" \
        '. + [{"breakpoint": ($bp | tonumber), "view": $view, "ref_path": $ref, "built_path": $built}]')
    fi

    i=$((i + 1))
  done

  echo "$pairs"
}

# Pair screenshots by filename matching (strip ref- prefix)
_pair_by_filename() {
  local output_dir="$1"
  local ref_files="$2"
  local built_files="$3"

  local pairs="[]"

  local ref_count
  ref_count=$(echo "$ref_files" | jq 'length')

  local i=0
  while [ "$i" -lt "$ref_count" ]; do
    local ref_name
    ref_name=$(echo "$ref_files" | jq -r ".[$i]")

    # Strip ref- prefix to get the expected built filename
    local expected_built="${ref_name#ref-}"

    if [ -f "$output_dir/$expected_built" ]; then
      # Try to extract breakpoint from filename (e.g., mobile-home.png -> 375)
      local bp_name="${expected_built%%-*}"
      local breakpoint=0
      case "$bp_name" in
        mobile)  breakpoint=375 ;;
        tablet)  breakpoint=768 ;;
        desktop) breakpoint=1280 ;;
      esac

      # Extract view from filename (e.g., mobile-home.png -> home)
      local view
      view=$(echo "$expected_built" | sed -E 's/^[^-]+-//' | sed 's/\.[^.]*$//')

      pairs=$(echo "$pairs" | jq \
        --argjson bp "$breakpoint" \
        --arg view "$view" \
        --arg ref "$output_dir/$ref_name" \
        --arg built "$output_dir/$expected_built" \
        '. + [{"breakpoint": $bp, "view": $view, "ref_path": $ref, "built_path": $built}]')
    fi

    i=$((i + 1))
  done

  echo "$pairs"
}

# ============================================================================
# Report Generation
# ============================================================================

# Write the comparison context JSON for the reviewer agent.
#
# Usage: _write_comparison_context <output_dir> <fidelity> <ref_type> <pairs_json> <prompt_path>
_write_comparison_context() {
  local output_dir="$1"
  local fidelity="$2"
  local ref_type="$3"
  local pairs_json="$4"
  local prompt_path="$5"

  local pair_count
  pair_count=$(echo "$pairs_json" | jq 'length')

  jq -n \
    --arg fidelity "$fidelity" \
    --arg ref_type "$ref_type" \
    --arg prompt_path "$prompt_path" \
    --arg output_dir "$output_dir" \
    --argjson pairs "$pairs_json" \
    --argjson pair_count "$pair_count" \
    '{
      fidelity: $fidelity,
      reference_type: $ref_type,
      prompt_template: $prompt_path,
      output_dir: $output_dir,
      pair_count: $pair_count,
      screenshot_pairs: $pairs
    }' > "$output_dir/comparison-context.json"
}

# Write a stub comparison report for when vision comparison is pending.
# The reviewer agent will update this after running vision analysis.
#
# Usage: _write_pending_report <output_dir> <unit_slug> <fidelity> <ref_type> <pair_count>
_write_pending_report() {
  local output_dir="$1"
  local unit_slug="$2"
  local fidelity="$3"
  local ref_type="$4"
  local pair_count="$5"

  cat > "$output_dir/comparison-report.md" << REPORT
---
verdict: pending
fidelity: $fidelity
reference_type: $ref_type
breakpoints_compared: $pair_count
findings_count: 0
high_severity: 0
medium_severity: 0
low_severity: 0
---

# Visual Fidelity Report: $unit_slug

## Summary

Verdict: **PENDING** (awaiting reviewer agent vision analysis)
Reference: $ref_type ($fidelity fidelity)
Comparison context prepared. The reviewer agent will perform vision analysis
using the screenshot pairs listed in comparison-context.json.

## Instructions for Reviewer Agent

1. Read \`comparison-context.json\` in this directory for screenshot pairs
2. For each pair, read both images using the Read tool
3. Apply the vision comparison prompt (path in context JSON) with fidelity level: $fidelity
4. Update this report with actual findings and verdict
REPORT
}

# ============================================================================
# Main Orchestrator
# ============================================================================

# Run the full visual comparison pipeline.
#
# Usage: dlc_run_visual_comparison [options]
# Output: comparison-context.json and comparison-report.md
# Exit: 0 if gate inactive or PASS, 1 if FAIL or infrastructure error
dlc_run_visual_comparison() {
  local intent_slug=""
  local unit_slug=""
  local intent_dir=""
  local base_url=""
  local output_dir=""
  local dry_run=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --intent-slug) intent_slug="$2"; shift 2 ;;
      --unit-slug)   unit_slug="$2"; shift 2 ;;
      --intent-dir)  intent_dir="$2"; shift 2 ;;
      --base-url)    base_url="$2"; shift 2 ;;
      --output-dir)  output_dir="$2"; shift 2 ;;
      --dry-run)     dry_run=true; shift ;;
      --help)
        echo "Usage: run-visual-comparison.sh [options]"
        echo ""
        echo "Options:"
        echo "  --intent-slug <slug>  Intent slug (required)"
        echo "  --unit-slug <slug>    Unit slug (required)"
        echo "  --intent-dir <path>   Path to intent directory (required)"
        echo "  --base-url <url>      Base URL for built output capture"
        echo "  --output-dir <path>   Output directory (default: .ai-dlc/{intent}/screenshots/{unit})"
        echo "  --dry-run             Prepare screenshots but skip vision comparison setup"
        echo ""
        echo "Exit codes:"
        echo "  0  Gate inactive, or comparison context prepared successfully"
        echo "  1  Infrastructure failure (capture, reference resolution)"
        return 0
        ;;
      *)
        echo "ai-dlc: run-visual-comparison: unknown argument: $1" >&2
        return 1
        ;;
    esac
  done

  # Validate required arguments
  if [ -z "$intent_slug" ]; then
    echo "ai-dlc: run-visual-comparison: --intent-slug is required" >&2
    return 1
  fi
  if [ -z "$unit_slug" ]; then
    echo "ai-dlc: run-visual-comparison: --unit-slug is required" >&2
    return 1
  fi
  if [ -z "$intent_dir" ]; then
    echo "ai-dlc: run-visual-comparison: --intent-dir is required" >&2
    return 1
  fi

  # Derive paths
  local repo_root
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
  if [ -z "$repo_root" ]; then
    echo "ai-dlc: run-visual-comparison: not inside a git repository" >&2
    return 1
  fi

  local unit_file="$intent_dir/$unit_slug.md"
  if [ -z "$output_dir" ]; then
    output_dir="$repo_root/.ai-dlc/$intent_slug/screenshots/$unit_slug"
  fi

  mkdir -p "$output_dir"

  # ── Step 1: Gate Detection ──────────────────────────────────────────────
  echo "ai-dlc: visual-comparison: checking visual gate..." >&2

  # Get changed files for the current branch
  local changed_files=""
  local default_branch
  default_branch=$(git -C "$repo_root" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | xargs basename 2>/dev/null || echo "main")
  changed_files=$(git diff --name-only "$default_branch"...HEAD 2>/dev/null | tr '\n' ',' || echo "")

  local gate_result
  gate_result=$(dlc_detect_visual_gate --unit-file "$unit_file" --changed-files "$changed_files")

  if [ "$gate_result" = "VISUAL_GATE=false" ]; then
    echo "ai-dlc: visual-comparison: visual gate inactive — skipping" >&2
    echo "VISUAL_GATE=false"
    return 0
  fi

  echo "ai-dlc: visual-comparison: visual gate active" >&2

  # ── Step 2: Reference Resolution ────────────────────────────────────────
  echo "ai-dlc: visual-comparison: resolving design reference..." >&2

  local ref_json
  ref_json=$(dlc_resolve_design_ref \
    --intent-slug "$intent_slug" \
    --unit-slug "$unit_slug" \
    --intent-dir "$intent_dir")
  local ref_rc=$?

  if [ $ref_rc -ne 0 ]; then
    echo "ai-dlc: visual-comparison: reference resolution failed" >&2
    echo "$ref_json" >&2

    # Write failure context
    jq -n \
      --arg error "reference_resolution_failed" \
      --arg details "$ref_json" \
      '{error: $error, details: $details}' > "$output_dir/comparison-context.json"

    return 1
  fi

  local fidelity ref_type
  fidelity=$(echo "$ref_json" | jq -r '.fidelity')
  ref_type=$(echo "$ref_json" | jq -r '.type')

  echo "ai-dlc: visual-comparison: reference resolved — type=$ref_type, fidelity=$fidelity" >&2

  # Reference screenshots are already generated by resolve-design-ref.sh
  # Verify they exist
  local ref_count=0
  for f in "$output_dir"/ref-*.png "$output_dir"/ref-*.jpg; do
    [ -f "$f" ] && ref_count=$((ref_count + 1))
  done

  if [ "$ref_count" -eq 0 ]; then
    echo "ai-dlc: visual-comparison: no reference screenshots found in $output_dir" >&2
    jq -n \
      --arg error "no_reference_screenshots" \
      --arg output_dir "$output_dir" \
      '{error: $error, details: "resolve-design-ref produced no ref-*.png files", output_dir: $output_dir}' \
      > "$output_dir/comparison-context.json"
    return 1
  fi

  echo "ai-dlc: visual-comparison: found $ref_count reference screenshot(s)" >&2

  # ── Step 3: Capture Built Output ────────────────────────────────────────
  if [ -n "$base_url" ]; then
    echo "ai-dlc: visual-comparison: capturing built output from $base_url..." >&2

    local capture_script="$VISUAL_SCRIPT_DIR/capture-screenshots.sh"
    if ! bash "$capture_script" \
      --provider playwright \
      --output-dir "$output_dir" \
      --url "$base_url" 2>&1; then

      echo "ai-dlc: visual-comparison: built output capture failed" >&2
      jq -n \
        --arg error "capture_failed" \
        --arg base_url "$base_url" \
        '{error: $error, details: "Failed to capture built output screenshots", base_url: $base_url}' \
        > "$output_dir/comparison-context.json"
      return 1
    fi

    echo "ai-dlc: visual-comparison: built output captured" >&2
  else
    echo "ai-dlc: visual-comparison: no --base-url provided, expecting built screenshots already in $output_dir" >&2
  fi

  # ── Step 4: Build Screenshot Pairs ──────────────────────────────────────
  echo "ai-dlc: visual-comparison: building screenshot pairs..." >&2

  local pairs
  pairs=$(_build_screenshot_pairs "$output_dir")

  local pair_count
  pair_count=$(echo "$pairs" | jq 'length')

  if [ "$pair_count" -eq 0 ]; then
    # No built screenshots to compare — this may be normal if base-url wasn't provided
    # and built screenshots haven't been captured yet
    echo "ai-dlc: visual-comparison: no screenshot pairs found" >&2
    echo "ai-dlc: visual-comparison: reference screenshots are ready; built screenshots needed for comparison" >&2

    # Still write context so the reviewer knows what to do
    local prompt_path="$VISUAL_SCRIPT_DIR/vision-comparison-prompt.md"
    _write_comparison_context "$output_dir" "$fidelity" "$ref_type" "$pairs" "$prompt_path"
    _write_pending_report "$output_dir" "$unit_slug" "$fidelity" "$ref_type" "0"

    echo "VISUAL_GATE=true"
    return 0
  fi

  echo "ai-dlc: visual-comparison: found $pair_count screenshot pair(s)" >&2

  # ── Step 5: Prepare Comparison Context ──────────────────────────────────
  local prompt_path="$VISUAL_SCRIPT_DIR/vision-comparison-prompt.md"

  _write_comparison_context "$output_dir" "$fidelity" "$ref_type" "$pairs" "$prompt_path"
  _write_pending_report "$output_dir" "$unit_slug" "$fidelity" "$ref_type" "$pair_count"

  if [ "$dry_run" = "true" ]; then
    echo "ai-dlc: visual-comparison: dry run — screenshots captured, skipping vision setup" >&2
    echo "VISUAL_GATE=true"
    return 0
  fi

  echo "ai-dlc: visual-comparison: comparison context prepared at $output_dir/comparison-context.json" >&2
  echo "ai-dlc: visual-comparison: reviewer agent will perform vision analysis" >&2
  echo "VISUAL_GATE=true"
  return 0
}

# ============================================================================
# CLI Entry Point
# ============================================================================

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  dlc_check_deps
  dlc_run_visual_comparison "$@"
  exit $?
fi
