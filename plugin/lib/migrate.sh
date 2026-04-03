#!/bin/bash
# migrate.sh - H·AI·K·U Migration Helpers
#
# Migrates legacy .ai-dlc/ paths to .haiku/ with backward-compat symlinks.
# All functions are idempotent — re-running is a no-op if new path exists.
# Intent directory migration is handled separately (unit-13).

# Guard against double-sourcing
[[ -n "${_HKU_MIGRATE_SOURCED:-}" ]] && return 0
_HKU_MIGRATE_SOURCED=1

# Migrate a single file from old path to new path
# Usage: _hku_migrate_file <old_path> <new_path>
_hku_migrate_file() {
  local old_path="$1"
  local new_path="$2"

  # Skip if new path already exists
  [[ -e "$new_path" || -L "$new_path" ]] && return 0

  # Skip if old path doesn't exist
  [[ ! -f "$old_path" ]] && return 0

  # Ensure parent directory exists
  mkdir -p "$(dirname "$new_path")"

  # Copy file to new location
  cp "$old_path" "$new_path"

  # Create backward-compat symlink (old → new), silently skip on failure
  ln -sf "$new_path" "$old_path" 2>/dev/null || true
}

# Migrate a directory from old path to new path
# Usage: _hku_migrate_dir <old_path> <new_path>
_hku_migrate_dir() {
  local old_path="$1"
  local new_path="$2"

  # Skip if new path already exists
  [[ -e "$new_path" || -L "$new_path" ]] && return 0

  # Skip if old path doesn't exist or isn't a directory
  [[ ! -d "$old_path" ]] && return 0

  # Ensure parent directory exists
  mkdir -p "$(dirname "$new_path")"

  # Copy directory to new location
  cp -R "$old_path" "$new_path"

  # Remove old directory and create backward-compat symlink
  rm -rf "$old_path"
  ln -sf "$new_path" "$old_path" 2>/dev/null || true
}

# Migrate settings: .ai-dlc/settings.yml → .haiku/settings.yml
# Usage: hku_migrate_settings <project_root>
hku_migrate_settings() {
  local project_root="$1"
  _hku_migrate_file "$project_root/.ai-dlc/settings.yml" "$project_root/.haiku/settings.yml"
}

# Migrate providers: .ai-dlc/providers/ → .haiku/providers/
# Usage: hku_migrate_providers <project_root>
hku_migrate_providers() {
  local project_root="$1"
  _hku_migrate_dir "$project_root/.ai-dlc/providers" "$project_root/.haiku/providers"
}

# Migrate knowledge: .ai-dlc/knowledge/ → .haiku/knowledge/
# Usage: hku_migrate_knowledge <project_root>
hku_migrate_knowledge() {
  local project_root="$1"
  _hku_migrate_dir "$project_root/.ai-dlc/knowledge" "$project_root/.haiku/knowledge"
}

# Run all migrations (idempotent)
# Usage: hku_migrate_all <project_root>
hku_migrate_all() {
  local project_root="$1"
  [[ -z "$project_root" ]] && return 0

  # Check if there's anything to migrate
  local needs_migration=false
  if [[ -f "$project_root/.ai-dlc/settings.yml" && ! -e "$project_root/.haiku/settings.yml" ]]; then
    needs_migration=true
  fi
  if [[ -d "$project_root/.ai-dlc/providers" && ! -e "$project_root/.haiku/providers" ]]; then
    needs_migration=true
  fi
  if [[ -d "$project_root/.ai-dlc/knowledge" && ! -e "$project_root/.haiku/knowledge" ]]; then
    needs_migration=true
  fi

  [[ "$needs_migration" = "false" ]] && return 0

  # Ensure .haiku/ directory exists
  mkdir -p "$project_root/.haiku"

  hku_migrate_settings "$project_root"
  hku_migrate_providers "$project_root"
  hku_migrate_knowledge "$project_root"

  echo "haiku: migrated project configuration from .ai-dlc/ to .haiku/" >&2
}
