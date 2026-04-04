#!/bin/bash
# telemetry.sh - OTEL telemetry library for H·AI·K·U
#
# Sends structured log events to an OTLP/JSON endpoint via curl.
# Reports as service.name=haiku.
#
# Environment variables:
#   CLAUDE_CODE_ENABLE_TELEMETRY=1  - Master switch (must be "1" to enable)
#   OTEL_EXPORTER_OTLP_ENDPOINT    - Collector endpoint (default: http://localhost:4317)
#   OTEL_EXPORTER_OTLP_HEADERS     - Auth headers (format: key1=value1,key2=value2)
#   OTEL_RESOURCE_ATTRIBUTES        - Custom resource attributes (key1=value1,key2=value2)
#
# Usage:
#   source telemetry.sh
#   haiku_telemetry_init
#   haiku_log_event "haiku.intent.created" "intent_slug=my-feature" "strategy=unit"

# Guard against double-sourcing
if [ -n "${_HAIKU_TELEMETRY_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_HAIKU_TELEMETRY_SOURCED=1

# Internal state
_HAIKU_TELEMETRY_INIT=""
_HAIKU_TELEMETRY_ENABLED=""
_HAIKU_TELEMETRY_ENDPOINT=""
_HAIKU_TELEMETRY_VERSION=""
_HAIKU_TELEMETRY_CURL_HEADERS=""

# Initialize telemetry (call once per script)
# Reads env vars, detects plugin version, builds curl header flags.
# If CLAUDE_CODE_ENABLE_TELEMETRY != "1", all functions become no-ops.
haiku_telemetry_init() {
  _HAIKU_TELEMETRY_INIT=1

  # Master switch
  if [ "${CLAUDE_CODE_ENABLE_TELEMETRY:-}" != "1" ]; then
    _HAIKU_TELEMETRY_ENABLED=0
    return 0
  fi

  _HAIKU_TELEMETRY_ENABLED=1

  # Endpoint (default OTLP collector)
  _HAIKU_TELEMETRY_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-http://localhost:4317}"
  # Strip trailing slash
  _HAIKU_TELEMETRY_ENDPOINT="${_HAIKU_TELEMETRY_ENDPOINT%/}"

  # Read plugin version from plugin.json
  _HAIKU_TELEMETRY_VERSION=""
  local plugin_json=""
  if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json" ]; then
    plugin_json="${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json"
  else
    # Fallback: resolve relative to this script
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local candidate="${script_dir}/../.claude-plugin/plugin.json"
    if [ -f "$candidate" ]; then
      plugin_json="$candidate"
    fi
  fi

  if [ -n "$plugin_json" ]; then
    # Extract version with pure bash (avoid jq dependency)
    local line
    while IFS= read -r line; do
      if [[ "$line" == *'"version"'*':'*'"'* ]]; then
        # Extract value between quotes after the colon
        local _tmp="${line#*\"version\"}"
        _tmp="${_tmp#*:}"
        _tmp="${_tmp#*\"}"
        _HAIKU_TELEMETRY_VERSION="${_tmp%%\"*}"
        break
      fi
    done < "$plugin_json"
  fi
  : "${_HAIKU_TELEMETRY_VERSION:=unknown}"

  # Parse OTEL_EXPORTER_OTLP_HEADERS into curl -H flags
  _HAIKU_TELEMETRY_CURL_HEADERS=""
  if [ -n "${OTEL_EXPORTER_OTLP_HEADERS:-}" ]; then
    local IFS=','
    for pair in $OTEL_EXPORTER_OTLP_HEADERS; do
      local key="${pair%%=*}"
      local value="${pair#*=}"
      if [ -n "$key" ] && [ -n "$value" ]; then
        _HAIKU_TELEMETRY_CURL_HEADERS="${_HAIKU_TELEMETRY_CURL_HEADERS} -H ${key}:${value}"
      fi
    done
    unset IFS
  fi
}

# Get epoch time in nanoseconds (best effort)
# Falls back to seconds * 1e9 if no nanosecond source available
_haiku_epoch_nanos() {
  # Try GNU date with nanoseconds
  if date +%s%N 2>/dev/null | grep -qE '^[0-9]{19}'; then
    date +%s%N
    return
  fi
  # macOS / BSD fallback: seconds * 1_000_000_000
  local secs
  secs=$(date +%s)
  echo "${secs}000000000"
}

# Build OTLP resource attributes JSON array
_haiku_resource_attributes() {
  local attrs=""
  attrs="${attrs}{\"key\":\"service.name\",\"value\":{\"stringValue\":\"haiku\"}}"
  attrs="${attrs},{\"key\":\"service.version\",\"value\":{\"stringValue\":\"${_HAIKU_TELEMETRY_VERSION}\"}}"

  # Append OTEL_RESOURCE_ATTRIBUTES if set
  if [ -n "${OTEL_RESOURCE_ATTRIBUTES:-}" ]; then
    local IFS=','
    for pair in $OTEL_RESOURCE_ATTRIBUTES; do
      local key="${pair%%=*}"
      local value="${pair#*=}"
      if [ -n "$key" ] && [ -n "$value" ]; then
        attrs="${attrs},{\"key\":\"${key}\",\"value\":{\"stringValue\":\"${value}\"}}"
      fi
    done
    unset IFS
  fi

  echo "[${attrs}]"
}

# Core function: send a structured log event via OTLP/JSON
# Usage: haiku_log_event <event_name> [key=value ...]
# All calls are backgrounded and fail silently.
haiku_log_event() {
  # No-op if not initialized or not enabled
  if [ "${_HAIKU_TELEMETRY_ENABLED:-0}" != "1" ]; then
    return 0
  fi

  local event_name="${1:?haiku_log_event requires an event name}"
  shift

  local time_nanos
  time_nanos=$(_haiku_epoch_nanos)

  # Build log record attributes
  local log_attrs=""
  log_attrs="{\"key\":\"event.name\",\"value\":{\"stringValue\":\"${event_name}\"}}"

  for pair in "$@"; do
    local key="${pair%%=*}"
    local value="${pair#*=}"
    if [ -n "$key" ]; then
      # Escape double quotes in value
      value="${value//\\/\\\\}"
      value="${value//\"/\\\"}"
      log_attrs="${log_attrs},{\"key\":\"${key}\",\"value\":{\"stringValue\":\"${value}\"}}"
    fi
  done

  local resource_attrs
  resource_attrs=$(_haiku_resource_attributes)

  local payload
  payload=$(cat <<PAYLOAD_EOF
{"resourceLogs":[{"resource":{"attributes":${resource_attrs}},"scopeLogs":[{"scope":{"name":"haiku"},"logRecords":[{"timeUnixNano":"${time_nanos}","severityNumber":9,"severityText":"INFO","body":{"stringValue":"${event_name}"},"attributes":[${log_attrs}]}]}]}]}
PAYLOAD_EOF
)

  # Send via curl in the background, fail silently
  # shellcheck disable=SC2086
  (curl -s -S \
    --connect-timeout 2 \
    --max-time 5 \
    -X POST \
    -H "Content-Type: application/json" \
    ${_HAIKU_TELEMETRY_CURL_HEADERS} \
    -d "$payload" \
    "${_HAIKU_TELEMETRY_ENDPOINT}/v1/logs" \
    >/dev/null 2>&1 || true) &
}

# ============================================================================
# Convenience functions for common H·AI·K·U events
# ============================================================================

# Intent created
# Usage: haiku_record_intent_created <slug> <strategy>
haiku_record_intent_created() {
  local slug="${1:-}" strategy="${2:-}"
  haiku_log_event "haiku.intent.created" \
    "intent_slug=${slug}" \
    "strategy=${strategy}"
}

# Intent completed
# Usage: haiku_record_intent_completed <slug> <unit_count>
haiku_record_intent_completed() {
  local slug="${1:-}" unit_count="${2:-}"
  haiku_log_event "haiku.intent.completed" \
    "intent_slug=${slug}" \
    "unit_count=${unit_count}"
}

# Unit status change
# Usage: haiku_record_unit_status_change <intent_slug> <unit_slug> <old_status> <new_status>
haiku_record_unit_status_change() {
  local intent_slug="${1:-}" unit_slug="${2:-}" old_status="${3:-}" new_status="${4:-}"
  haiku_log_event "haiku.unit.status_change" \
    "intent_slug=${intent_slug}" \
    "unit_slug=${unit_slug}" \
    "old_status=${old_status}" \
    "new_status=${new_status}"
}

# Hat transition
# Usage: haiku_record_hat_transition <intent_slug> <from_hat> <to_hat>
haiku_record_hat_transition() {
  local intent_slug="${1:-}" from_hat="${2:-}" to_hat="${3:-}"
  haiku_log_event "haiku.hat.transition" \
    "intent_slug=${intent_slug}" \
    "from_hat=${from_hat}" \
    "to_hat=${to_hat}"
}

# Bolt iteration
# Usage: haiku_record_bolt_iteration <intent_slug> <unit_slug> <bolt_number> <outcome>
haiku_record_bolt_iteration() {
  local intent_slug="${1:-}" unit_slug="${2:-}" bolt_number="${3:-}" outcome="${4:-}"
  haiku_log_event "haiku.bolt.iteration" \
    "intent_slug=${intent_slug}" \
    "unit_slug=${unit_slug}" \
    "bolt_number=${bolt_number}" \
    "outcome=${outcome}"
}

# Elaboration complete
# Usage: haiku_record_elaboration_complete <intent_slug> <unit_count> <has_wireframes>
haiku_record_elaboration_complete() {
  local intent_slug="${1:-}" unit_count="${2:-}" has_wireframes="${3:-}"
  haiku_log_event "haiku.elaboration.complete" \
    "intent_slug=${intent_slug}" \
    "unit_count=${unit_count}" \
    "has_wireframes=${has_wireframes}"
}

# Followup created
# Usage: haiku_record_followup_created <intent_slug> <unit_slug>
haiku_record_followup_created() {
  local intent_slug="${1:-}" unit_slug="${2:-}"
  haiku_log_event "haiku.followup.created" \
    "intent_slug=${intent_slug}" \
    "unit_slug=${unit_slug}"
}

# Cleanup run
# Usage: haiku_record_cleanup <orphaned_count> <merged_count>
haiku_record_cleanup() {
  local orphaned_count="${1:-}" merged_count="${2:-}"
  haiku_log_event "haiku.cleanup.run" \
    "orphaned_count=${orphaned_count}" \
    "merged_count=${merged_count}"
}

# Review decision (per-unit reviewer hat)
# Usage: haiku_record_review_decision <intent_slug> <unit_slug> <decision> <issue_count>
haiku_record_review_decision() {
  local intent_slug="${1:-}" unit_slug="${2:-}" decision="${3:-}" issue_count="${4:-0}"
  haiku_log_event "haiku.review.decision" \
    "intent_slug=${intent_slug}" \
    "unit_slug=${unit_slug}" \
    "decision=${decision}" \
    "issue_count=${issue_count}"
}

# Quality gate result (test/lint/typecheck)
# Usage: haiku_record_quality_gate <intent_slug> <unit_slug> <gate> <passed>
haiku_record_quality_gate() {
  local intent_slug="${1:-}" unit_slug="${2:-}" gate="${3:-}" passed="${4:-}"
  haiku_log_event "haiku.quality_gate.result" \
    "intent_slug=${intent_slug}" \
    "unit_slug=${unit_slug}" \
    "gate=${gate}" \
    "passed=${passed}"
}

# Integration validation result
# Usage: haiku_record_integration_result <intent_slug> <passed> <issue_count>
haiku_record_integration_result() {
  local intent_slug="${1:-}" passed="${2:-}" issue_count="${3:-0}"
  haiku_log_event "haiku.integrate.result" \
    "intent_slug=${intent_slug}" \
    "passed=${passed}" \
    "issue_count=${issue_count}"
}

# Pre-delivery code review result
# Usage: haiku_record_delivery_review <intent_slug> <decision> <issue_count>
haiku_record_delivery_review() {
  local intent_slug="${1:-}" decision="${2:-}" issue_count="${3:-0}"
  haiku_log_event "haiku.delivery.review" \
    "intent_slug=${intent_slug}" \
    "decision=${decision}" \
    "issue_count=${issue_count}"
}

# PR/MR delivery created
# Usage: haiku_record_delivery_created <intent_slug> <strategy> <pr_url>
haiku_record_delivery_created() {
  local intent_slug="${1:-}" strategy="${2:-}" pr_url="${3:-}"
  haiku_log_event "haiku.delivery.created" \
    "intent_slug=${intent_slug}" \
    "strategy=${strategy}" \
    "pr_url=${pr_url}"
}

# Hat failure (work sent back to previous hat)
# Usage: haiku_record_hat_failure <intent_slug> <unit_slug> <from_hat> <to_hat> <reason>
haiku_record_hat_failure() {
  local intent_slug="${1:-}" unit_slug="${2:-}" from_hat="${3:-}" to_hat="${4:-}" reason="${5:-}"
  haiku_log_event "haiku.hat.failure" \
    "intent_slug=${intent_slug}" \
    "unit_slug=${unit_slug}" \
    "from_hat=${from_hat}" \
    "to_hat=${to_hat}" \
    "reason=${reason}"
}

# Worktree lifecycle event
# Usage: haiku_record_worktree_event <event> <worktree_path>
haiku_record_worktree_event() {
  local event="${1:-}" worktree_path="${2:-}"
  haiku_log_event "haiku.worktree.event" \
    "event=${event}" \
    "worktree_path=${worktree_path}"
}

# ============================================================================
# Stage-level telemetry (added for multi-stage lifecycle)
# ============================================================================

# Stage started
# Usage: haiku_record_stage_started <intent_slug> <studio> <stage_name>
haiku_record_stage_started() {
  local intent_slug="${1:-}" studio="${2:-}" stage_name="${3:-}"
  haiku_log_event "haiku.stage.started" \
    "intent_slug=${intent_slug}" \
    "studio=${studio}" \
    "stage=${stage_name}"
}

# Stage completed
# Usage: haiku_record_stage_completed <intent_slug> <studio> <stage_name> <unit_count>
haiku_record_stage_completed() {
  local intent_slug="${1:-}" studio="${2:-}" stage_name="${3:-}" unit_count="${4:-}"
  haiku_log_event "haiku.stage.completed" \
    "intent_slug=${intent_slug}" \
    "studio=${studio}" \
    "stage=${stage_name}" \
    "unit_count=${unit_count}"
}

# Review gate resolved
# Usage: haiku_record_gate_resolved <intent_slug> <stage_name> <gate_type> <outcome>
# outcome: advanced | paused | blocked | awaiting | timed_out | escalated
haiku_record_gate_resolved() {
  local intent_slug="${1:-}" stage_name="${2:-}" gate_type="${3:-}" outcome="${4:-}"
  haiku_log_event "haiku.gate.resolved" \
    "intent_slug=${intent_slug}" \
    "stage=${stage_name}" \
    "gate_type=${gate_type}" \
    "outcome=${outcome}"
}

# Review agent finding
# Usage: haiku_record_review_agent_finding <intent_slug> <stage> <agent_name> <severity> <count>
haiku_record_review_agent_finding() {
  local intent_slug="${1:-}" stage="${2:-}" agent_name="${3:-}" severity="${4:-}" count="${5:-1}"
  haiku_log_event "haiku.review_agent.finding" \
    "intent_slug=${intent_slug}" \
    "stage=${stage}" \
    "agent=${agent_name}" \
    "severity=${severity}" \
    "count=${count}"
}

# Stage-scoped refinement (upstream side-trip)
# Usage: haiku_record_stage_refinement <intent_slug> <current_stage> <target_stage> <reason>
haiku_record_stage_refinement() {
  local intent_slug="${1:-}" current_stage="${2:-}" target_stage="${3:-}" reason="${4:-}"
  haiku_log_event "haiku.stage.refinement" \
    "intent_slug=${intent_slug}" \
    "current_stage=${current_stage}" \
    "target_stage=${target_stage}" \
    "reason=${reason}"
}

# Trigger event (from /haiku:triggers polling)
# Usage: haiku_record_trigger_event <provider> <event_type> <intent_slug> <action>
haiku_record_trigger_event() {
  local provider="${1:-}" event_type="${2:-}" intent_slug="${3:-}" action="${4:-}"
  haiku_log_event "haiku.trigger.event" \
    "provider=${provider}" \
    "event_type=${event_type}" \
    "intent_slug=${intent_slug}" \
    "action=${action}"
}

# Template instantiation
# Usage: haiku_record_template_used <studio> <template_name> <intent_slug>
haiku_record_template_used() {
  local studio="${1:-}" template_name="${2:-}" intent_slug="${3:-}"
  haiku_log_event "haiku.template.used" \
    "studio=${studio}" \
    "template=${template_name}" \
    "intent_slug=${intent_slug}"
}

# Provider sync event
# Usage: haiku_record_provider_sync <category> <type> <direction> <item_count>
haiku_record_provider_sync() {
  local category="${1:-}" type="${2:-}" direction="${3:-}" item_count="${4:-0}"
  haiku_log_event "haiku.provider.sync" \
    "category=${category}" \
    "type=${type}" \
    "direction=${direction}" \
    "item_count=${item_count}"
}

# Gate timeout/escalation
# Usage: haiku_record_gate_timeout <intent_slug> <stage> <action>
haiku_record_gate_timeout() {
  local intent_slug="${1:-}" stage="${2:-}" action="${3:-}"
  haiku_log_event "haiku.gate.timeout" \
    "intent_slug=${intent_slug}" \
    "stage=${stage}" \
    "action=${action}"
}
