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
HAIKU_PARSE="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/..}/bin/haiku-parse.mjs"
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
    local scope name src_file target_dir
    scope=$(echo "$entry" | jq -r '.scope // "stage"')
    name=$(echo "$entry" | jq -r '.name // .file')

    # Resolve the output file written by the build phase
    src_file="${intent_dir}/stages/${stage_name}/outputs/${name}"
    [ -f "$src_file" ] || continue

    case "$scope" in
      project)
        target_dir="${repo_root}/.haiku/knowledge"
        mkdir -p "$target_dir" 2>/dev/null
        cp "$src_file" "${target_dir}/${name}" 2>/dev/null || true
        ;;
      intent)
        target_dir="${intent_dir}/knowledge"
        mkdir -p "$target_dir" 2>/dev/null
        cp "$src_file" "${target_dir}/${name}" 2>/dev/null || true
        ;;
      stage)
        # Stage-scoped outputs stay in place under stages/{stage}/outputs/
        ;;
      repo)
        # Written directly to repo during build phase — no-op
        ;;
      *)
        ;;
    esac
  done < <(echo "$outputs" | jq -c '.[]')

  # Save via persistence layer
  persistence_save "$slug" "haiku: persist stage outputs — ${stage_name}" \
    "${intent_dir}/stages/${stage_name}/" \
    "${intent_dir}/knowledge/" 2>/dev/null || true

  return 0
}

# Resolve the gate protocol (timeout, escalation) for a stage
# Usage: hku_get_gate_protocol <stage_name> <studio_name>
# Returns: JSON gate-protocol object or "{}" if none defined
hku_get_gate_protocol() {
  local stage_name="$1"
  local studio_name="$2"

  local metadata
  metadata=$(hku_load_stage_metadata "$stage_name" "$studio_name")
  echo "$metadata" | jq -c '.["gate-protocol"] // {}'
}

# Record when a gate was entered (for timeout tracking)
# Usage: hku_record_gate_entered <intent_dir> <stage_name>
hku_record_gate_entered() {
  local intent_dir="$1"
  local stage_name="$2"
  local timestamp
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  local gate_state
  gate_state=$(hku_state_load "$intent_dir" "gate-state.json" 2>/dev/null || echo '{}')
  gate_state=$(echo "$gate_state" | jq \
    --arg stage "$stage_name" \
    --arg time "$timestamp" \
    '.[$stage] = {"entered": $time, "resolved": null}')
  hku_state_save "$intent_dir" "gate-state.json" "$gate_state"
}

# Check if a gate has timed out
# Usage: hku_check_gate_timeout <intent_dir> <stage_name> <studio_name>
# Returns: "ok" | "timed_out"
# Side effect: if timed out, emits telemetry and returns the timeout-action
hku_check_gate_timeout() {
  local intent_dir="$1"
  local stage_name="$2"
  local studio_name="$3"

  local protocol
  protocol=$(hku_get_gate_protocol "$stage_name" "$studio_name")

  local timeout
  timeout=$(echo "$protocol" | jq -r '.timeout // empty')

  # No timeout configured
  if [ -z "$timeout" ]; then
    echo "ok"
    return 0
  fi

  # Parse timeout duration to seconds
  local timeout_seconds=0
  case "$timeout" in
    *h) timeout_seconds=$(( ${timeout%h} * 3600 )) ;;
    *d) timeout_seconds=$(( ${timeout%d} * 86400 )) ;;
    *m) timeout_seconds=$(( ${timeout%m} * 60 )) ;;
    *)  timeout_seconds="$timeout" ;;
  esac

  # Check when the gate was entered
  local gate_state
  gate_state=$(hku_state_load "$intent_dir" "gate-state.json" 2>/dev/null || echo '{}')
  local entered
  entered=$(echo "$gate_state" | jq -r ".[\"$stage_name\"].entered // empty")

  if [ -z "$entered" ]; then
    echo "ok"
    return 0
  fi

  # Compare timestamps
  local now_epoch entered_epoch elapsed
  now_epoch=$(date -u +%s)
  entered_epoch=$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$entered" +%s 2>/dev/null || date -u -d "$entered" +%s 2>/dev/null || echo 0)
  elapsed=$(( now_epoch - entered_epoch ))

  if [ "$elapsed" -gt "$timeout_seconds" ]; then
    local action
    action=$(echo "$protocol" | jq -r '.["timeout-action"] // "block"')

    # Emit telemetry
    source "${ORCHESTRATOR_SCRIPT_DIR}/telemetry.sh" 2>/dev/null || true
    if type haiku_record_gate_timeout >/dev/null 2>&1; then
      local slug
      slug=$(basename "$intent_dir")
      haiku_record_gate_timeout "$slug" "$stage_name" "$action"
    fi

    echo "$action"
    return 0
  fi

  echo "ok"
}

# Resolve the effective review gate mode
# Usage: hku_resolve_review_gate <intent_dir> <stage_name> <studio_name> [autopilot]
# Returns: 0 = advance (auto), 1 = pause (ask), 2 = block (external), 3 = await
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
    await)
      echo "haiku: stage '$stage_name' review gate: awaiting external event" >&2
      return 3
      ;;
    *)
      return 0
      ;;
  esac
}

# ============================================================================
# Composite Intent Orchestration
# ============================================================================

# Check if an intent is composite
# Usage: hku_is_composite <intent_dir>
# Returns: 0 if composite, 1 if not
hku_is_composite() {
  local intent_file="${1}/intent.md"
  local composite
  composite=$("$HAIKU_PARSE" get "$intent_file" "composite")
  [ -n "$composite" ] && [ "$composite" != "null" ]
}

