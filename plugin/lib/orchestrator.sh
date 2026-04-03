#!/bin/bash
# orchestrator.sh — Stage loop orchestration for H·AI·K·U
#
# Core stage loop logic. Each stage runs: plan → build → adversarial → persist → gate.
# Shell functions prepare data and context; SKILL.md files define agent behavior.
#
# Usage:
#   source orchestrator.sh
#   hku_run_stage "$intent_dir" "inception" "software"

# Guard against double-sourcing
if [ -n "${_HKU_ORCHESTRATOR_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_HKU_ORCHESTRATOR_SOURCED=1

ORCHESTRATOR_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=deps.sh
source "$ORCHESTRATOR_SCRIPT_DIR/deps.sh"
# shellcheck source=parse.sh
source "$ORCHESTRATOR_SCRIPT_DIR/parse.sh"
# shellcheck source=state.sh
source "$ORCHESTRATOR_SCRIPT_DIR/state.sh"
# shellcheck source=studio.sh
source "$ORCHESTRATOR_SCRIPT_DIR/studio.sh"
# shellcheck source=stage.sh
source "$ORCHESTRATOR_SCRIPT_DIR/stage.sh"
# shellcheck source=persistence.sh
source "$ORCHESTRATOR_SCRIPT_DIR/persistence.sh"

# Run the full stage loop for a single stage
# Usage: hku_run_stage <intent_dir> <stage_name> <studio_name> [autopilot]
hku_run_stage() {
  local intent_dir="$1"
  local stage_name="$2"
  local studio_name="$3"
  local autopilot="${4:-false}"

  # 1. Plan phase
  hku_run_plan_phase "$intent_dir" "$stage_name" "$studio_name" || return $?

  # 2. Build phase
  hku_run_build_phase "$intent_dir" "$stage_name" || return $?

  # 3. Adversarial review phase
  hku_run_adversarial_phase "$intent_dir" "$stage_name" || return $?

  # 4. Output persistence
  hku_persist_stage_outputs "$intent_dir" "$stage_name" "$studio_name" || return $?

  # 5. Review gate
  hku_resolve_review_gate "$intent_dir" "$stage_name" "$studio_name" "$autopilot"
  return $?
}

# Run ONLY the plan phase — decompose into units
# Loads stage metadata and resolved inputs, emits structured context.
# Usage: hku_run_plan_phase <intent_dir> <stage_name> [studio_name]
hku_run_plan_phase() {
  local intent_dir="$1"
  local stage_name="$2"
  local studio_name="${3:-}"

  # Auto-detect studio if not provided
  if [ -z "$studio_name" ]; then
    studio_name=$(hku_get_active_studio "${intent_dir}/intent.md")
  fi

  # Load stage metadata
  local metadata
  metadata=$(hku_load_stage_metadata "$stage_name" "$studio_name") || {
    echo "haiku: orchestrator: failed to load stage metadata for '$stage_name'" >&2
    return 1
  }

  # Resolve qualified inputs
  local inputs
  inputs=$(hku_resolve_stage_inputs "$stage_name" "$studio_name" "$intent_dir")

  # Load output definitions
  local outputs
  outputs=$(hku_load_stage_outputs "$stage_name" "$studio_name")

  # Check if units already exist for this stage (resume case)
  local stage_units_dir="${intent_dir}/stages/${stage_name}/units"
  if [ -d "$stage_units_dir" ] && ls "$stage_units_dir"/unit-*.md >/dev/null 2>&1; then
    echo "haiku: orchestrator: stage '$stage_name' has existing units, resuming" >&2
    return 0
  fi

  # Ensure stage directory structure exists
  mkdir -p "$stage_units_dir" 2>/dev/null

  # Emit structured context for the elaborate sub-skills
  # The SKILL.md instructions interpret this context to drive decomposition
  cat <<EOF
---
stage: ${stage_name}
studio: ${studio_name}
intent_dir: ${intent_dir}
---

## Stage Metadata

${metadata}

## Resolved Inputs

${inputs}

## Output Definitions

${outputs}

## Criteria Guidance

$(hku_get_stage_criteria_guidance "$stage_name" "$studio_name")
EOF

  return 0
}

# Run the build phase — execute bolt loop per unit
# Usage: hku_run_build_phase <intent_dir> <stage_name>
hku_run_build_phase() {
  local intent_dir="$1"
  local stage_name="$2"

  local units
  units=$(hku_stage_units "$intent_dir" "$stage_name")

  if [ -z "$units" ]; then
    echo "haiku: orchestrator: no units found for stage '$stage_name'" >&2
    return 1
  fi

  # Emit unit list for the SKILL.md build loop to consume
  echo "$units"
  return 0
}

# Run adversarial review on all stage units
# Usage: hku_run_adversarial_phase <intent_dir> <stage_name>
hku_run_adversarial_phase() {
  local intent_dir="$1"
  local stage_name="$2"

  local units
  units=$(hku_stage_units "$intent_dir" "$stage_name")

  if [ -z "$units" ]; then
    return 0
  fi

  # Verify all units have completion criteria marked
  local incomplete=0
  while IFS= read -r unit_file; do
    [ -f "$unit_file" ] || continue
    if grep -q '\- \[ \]' "$unit_file" 2>/dev/null; then
      incomplete=$((incomplete + 1))
      echo "haiku: orchestrator: unit has unchecked criteria: $(basename "$unit_file")" >&2
    fi
  done <<< "$units"

  if [ "$incomplete" -gt 0 ]; then
    echo "haiku: orchestrator: $incomplete unit(s) have incomplete criteria" >&2
    return 1
  fi

  return 0
}

# Persist stage outputs to scope-based locations
# Usage: hku_persist_stage_outputs <intent_dir> <stage_name> <studio_name>
hku_persist_stage_outputs() {
  local intent_dir="$1"
  local stage_name="$2"
  local studio_name="$3"

  local outputs
  outputs=$(hku_load_stage_outputs "$stage_name" "$studio_name")

  if [ "$outputs" = "[]" ] || [ -z "$outputs" ]; then
    return 0
  fi

  local repo_root
  repo_root=$(find_repo_root 2>/dev/null || echo "")
  local slug
  slug=$(basename "$intent_dir")

  while IFS= read -r entry; do
    local scope name
    scope=$(echo "$entry" | jq -r '.scope // "stage"')
    name=$(echo "$entry" | jq -r '.name // .file')

    case "$scope" in
      project)
        local target_dir="${repo_root}/.haiku/knowledge"
        mkdir -p "$target_dir" 2>/dev/null
        ;;
      intent)
        local target_dir="${intent_dir}/knowledge"
        mkdir -p "$target_dir" 2>/dev/null
        ;;
      stage)
        local target_dir="${intent_dir}/stages/${stage_name}"
        mkdir -p "$target_dir" 2>/dev/null
        ;;
      repo)
        # Written during build phase — no-op
        continue
        ;;
      *)
        continue
        ;;
    esac
  done < <(echo "$outputs" | jq -c '.[]')

  # Save via persistence layer
  persistence_save "$slug" "haiku: persist stage outputs — ${stage_name}" \
    "${intent_dir}/stages/${stage_name}/" \
    "${intent_dir}/knowledge/" 2>/dev/null || true

  return 0
}

