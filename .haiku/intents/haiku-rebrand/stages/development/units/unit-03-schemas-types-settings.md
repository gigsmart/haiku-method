---
name: unit-03-schemas-types-settings
type: backend
status: completed
inputs: ["knowledge/DISCOVERY.md"]
depends_on: [unit-01-lib-hooks-rename]
bolt: 0
hat: ""
started_at: 2026-04-03T01:35:22Z
completed_at: 2026-04-03T01:35:22Z
---


# unit-03-schemas-types-settings

## Description

Update all schema files, TypeScript types, and settings references from AI-DLC to H·AI·K·U conventions. Add a settings migration path that detects `.ai-dlc/settings.yml` and either migrates it or creates a symlink to `.haiku/settings.yml`.

## Discipline

backend - JSON Schema, TypeScript type definitions, and settings migration logic.

## Domain Entities

- `plugin/schemas/settings.schema.json` — settings validation schema
- `plugin/schemas/providers/*.json` — provider configuration schemas
- `plugin/shared/src/types.ts` — TypeScript type definitions
- `plugin/lib/config.sh` — settings loading logic
- `plugin/lib/migrate.sh` — settings, providers, and knowledge migration functions (new file)

## Technical Specification

### Settings Schema (`plugin/schemas/settings.schema.json`)

- `$id` — update from any `ai-dlc` reference to `haiku`
- `description` — update "AI-DLC" -> "H·AI·K·U"
- `properties` — update any field descriptions referencing `.ai-dlc/` paths to `.haiku/`
- Add `studio` field if not already present:
  ```json
  "studio": {
    "type": "string",
    "description": "The studio (lifecycle template) for this project. Default: ideation.",
    "default": "ideation"
  }
  ```
- Update any `$ref` paths that reference `ai-dlc`

### Provider Schemas (`plugin/schemas/providers/*.json`)

- Update `$id` fields from `ai-dlc` to `haiku`
- Update `description` fields from "AI-DLC" to "H·AI·K·U"
- Update any path references from `.ai-dlc/` to `.haiku/`
- Files to check: all JSON files under `plugin/schemas/providers/`

### TypeScript Types (`plugin/shared/src/types.ts`)

- Rename any type names containing `AiDlc`, `AI_DLC`, `AIDLC`, or `Dlc` to use `Haiku` or `HKU` equivalents
- Update string literal types referencing `ai-dlc` to `haiku`
- Update any path string constants from `.ai-dlc/` to `.haiku/`
- Update interface/type documentation comments referencing AI-DLC

### Settings Migration

Add migration logic to a new `plugin/lib/migrate.sh`:

```bash
# Detect legacy .ai-dlc/settings.yml and migrate
hku_migrate_settings() {
  local project_root="${1:-.}"
  local old_settings="${project_root}/.ai-dlc/settings.yml"
  local new_settings="${project_root}/.haiku/settings.yml"

  if [[ -f "$old_settings" && ! -f "$new_settings" ]]; then
    mkdir -p "$(dirname "$new_settings")"
    cp "$old_settings" "$new_settings"
    # Optionally symlink for backward compat during transition
    if [[ ! -L "$old_settings" ]]; then
      ln -sf "$new_settings" "$old_settings"
    fi
    echo "haiku: migrated settings from .ai-dlc/ to .haiku/" >&2
  fi
}
```

Migration should:
1. Run automatically on config load (in `get_haiku_config` or equivalent)
2. Copy `.ai-dlc/settings.yml` -> `.haiku/settings.yml` if only old exists
3. Create a symlink from old path to new path for backward compatibility
4. Migrate `.ai-dlc/providers/` -> `.haiku/providers/` similarly
5. Migrate `.ai-dlc/knowledge/` -> `.haiku/knowledge/` similarly
6. Print a one-time migration notice to stderr

### Field Updates in Settings

If the settings schema previously had `default_stages` or pass-related fields, ensure they are updated:

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `default_stages` | `studio` | Studio name replaces explicit stage list |
| `default_pass` / `default_passes` | (removed) | Studios define their own stages |
| Any `.ai-dlc/` path defaults | `.haiku/` equivalents | |

### Verification

```bash
grep -r 'ai-dlc' plugin/schemas/ --include='*.json'          # 0 results
grep -r 'AI-DLC' plugin/schemas/ --include='*.json'          # 0 results
grep -r 'ai-dlc' plugin/shared/ --include='*.ts'             # 0 results
grep -r 'AI_DLC' plugin/shared/ --include='*.ts'             # 0 results
grep -r '\.ai-dlc/' plugin/schemas/ --include='*.json'       # 0 results
```

## Success Criteria

- [x] settings.schema.json has no `ai-dlc` references; `$id` and descriptions use `haiku`
- [x] settings.schema.json includes `studio` field with default `"ideation"`
- [x] All provider schemas have `$id` and descriptions updated to `haiku` / "H·AI·K·U"
- [x] types.ts has no `AiDlc`, `AI_DLC`, `AIDLC`, or `Dlc` type names
- [x] types.ts string literals updated from `ai-dlc` to `haiku`
- [x] Settings migration function exists and handles `.ai-dlc/settings.yml` -> `.haiku/settings.yml`
- [x] Migration handles providers and knowledge directories
- [x] Migration runs automatically on first config load
- [x] Migration creates backward-compat symlinks
- [x] Schema validation passes for existing settings files after migration

## Risks

- **Schema breaking changes**: Adding `studio` field or removing old fields could break existing settings files. Mitigation: make `studio` optional with a default value; keep old fields accepted but deprecated.
- **Symlink behavior on Windows/WSL**: Symlinks may not work on all platforms. Mitigation: fall back to copy if symlink fails; detect platform in migration function.
- **TypeScript compilation**: Type name changes could break imports in other TS files. Mitigation: grep for all import references to changed types and update them.

## Boundaries

This unit covers schemas, types, and settings migration only. It does NOT modify shell library function names (unit-01), skill definitions (unit-02), or any architectural changes (units 04-08).

`plugin/lib/migrate.sh` created here handles settings, providers, and knowledge directory migration only. Migration of existing `.ai-dlc/{slug}/` intent directories (including frontmatter translation and unit placement under `stages/{stage}/units/`) is owned by **unit-13-legacy-intent-migration**, which extends `migrate.sh` with intent migration functions.
