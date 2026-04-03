#!/bin/bash
# filesystem.sh — Filesystem persistence adapter for H·AI·K·U
#
# Provides a non-git persistence backend using plain filesystem operations.
# Used when studio persistence.type is "filesystem" (e.g., the ideation studio).
#
# Workspaces are stored under .haiku/intents/{slug}/ with versioned snapshots.
# Operations that don't apply (tracking, sync) are silent no-ops.
#
# All functions follow the naming convention: _persistence_filesystem_<operation>

# Guard against double-sourcing
if [ -n "${_HKU_ADAPTER_FILESYSTEM_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_HKU_ADAPTER_FILESYSTEM_SOURCED=1

# ============================================================================
# Create Workspace
# ============================================================================

# Create workspace: directory structure
# Usage: _persistence_filesystem_create_workspace <intent_slug> <studio_name> [--unit <unit_slug>]
_persistence_filesystem_create_workspace() {
  local intent_slug="$1"
  local studio_name="$2"
  shift 2

  local base_dir=".haiku/intents/${intent_slug}"
  mkdir -p "${base_dir}/workspace"
  mkdir -p "${base_dir}/versions"
  mkdir -p "${base_dir}/reviews"
}

# ============================================================================
# Save
# ============================================================================

# Save: create timestamped snapshot
# Usage: _persistence_filesystem_save <intent_slug> <message> [files...]
_persistence_filesystem_save() {
  local intent_slug="$1"
  local message="$2"
  shift 2

  local base_dir=".haiku/intents/${intent_slug}"
  local timestamp
  timestamp=$(date +%Y%m%d-%H%M%S)
  local snapshot_dir="${base_dir}/versions/${timestamp}"

  mkdir -p "$snapshot_dir"

  if [ $# -gt 0 ]; then
    # Copy specific files/directories into snapshot
    for item in "$@"; do
      if [ -e "$item" ]; then
        cp -r "$item" "$snapshot_dir/" 2>/dev/null || true
      fi
    done
  else
    # Copy entire workspace into snapshot
    if [ -d "${base_dir}/workspace" ]; then
      cp -r "${base_dir}/workspace/." "$snapshot_dir/" 2>/dev/null || true
    fi
  fi

  # Write commit message
  echo "$message" > "${snapshot_dir}/COMMIT_MSG"
}

# ============================================================================
# Create Review
# ============================================================================

# Create review: write review file
# Usage: _persistence_filesystem_create_review <intent_slug> <stage_name> <review_body> [--unit <unit_slug>]
_persistence_filesystem_create_review() {
  local intent_slug="$1"
  local stage_name="$2"
  local review_body="$3"
  shift 3

  local base_dir=".haiku/intents/${intent_slug}"
  mkdir -p "${base_dir}/reviews"

  echo "$review_body" > "${base_dir}/reviews/${stage_name}-review.md"
}

# ============================================================================
# Deliver
# ============================================================================

# Deliver: move workspace to delivered
# Usage: _persistence_filesystem_deliver <intent_slug> [--unit <unit_slug>] [--squash]
_persistence_filesystem_deliver() {
  local intent_slug="$1"
  shift

  local base_dir=".haiku/intents/${intent_slug}"
  local delivered_dir="${base_dir}/delivered"

  mkdir -p "$delivered_dir"

  if [ -d "${base_dir}/workspace" ]; then
    mv "${base_dir}/workspace" "$delivered_dir/" 2>/dev/null || true
  fi
}

# ============================================================================
# Cleanup
# ============================================================================

# Cleanup: archive or remove intent directory
# Usage: _persistence_filesystem_cleanup <intent_slug> [--unit <unit_slug>]
_persistence_filesystem_cleanup() {
  local intent_slug="$1"
  shift

  local base_dir=".haiku/intents/${intent_slug}"

  # Archive by renaming with timestamp
  if [ -d "$base_dir" ]; then
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    mv "$base_dir" "${base_dir}.archived-${timestamp}" 2>/dev/null || true
  fi
}

# ============================================================================
# Tracking & Sync (no-ops for filesystem)
# ============================================================================

# No-op: filesystem has no remote tracking
_persistence_filesystem_ensure_tracking() {
  return 0
}

# No-op: filesystem has no remote to sync from
_persistence_filesystem_sync() {
  return 0
}