# Resolve the effective review gate mode
# Usage: hku_resolve_review_gate <intent_dir> <stage_name> <studio_name> [autopilot]
# Returns: 0 = advance (auto), 1 = pause (ask), 2 = block (external)
hku_resolve_review_gate() {
  local intent_dir="$1"
  local stage_name="$2"
  local studio_name="$3"
  local autopilot="${4:-false}"

  local metadata
  metadata=$(hku_load_stage_metadata "$stage_name" "$studio_name")

  local review
  review=$(echo "$metadata" | jq -r '.review // "auto"')

  # Handle array review values
  if echo "$metadata" | jq -e '.review | type == "array"' >/dev/null 2>&1; then
    if [ "$autopilot" = "true" ]; then
      # Autopilot: select most permissive non-external option, override ask→auto
      local has_auto has_ask
      has_auto=$(echo "$metadata" | jq '[.review[] | select(. == "auto")] | length')
      has_ask=$(echo "$metadata" | jq '[.review[] | select(. == "ask")] | length')
      if [ "$has_auto" -gt 0 ] || [ "$has_ask" -gt 0 ]; then
        review="auto"
      else
        review="external"
      fi
    else
      # Normal mode: use first element
      review=$(echo "$metadata" | jq -r '.review[0] // "auto"')
    fi
  fi

  # Autopilot override: ask → auto
  if [ "$autopilot" = "true" ] && [ "$review" = "ask" ]; then
    review="auto"
  fi

  case "$review" in
    auto)
      return 0
      ;;
    ask)
      echo "haiku: stage '$stage_name' review gate: awaiting user approval" >&2
      return 1
      ;;
    external)
      echo "haiku: stage '$stage_name' review gate: external review required" >&2
      return 2
      ;;
    *)
      return 0
      ;;
  esac
}