# Get the next runnable stage for a composite intent
# Usage: hku_composite_next_stage <intent_dir>
# Returns: "studio:stage" or "" if all complete or all blocked
hku_composite_next_stage() {
  local intent_dir="$1"
  local intent_file="${intent_dir}/intent.md"

  # Read composite config and state
  local composite_json
  composite_json=$(yq --front-matter=extract -o json '.' "$intent_file" 2>/dev/null || echo "{}")

  local composite_state
  composite_state=$(echo "$composite_json" | jq -c '.composite_state // {}')

  # For each studio in the composite, check if its current stage is runnable
  echo "$composite_json" | jq -c '.composite[]' 2>/dev/null | while IFS= read -r entry; do
    local studio stage_list current_stage
    studio=$(echo "$entry" | jq -r '.studio')
    stage_list=$(echo "$entry" | jq -r '.stages[]')
    current_stage=$(echo "$composite_state" | jq -r ".\"$studio\" // empty")

    # If no current stage, use the first stage
    if [ -z "$current_stage" ]; then
      current_stage=$(echo "$entry" | jq -r '.stages[0]')
    fi

    # Check if this studio is complete (current stage not in its list)
    local in_list=false
    for s in $stage_list; do
      if [ "$s" = "$current_stage" ]; then
        in_list=true
        break
      fi
    done
    [ "$in_list" = "false" ] && continue

    # Check sync points — is this stage blocked?
    local blocked=false
    echo "$composite_json" | jq -c '.sync[]?' 2>/dev/null | while IFS= read -r sync_rule; do
      local then_stages
      then_stages=$(echo "$sync_rule" | jq -r '.then[]')
      for ts in $then_stages; do
        if [ "$ts" = "${studio}:${current_stage}" ]; then
          # This stage has a sync dependency — check if all wait stages are done
          local wait_stages
          wait_stages=$(echo "$sync_rule" | jq -r '.wait[]')
          for ws in $wait_stages; do
            local ws_studio="${ws%%:*}"
            local ws_stage="${ws##*:}"
            local ws_current
            ws_current=$(echo "$composite_state" | jq -r ".\"$ws_studio\" // empty")

            # Check if ws_studio has advanced past ws_stage
            local ws_stages ws_stage_idx ws_current_idx
            ws_stages=$(echo "$composite_json" | jq -r ".composite[] | select(.studio == \"$ws_studio\") | .stages[]")
            ws_stage_idx=0; ws_current_idx=0; local idx=0
            for s in $ws_stages; do
              [ "$s" = "$ws_stage" ] && ws_stage_idx=$idx
              [ "$s" = "$ws_current" ] && ws_current_idx=$idx
              idx=$((idx + 1))
            done

            if [ "$ws_current_idx" -le "$ws_stage_idx" ]; then
              blocked=true
              break 2
            fi
          done
        fi
      done
    done

    if [ "$blocked" = "false" ]; then
      echo "${studio}:${current_stage}"
      return 0
    fi
  done

  echo ""
}

# Advance a composite intent's studio to its next stage
# Usage: hku_composite_advance <intent_dir> <studio_name>
hku_composite_advance() {
  local intent_dir="$1"
  local studio_name="$2"
  local intent_file="${intent_dir}/intent.md"

  local composite_json
  composite_json=$(yq --front-matter=extract -o json '.' "$intent_file" 2>/dev/null || echo "{}")

  # Get the studio's stage list
  local stages current_stage
  stages=$(echo "$composite_json" | jq -r ".composite[] | select(.studio == \"$studio_name\") | .stages[]")
  current_stage=$(echo "$composite_json" | jq -r ".composite_state.\"$studio_name\" // empty")

  # Find the next stage
  local found=false next_stage=""
  for s in $stages; do
    if [ "$found" = "true" ]; then
      next_stage="$s"
      break
    fi
    if [ "$s" = "$current_stage" ]; then
      found=true
    fi
  done

  # Update composite_state
  if [ -n "$next_stage" ]; then
    "$HAIKU_PARSE" set "$intent_file" "composite_state.${studio_name}" "$next_stage"
  else
    # Studio complete — set to a sentinel value
    "$HAIKU_PARSE" set "$intent_file" "composite_state.${studio_name}" "complete"
  fi

  echo "$next_stage"
}

# Check if all studios in a composite intent are complete
# Usage: hku_composite_all_complete <intent_dir>
# Returns: 0 if all complete, 1 if not
hku_composite_all_complete() {
  local intent_dir="$1"
  local intent_file="${intent_dir}/intent.md"

  local composite_json
  composite_json=$(yq --front-matter=extract -o json '.' "$intent_file" 2>/dev/null || echo "{}")

  echo "$composite_json" | jq -c '.composite[]' 2>/dev/null | while IFS= read -r entry; do
    local studio
    studio=$(echo "$entry" | jq -r '.studio')
    local state
    state=$(echo "$composite_json" | jq -r ".composite_state.\"$studio\" // empty")
    if [ "$state" != "complete" ]; then
      return 1
    fi
  done
}

# ============================================================================
# Single-Studio Stage Navigation
# ============================================================================

# Get the next incomplete stage for an intent
# Usage: hku_next_stage <intent_dir>
# Returns: next stage name, or "" if all complete
hku_next_stage() {
  local intent_dir="$1"
  local intent_file="${intent_dir}/intent.md"

  local studio
  studio=$(hku_get_active_studio "$intent_file")

  local active_stage
  active_stage=$("$HAIKU_PARSE" get "$intent_file" "active_stage")

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
    "$HAIKU_PARSE" set "$intent_file" "active_stage" "$next"
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
