#!/bin/bash
# migrate.sh - H·AI·K·U Migration Helpers
#
# Migrates legacy .ai-dlc/ paths to .haiku/ with backward-compat symlinks.
# All functions are idempotent — re-running is a no-op if new path exists.
# Intent migration functions (hku_migrate_legacy_intent, etc.) require
# state.sh to be sourced first (guaranteed when loaded via config.sh).

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

# ============================================================================
# Intent Directory Migration (Legacy .ai-dlc/{slug}/ → .haiku/intents/{slug}/)
# ============================================================================
# Migrates legacy AI-DLC intent directories to the new H·AI·K·U intents
# structure with frontmatter transformation, unit-to-stage mapping, and
# backward-compat symlinks.

# Map a pass name to a stage name
# Usage: _hku_map_pass_to_stage "dev" → echoes "development"
_hku_map_pass_to_stage() {
  local pass="$1"
  case "$pass" in
    design) echo "design" ;;
    product) echo "product" ;;
    dev|backend|frontend|"") echo "development" ;;
    *) echo "development" ;;
  esac
}

# Infer the stage name from a unit file's pass: frontmatter field
# Usage: hku_infer_stage_from_unit <unit_file>
hku_infer_stage_from_unit() {
  local unit_file="$1"
  local pass=""
  pass=$(grep -m1 '^pass:' "$unit_file" 2>/dev/null | sed 's/^pass:[[:space:]]*//' | sed 's/^"//' | sed 's/"$//')
  _hku_map_pass_to_stage "$pass"
}