# Get the next incomplete stage for an intent
# Usage: hku_next_stage <intent_dir>
# Returns: next stage name, or "" if all complete
hku_next_stage() {
  local intent_dir="$1"
  local intent_file="${intent_dir}/intent.md"

  local studio
  studio=$(hku_get_active_studio "$intent_file")

  local active_stage
  active_stage=$(hku_frontmatter_get "active_stage" "$intent_file")

  if [ -z "$active_stage" ]; then
    # No active stage — return first stage
    hku_load_studio_stages "$studio" | head -n1
    return 0
  fi

  local found_active=false
  while IFS= read -r stage; do
    if [ "$found_active" = "true" ]; then
      echo "$stage"
      return 0
    fi
    if [ "$stage" = "$active_stage" ]; then
      found_active=true
    fi
  done < <(hku_load_studio_stages "$studio")

  # All stages complete
  echo ""
}

# Get stage status
# Usage: hku_stage_status <intent_dir> <stage_name>
# Returns: pending | planning | building | reviewing | complete | blocked
hku_stage_status() {
  local intent_dir="$1"
  local stage_name="$2"
  local state_file="${intent_dir}/stages/${stage_name}/state.json"

  if [ ! -f "$state_file" ]; then
    echo "pending"
    return 0
  fi

  jq -r '.status // "pending"' "$state_file" 2>/dev/null || echo "pending"
}

# Advance to next stage
# Usage: hku_advance_stage <intent_dir>
# Returns: next stage name, or "" if all complete
hku_advance_stage() {
  local intent_dir="$1"
  local intent_file="${intent_dir}/intent.md"

  local next
  next=$(hku_next_stage "$intent_dir")

  if [ -n "$next" ]; then
    hku_frontmatter_set "active_stage" "$next" "$intent_file"
  fi

  echo "$next"
}

# Get units for a specific stage
# Usage: hku_stage_units <intent_dir> <stage_name>
# Returns: newline-separated unit file paths
hku_stage_units() {
  local intent_dir="$1"
  local stage_name="$2"
  local units_dir="${intent_dir}/stages/${stage_name}/units"

  if [ ! -d "$units_dir" ]; then
    return 0
  fi

  for f in "$units_dir"/unit-*.md; do
    [ -f "$f" ] && echo "$f"
  done
}

# Extract criteria guidance section from a STAGE.md
# Usage: hku_get_stage_criteria_guidance <stage_name> <studio_name>
hku_get_stage_criteria_guidance() {
  local stage_name="$1"
  local studio_name="$2"

  local stage_file
  stage_file=$(hku_resolve_stage "$stage_name" "$studio_name") || return 0

  # Extract text between "## Criteria Guidance" and the next "## " heading
  awk '/^## Criteria Guidance/{found=1; next} /^## /{if(found) exit} found{print}' "$stage_file"
}
