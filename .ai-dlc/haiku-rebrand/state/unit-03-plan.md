# Unit-03 Plan: Schemas, Types & Settings Migration

## Pre-condition

Merge `ai-dlc/haiku-rebrand/main` (which contains unit-01 lib/hooks renames) into this branch before starting. Unit-01 already renamed:
- `get_ai_dlc_config` → `get_haiku_config`
- `export_ai_dlc_config` → `export_haiku_config`
- `AI_DLC_*` env vars → `HAIKU_*`
- `.ai-dlc/` path refs → `.haiku/` in all `plugin/lib/*.sh` and `plugin/hooks/*.sh`

This unit builds on those renames.

---

## Occurrence Inventory

### settings.schema.json — 7 locations, ~15 text instances

| Line | Field | Current Value | Target |
|------|-------|--------------|--------|
| 3 | `$id` | `https://ai-dlc.dev/schemas/ai-dlc-settings.schema.json` | `https://haiku.dev/schemas/haiku-settings.schema.json` |
| 4 | `title` | `"AI-DLC Settings"` | `"H·AI·K·U Settings"` |
| 5 | `description` | `"...AI-DLC behavior..."`, `".ai-dlc/settings.yml"` | `"...H·AI·K·U behavior..."`, `".haiku/settings.yml"` |
| 9 | `_override_pattern.description` | `"AI-DLC supports..."`, `".ai-dlc/{intent}/settings.yml"` x2 | `"H·AI·K·U supports..."`, `".haiku/{intent}/settings.yml"` x2 |
| 34 | `mockup_format.description` | `".ai-dlc/{intent-slug}/mockups/"` | `".haiku/{intent-slug}/mockups/"` |
| 51 | `default_passes.description` | `".ai-dlc/passes/"` x2 | `".haiku/passes/"` x2 |
| 84 | `visual_review.description` | `"ai-dlc-review"` | `"haiku-review"` |

### Provider schemas — 19 files, 1 occurrence each

All have `$id` field: `https://ai-dlc.dev/schemas/providers/{name}.schema.json`
Target: `https://haiku.dev/schemas/providers/{name}.schema.json`

Files: confluence, discord, figma, github-issues, gitlab-issues, google-docs, jira, linear, notion, slack, stack-alerting, stack-compute, stack-infrastructure, stack-monitoring, stack-operations, stack-packaging, stack-pipeline, stack-secrets, teams

### types.ts — 0 occurrences

No `AiDlc`, `AI_DLC`, `AIDLC`, `Dlc`, or `ai-dlc` references found. File is already clean — no renames needed. Verify at build time.

### config.sh — 2 changes needed (post unit-01 merge)

1. Add `source "$SCRIPT_DIR/migrate.sh"` near top (after other source lines)
2. Add `hku_migrate_settings "$repo_root"` call inside `load_repo_settings` before reading settings file

---

## Step-by-Step Plan

### Step 1: Merge intent branch

```bash
git merge ai-dlc/haiku-rebrand/main --no-edit
```

This brings in unit-01's lib/hooks renames so config.sh is already using `get_haiku_config`, `HAIKU_*`, `.haiku/` paths.

**Verify:** `grep -c 'get_ai_dlc_config' plugin/lib/config.sh` returns 0.

### Step 2: Update settings.schema.json

Apply all 7 location changes listed above. Additionally, add the `studio` field to `properties`:

```json
"studio": {
  "type": "string",
  "enum": ["ideation", "software"],
  "default": "ideation",
  "description": "The studio (lifecycle template) for this project. Studios define stage order and persistence type."
}
```

Insert after the `granularity` field (keeps settings in logical order: meta → structure → format → behavior).

**Verify:** `grep -ci 'ai-dlc' plugin/schemas/settings.schema.json` returns 0.

### Step 3: Update all 19 provider schemas

Batch `sed` or individual Edit calls to replace `ai-dlc.dev` → `haiku.dev` in `$id` fields.

**Verify:** `grep -r 'ai-dlc' plugin/schemas/providers/ --include='*.json'` returns 0.

### Step 4: Verify types.ts

Confirm no renames needed. Run:

```bash
grep -ciE 'ai.dlc|AiDlc|AIDLC|AI_DLC' plugin/shared/src/types.ts
```

Expected: 0. If non-zero, rename matching identifiers.

### Step 5: Create plugin/lib/migrate.sh

New file with these functions:

```
hku_migrate_settings(project_root)   — .ai-dlc/settings.yml → .haiku/settings.yml + symlink
hku_migrate_providers(project_root)  — .ai-dlc/providers/   → .haiku/providers/   + symlink
hku_migrate_knowledge(project_root)  — .ai-dlc/knowledge/   → .haiku/knowledge/   + symlink
hku_migrate_all(project_root)        — calls all three, prints one-time notice
```

Design details:
- Guard variable `_HKU_MIGRATE_SOURCED` to prevent double-sourcing
- Each function: check if old path exists AND new path does NOT exist → copy → symlink
- Symlink creation: `ln -sf` with fallback to no-op on failure (Windows/WSL tolerance)
- Migration notice: `echo "haiku: migrated ... from .ai-dlc/ to .haiku/" >&2`
- Idempotent: re-running is a no-op if new path already exists
- Does NOT migrate intent directories (that's unit-13)

### Step 6: Wire migration into config.sh

1. Add `source "$SCRIPT_DIR/migrate.sh"` after the existing `source` lines (line ~18 post unit-01)
2. In `load_repo_settings`, add migration call before reading settings:

```bash
load_repo_settings() {
  local repo_root="${1:-$(find_repo_root)}"
  
  # Run migration if needed (idempotent)
  hku_migrate_all "$repo_root" 2>/dev/null
  
  local settings_file="$repo_root/.haiku/settings.yml"
  # ... rest unchanged
}
```

This ensures migration runs automatically on first config load.

**Verify:** Source config.sh in a test directory with `.ai-dlc/settings.yml` → confirm `.haiku/settings.yml` created and symlink placed.

### Step 7: Final verification

```bash
# Schema cleanliness
grep -r 'ai-dlc' plugin/schemas/ --include='*.json'          # expect: 0 results
grep -r 'AI-DLC' plugin/schemas/ --include='*.json'          # expect: 0 results
grep -r '\.ai-dlc/' plugin/schemas/ --include='*.json'       # expect: 0 results

# Types cleanliness  
grep -ciE 'ai.dlc|AiDlc|AIDLC|AI_DLC' plugin/shared/src/types.ts  # expect: 0

# Migration exists
test -f plugin/lib/migrate.sh && echo "migrate.sh exists"

# Migration wired in
grep -c 'migrate' plugin/lib/config.sh                        # expect: ≥2 (source + call)

# Studio field added
jq '.properties.studio' plugin/schemas/settings.schema.json   # expect: non-null object
```

---

## Success Criteria Mapping

| # | Criterion | Step |
|---|-----------|------|
| 1 | settings.schema.json has no `ai-dlc` references | Step 2, verified Step 7 |
| 2 | settings.schema.json includes `studio` field with default `"ideation"` | Step 2 |
| 3 | All provider schemas updated | Step 3, verified Step 7 |
| 4 | types.ts has no old naming conventions | Step 4 (already clean) |
| 5 | types.ts string literals updated | Step 4 (none exist) |
| 6 | Settings migration function exists | Step 5 |
| 7 | Migration handles providers and knowledge directories | Step 5 |
| 8 | Migration runs automatically on first config load | Step 6 |
| 9 | Migration creates backward-compat symlinks | Step 5 |
| 10 | Schema validation passes after migration | Step 7 |

## Risks & Mitigations

- **Merge conflicts on config.sh:** Unit-01 heavily modified this file. Merge should be clean since this branch hasn't touched it. If conflicts arise, take unit-01's version and apply Step 6 on top.
- **Schema $id domain:** Using `haiku.dev` as the schema namespace. This is a URI identifier, not a resolvable URL — no DNS dependency.
- **Symlink on Windows/WSL:** `ln -sf` may fail silently. Migration function falls back gracefully — old path simply remains as-is without symlink.
- **`ai-dlc-review` MCP server rename:** The `visual_review` description references the MCP server name. Renaming to `haiku-review` here; the actual MCP server rename is a separate concern (plugin metadata unit or later).
