#!/bin/bash
# persistence.sh — Persistence abstraction for H·AI·K·U
#
# Dispatches persistence operations to adapter implementations based on the
# active studio's persistence.type field. Adapters live in lib/adapters/.
#
# Interface functions:
#   persistence_create_workspace <intent_slug> <studio_name> [--unit <unit_slug>]
#   persistence_save <intent_slug> <message> [files...]
#   persistence_create_review <intent_slug> <stage_name> <review_body> [--unit <unit_slug>]
#   persistence_deliver <intent_slug> [--unit <unit_slug>] [--squash]
#   persistence_cleanup <intent_slug> [--unit <unit_slug>]
#   persistence_ensure_tracking <intent_slug>
#   persistence_sync <intent_slug>
#
# Adapter contract:
#   Each adapter exports _persistence_{type}_{operation} functions matching
#   the interface above. The filesystem adapter treats no-op operations
#   (e.g., ensure_tracking) as silent successes.
#
# Usage:
#   source persistence.sh
#   persistence_save "my-feature" "haiku: complete stage — design" ".haiku/intents/my-feature/stages/design/"

# Guard against double-sourcing
if [ -n "${_HKU_PERSISTENCE_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_HKU_PERSISTENCE_SOURCED=1

PERSISTENCE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

# Source dependencies (double-source guards in each prevent redundant loading)
# shellcheck source=config.sh
source "$PERSISTENCE_SCRIPT_DIR/config.sh"
# shellcheck source=studio.sh
source "$PERSISTENCE_SCRIPT_DIR/studio.sh"
# shellcheck source=parse.sh
source "$PERSISTENCE_SCRIPT_DIR/parse.sh"

# Track which adapter is currently loaded to avoid re-sourcing
_HKU_ADAPTER_SOURCED=""

# ============================================================================
# Adapter Resolution
# ============================================================================

# Get the persistence adapter type for the current context
# Usage: _persistence_get_adapter_type [intent_file]
# Returns: adapter type string (e.g., "git", "filesystem")
_persistence_get_adapter_type() {
  local intent_file="${1:-}"
  local studio_name=""

  # Try to get studio from intent file
  if [ -n "$intent_file" ] && [ -f "$intent_file" ]; then
    studio_name=$(hku_get_active_studio "$intent_file")
  else
    studio_name=$(hku_get_active_studio)
  fi

  if [ -n "$studio_name" ]; then
    local metadata
    metadata=$(hku_load_studio_metadata "$studio_name" 2>/dev/null || echo "{}")
    local ptype
    ptype=$(echo "$metadata" | jq -r '.persistence.type // empty' 2>/dev/null || echo "")
    if [ -n "$ptype" ]; then
      echo "$ptype"
      return 0
    fi
  fi

  # Default to git
  echo "git"
}

# Dispatch a persistence operation to the active adapter
# Usage: _persistence_dispatch <operation> [args...]
_persistence_dispatch() {
  local operation="$1"; shift
  local adapter_type
  adapter_type=$(_persistence_get_adapter_type)
  local adapter_file="${PERSISTENCE_SCRIPT_DIR}/adapters/${adapter_type}.sh"

  if [[ ! -f "$adapter_file" ]]; then
    echo "haiku: unknown persistence adapter: ${adapter_type}" >&2
    return 1
  fi

  if [[ "$_HKU_ADAPTER_SOURCED" != "$adapter_type" ]]; then
    # shellcheck source=/dev/null
    source "$adapter_file" || return 1
    _HKU_ADAPTER_SOURCED="$adapter_type"
  fi

  "_persistence_${adapter_type}_${operation}" "$@"
}

# ============================================================================
# Public Interface
# ============================================================================

# Create workspace for an intent or unit
# Usage: persistence_create_workspace <intent_slug> <studio_name> [--unit <unit_slug>]
persistence_create_workspace() {
  _persistence_dispatch "create_workspace" "$@"
}

# Save work (commit, snapshot, etc.)
# Usage: persistence_save <intent_slug> <message> [files...]
persistence_save() {
  _persistence_dispatch "save" "$@"
}

# Create a review artifact (PR, review file, etc.)
# Usage: persistence_create_review <intent_slug> <stage_name> <review_body> [--unit <unit_slug>]
persistence_create_review() {
  _persistence_dispatch "create_review" "$@"
}

# Deliver completed work (merge, move, etc.)
# Usage: persistence_deliver <intent_slug> [--unit <unit_slug>] [--squash]
persistence_deliver() {
  _persistence_dispatch "deliver" "$@"
}

# Clean up workspace (remove worktree/branch, archive, etc.)
# Usage: persistence_cleanup <intent_slug> [--unit <unit_slug>]
persistence_cleanup() {
  _persistence_dispatch "cleanup" "$@"
}

# Ensure remote tracking (git: push -u; filesystem: no-op)
# Usage: persistence_ensure_tracking <intent_slug>
persistence_ensure_tracking() {
  _persistence_dispatch "ensure_tracking" "$@"
}

# Pull latest changes (git: pull --rebase; filesystem: no-op)
# Usage: persistence_sync <intent_slug>
persistence_sync() {
  _persistence_dispatch "sync" "$@"
}
