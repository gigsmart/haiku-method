#!/bin/bash
# telemetry.sh - OTEL telemetry library for AI-DLC
#
# Sends structured log events to an OTLP/JSON endpoint via curl.
# Reports as service.name=ai-dlc alongside han's service.name=han.
#
# Environment variables:
#   CLAUDE_CODE_ENABLE_TELEMETRY=1  - Master switch (must be "1" to enable)
#   OTEL_EXPORTER_OTLP_ENDPOINT    - Collector endpoint (default: http://localhost:4317)
#   OTEL_EXPORTER_OTLP_HEADERS     - Auth headers (format: key1=value1,key2=value2)
#   OTEL_RESOURCE_ATTRIBUTES        - Custom resource attributes (key1=value1,key2=value2)
#
# Usage:
#   source telemetry.sh
#   aidlc_telemetry_init
#   aidlc_log_event "ai_dlc.intent.created" "intent_slug=my-feature" "strategy=unit"

# Guard against double-sourcing
if [ -n "${_AIDLC_TELEMETRY_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_AIDLC_TELEMETRY_SOURCED=1

# Internal state
_AIDLC_TELEMETRY_INIT=""
_AIDLC_TELEMETRY_ENABLED=""
_AIDLC_TELEMETRY_ENDPOINT=""
_AIDLC_TELEMETRY_VERSION=""
_AIDLC_TELEMETRY_CURL_HEADERS=""

# Initialize telemetry (call once per script)
# Reads env vars, detects plugin version, builds curl header flags.
# If CLAUDE_CODE_ENABLE_TELEMETRY != "1", all functions become no-ops.
aidlc_telemetry_init() {
  _AIDLC_TELEMETRY_INIT=1

  # Master switch
  if [ "${CLAUDE_CODE_ENABLE_TELEMETRY:-}" != "1" ]; then
    _AIDLC_TELEMETRY_ENABLED=0
    return 0
  fi

  _AIDLC_TELEMETRY_ENABLED=1

  # Endpoint (default matches han's default)
  _AIDLC_TELEMETRY_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-http://localhost:4317}"
  # Strip trailing slash
  _AIDLC_TELEMETRY_ENDPOINT="${_AIDLC_TELEMETRY_ENDPOINT%/}"

  # Read plugin version from plugin.json
  _AIDLC_TELEMETRY_VERSION=""
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
      if [[ "$line" =~ \"version\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
        _AIDLC_TELEMETRY_VERSION="${BASH_REMATCH[1]}"
        break
      fi
    done < "$plugin_json"
  fi
  : "${_AIDLC_TELEMETRY_VERSION:=unknown}"

  # Parse OTEL_EXPORTER_OTLP_HEADERS into curl -H flags
  _AIDLC_TELEMETRY_CURL_HEADERS=""
  if [ -n "${OTEL_EXPORTER_OTLP_HEADERS:-}" ]; then
    local IFS=','
    for pair in $OTEL_EXPORTER_OTLP_HEADERS; do
      local key="${pair%%=*}"
      local value="${pair#*=}"
      if [ -n "$key" ] && [ -n "$value" ]; then
        _AIDLC_TELEMETRY_CURL_HEADERS="${_AIDLC_TELEMETRY_CURL_HEADERS} -H ${key}:${value}"
      fi
    done
    unset IFS
  fi
}

# Get epoch time in nanoseconds (best effort)
# Falls back to seconds * 1e9 if no nanosecond source available
_aidlc_epoch_nanos() {
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
_aidlc_resource_attributes() {
  local attrs=""
  attrs="${attrs}{\"key\":\"service.name\",\"value\":{\"stringValue\":\"ai-dlc\"}}"
  attrs="${attrs},{\"key\":\"service.version\",\"value\":{\"stringValue\":\"${_AIDLC_TELEMETRY_VERSION}\"}}"

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
# Usage: aidlc_log_event <event_name> [key=value ...]
# All calls are backgrounded and fail silently.
aidlc_log_event() {
  # No-op if not initialized or not enabled
  if [ "${_AIDLC_TELEMETRY_ENABLED:-0}" != "1" ]; then
    return 0
  fi

  local event_name="${1:?aidlc_log_event requires an event name}"
  shift

  local time_nanos
  time_nanos=$(_aidlc_epoch_nanos)

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
  resource_attrs=$(_aidlc_resource_attributes)

  local payload
  payload=$(cat <<PAYLOAD_EOF
{"resourceLogs":[{"resource":{"attributes":${resource_attrs}},"scopeLogs":[{"scope":{"name":"ai-dlc"},"logRecords":[{"timeUnixNano":"${time_nanos}","severityNumber":9,"severityText":"INFO","body":{"stringValue":"${event_name}"},"attributes":[${log_attrs}]}]}]}]}
PAYLOAD_EOF
)

  # Send via curl in the background, fail silently
  # shellcheck disable=SC2086
  (curl -s -S \
    --connect-timeout 2 \
    --max-time 5 \
    -X POST \
    -H "Content-Type: application/json" \
    ${_AIDLC_TELEMETRY_CURL_HEADERS} \
    -d "$payload" \
    "${_AIDLC_TELEMETRY_ENDPOINT}/v1/logs" \
    >/dev/null 2>&1 || true) &
}

# ============================================================================
# Convenience functions for common AI-DLC events
# ============================================================================

# Intent created
# Usage: aidlc_record_intent_created <slug> <strategy>
aidlc_record_intent_created() {
  local slug="${1:-}" strategy="${2:-}"
  aidlc_log_event "ai_dlc.intent.created" \
    "intent_slug=${slug}" \
    "strategy=${strategy}"
}

# Intent completed
# Usage: aidlc_record_intent_completed <slug> <unit_count>
aidlc_record_intent_completed() {
  local slug="${1:-}" unit_count="${2:-}"
  aidlc_log_event "ai_dlc.intent.completed" \
    "intent_slug=${slug}" \
    "unit_count=${unit_count}"
}

# Unit status change
# Usage: aidlc_record_unit_status_change <intent_slug> <unit_slug> <old_status> <new_status>
aidlc_record_unit_status_change() {
  local intent_slug="${1:-}" unit_slug="${2:-}" old_status="${3:-}" new_status="${4:-}"
  aidlc_log_event "ai_dlc.unit.status_change" \
    "intent_slug=${intent_slug}" \
    "unit_slug=${unit_slug}" \
    "old_status=${old_status}" \
    "new_status=${new_status}"
}

# Hat transition
# Usage: aidlc_record_hat_transition <intent_slug> <from_hat> <to_hat>
aidlc_record_hat_transition() {
  local intent_slug="${1:-}" from_hat="${2:-}" to_hat="${3:-}"
  aidlc_log_event "ai_dlc.hat.transition" \
    "intent_slug=${intent_slug}" \
    "from_hat=${from_hat}" \
    "to_hat=${to_hat}"
}

# Bolt iteration
# Usage: aidlc_record_bolt_iteration <intent_slug> <unit_slug> <bolt_number> <outcome>
aidlc_record_bolt_iteration() {
  local intent_slug="${1:-}" unit_slug="${2:-}" bolt_number="${3:-}" outcome="${4:-}"
  aidlc_log_event "ai_dlc.bolt.iteration" \
    "intent_slug=${intent_slug}" \
    "unit_slug=${unit_slug}" \
    "bolt_number=${bolt_number}" \
    "outcome=${outcome}"
}

# Elaboration complete
# Usage: aidlc_record_elaboration_complete <intent_slug> <unit_count> <has_wireframes>
aidlc_record_elaboration_complete() {
  local intent_slug="${1:-}" unit_count="${2:-}" has_wireframes="${3:-}"
  aidlc_log_event "ai_dlc.elaboration.complete" \
    "intent_slug=${intent_slug}" \
    "unit_count=${unit_count}" \
    "has_wireframes=${has_wireframes}"
}

# Followup created
# Usage: aidlc_record_followup_created <intent_slug> <unit_slug>
aidlc_record_followup_created() {
  local intent_slug="${1:-}" unit_slug="${2:-}"
  aidlc_log_event "ai_dlc.followup.created" \
    "intent_slug=${intent_slug}" \
    "unit_slug=${unit_slug}"
}

# Cleanup run
# Usage: aidlc_record_cleanup <orphaned_count> <merged_count>
aidlc_record_cleanup() {
  local orphaned_count="${1:-}" merged_count="${2:-}"
  aidlc_log_event "ai_dlc.cleanup.run" \
    "orphaned_count=${orphaned_count}" \
    "merged_count=${merged_count}"
}