# Transform intent frontmatter from legacy AI-DLC to H·AI·K·U format
# Copies body verbatim, transforms frontmatter fields.
# Usage: hku_migrate_intent_frontmatter <old_intent_file> <new_intent_file>
hku_migrate_intent_frontmatter() {
  local old_file="$1"
  local new_file="$2"
  local slug
  slug=$(basename "$(dirname "$old_file")")

  # Copy the file first (preserves body verbatim)
  cp "$old_file" "$new_file"

  # Read active_pass and map to stage name
  local active_pass=""
  active_pass=$(yq --front-matter=extract -r '.active_pass // ""' "$new_file" 2>/dev/null || echo "")
  local active_stage=""
  active_stage=$(_hku_map_pass_to_stage "$active_pass")

  # Runtime migration date
  local migration_date
  migration_date=$(date +%Y-%m-%d)

  # Validate interpolated values to prevent shell injection in yq expression
  if [[ ! "$active_stage" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "haiku: invalid active_stage '$active_stage', skipping frontmatter transform" >&2
    return 1
  fi
  if [[ ! "$slug" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "haiku: invalid slug '$slug', skipping frontmatter transform" >&2
    return 1
  fi
  if [[ ! "$migration_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "haiku: invalid migration_date '$migration_date', skipping frontmatter transform" >&2
    return 1
  fi

  # Transform frontmatter in-place using yq
  local tmp="${new_file}.tmp.$$"
  yq --front-matter=process '
    del(.passes) |
    del(.active_pass) |
    del(.workflow) |
    .active_stage = "'"$active_stage"'" |
    .studio = "software" |
    .mode = "continuous" |
    .migrated_from = ".ai-dlc/'"$slug"'/" |
    .migration_date = "'"$migration_date"'"
  ' "$new_file" > "$tmp" && mv "$tmp" "$new_file"
}

# Create initial state for a migrated intent
# Usage: hku_write_intent_state <new_intent_dir> <slug>
hku_write_intent_state() {
  local new_dir="$1"
  local slug="$2"
  local state_json='{"phase":"execution","hat":"planner","iteration":1,"status":"active","intentSlug":"'"$slug"'"}'

  mkdir -p "${new_dir}/state"
  if type hku_state_save &>/dev/null; then
    hku_state_save "$new_dir" "iteration.json" "$state_json"
  else
    echo "$state_json" > "${new_dir}/state/iteration.json"
  fi
}

# Full physical migration of a legacy AI-DLC intent directory
# Moves .ai-dlc/{slug}/ → .haiku/intents/{slug}/, transforms frontmatter,
# maps units to stages, creates backward-compat symlink.
# Usage: hku_migrate_legacy_intent <project_root> <slug>
hku_migrate_legacy_intent() {
  local project_root="$1"
  local slug="$2"
  local old_dir="${project_root}/.ai-dlc/${slug}"
  local new_dir="${project_root}/.haiku/intents/${slug}"

  # Guard: old must exist as a real directory (not symlink)
  [[ -d "$old_dir" && ! -L "$old_dir" ]] || return 0

  # Guard: new must not exist (idempotent skip)
  if [[ -e "$new_dir" ]]; then
    echo "haiku: intent '$slug' already migrated, skipping" >&2
    return 0
  fi

  echo "haiku: migrating intent '$slug' from .ai-dlc/ to .haiku/intents/..." >&2

  # Create new directory structure
  mkdir -p "${new_dir}/knowledge" "${new_dir}/stages" "${new_dir}/state"

  # Migrate intent.md with frontmatter transformation
  if [[ -f "${old_dir}/intent.md" ]]; then
    hku_migrate_intent_frontmatter "${old_dir}/intent.md" "${new_dir}/intent.md"
    echo "haiku:   intent.md — frontmatter transformed" >&2
  fi

  # Migrate unit-*.md files to stages/{stage}/units/
  local unit_count=0
  for unit_file in "${old_dir}"/unit-*.md; do
    [[ -f "$unit_file" ]] || continue
    local stage
    stage=$(hku_infer_stage_from_unit "$unit_file")
    local unit_name
    unit_name=$(basename "$unit_file")
    mkdir -p "${new_dir}/stages/${stage}/units"
    cp "$unit_file" "${new_dir}/stages/${stage}/units/${unit_name}"
    echo "haiku:   ${unit_name} → stages/${stage}/units/" >&2
    unit_count=$((unit_count + 1))
  done

  # Copy knowledge directory contents if present
  [[ -d "${old_dir}/knowledge" ]] && cp -R "${old_dir}/knowledge/." "${new_dir}/knowledge/" 2>/dev/null

  # Copy completion-criteria.md if present
  [[ -f "${old_dir}/completion-criteria.md" ]] && cp "${old_dir}/completion-criteria.md" "${new_dir}/"

  # Copy discovery.md if present
  [[ -f "${old_dir}/discovery.md" ]] && cp "${old_dir}/discovery.md" "${new_dir}/"

  # Create initial iteration state
  hku_write_intent_state "$new_dir" "$slug"
  echo "haiku:   state/iteration.json — created" >&2

  # Backward compat: backup old dir, symlink old path → new path
  mv "$old_dir" "${old_dir}.pre-haiku-backup"
  ln -sf "../.haiku/intents/${slug}" "$old_dir" 2>/dev/null || true

  echo "haiku: migrated intent '$slug' (${unit_count} units). Old dir backed up at .ai-dlc/${slug}.pre-haiku-backup" >&2
}

# Detect legacy (unmigrated) AI-DLC intents and print a notice
# Scans .ai-dlc/*/intent.md for active intents, skips symlinks.
# Detection only — no auto-migration.
# Usage: hku_detect_legacy_intents [project_root]
hku_detect_legacy_intents() {
  local project_root="${1:-.}"
  local found=()

  for intent_file in "${project_root}"/.ai-dlc/*/intent.md; do
    [[ -f "$intent_file" ]] || continue
    local intent_dir
    intent_dir=$(dirname "$intent_file")

    # Skip symlinks (already migrated)
    [[ -L "$intent_dir" ]] && continue

    # Only detect active intents
    local status=""
    status=$(grep -m1 '^status:' "$intent_file" 2>/dev/null | sed 's/^status:[[:space:]]*//' | sed 's/^"//' | sed 's/"$//')
    [[ "$status" = "active" ]] || continue

    found+=("$(basename "$intent_dir")")
  done

  if [[ ${#found[@]} -gt 0 ]]; then
    echo "" >&2
    echo "haiku: legacy AI-DLC intents detected:" >&2
    for slug in "${found[@]}"; do
      echo "haiku:   - ${slug}" >&2
    done
    echo "haiku: run /haiku:migrate to migrate them to H·AI·K·U format" >&2
    echo "" >&2
  fi
}
