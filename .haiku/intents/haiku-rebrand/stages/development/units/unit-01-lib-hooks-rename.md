---
name: unit-01-lib-hooks-rename
type: backend
status: completed
inputs: ["knowledge/DISCOVERY.md"]
depends_on: []
bolt: 0
hat: ""
started_at: 2026-04-03T01:17:19Z
completed_at: 2026-04-03T01:17:19Z
---


# unit-01-lib-hooks-rename

## Description

Rename all identifiers in `plugin/lib/*.sh` and `plugin/hooks/*.sh` from AI-DLC naming conventions to H·AI·K·U naming conventions. This is the foundation layer — every other plugin file sources these libraries, so they must be renamed first.

## Discipline

backend - Shell script identifier and path reference replacement across the library and hooks layers.

## Domain Entities

- `plugin/lib/*.sh` — all library files (config.sh, dag.sh, deps.sh, design-blueprint.sh, detect-visual-gate.sh, hat.sh, knowledge.sh, parse.sh, resolve-design-ref.sh, run-visual-comparison.sh, state.sh, telemetry.sh, stage.sh, studio.sh). Note: `pass.sh` is listed in the guard variable rename table (row: `_DLC_PASS_SOURCED` → `_HKU_PASS_SOURCED`) — if this file still exists in the codebase, include it in the rename pass; if it was already renamed to `stage.sh`, skip that row.
- `plugin/hooks/*.sh` — all hook files (inject-context.sh, subagent-context.sh, quality-gate.sh, redirect-plan-mode.sh, session-start.sh, stop-hook.sh, enforce-iteration.sh)

## Technical Specification

### Rename Categories

All renames fall into five categories applied across every library and hook file:

#### 1. Function prefix renames (`dlc_` -> `hku_`)

| File | From | To |
|------|------|----|
| config.sh | `get_ai_dlc_config` | `get_haiku_config` |
| config.sh | `export_ai_dlc_config` | `export_haiku_config` |
| deps.sh | `dlc_require_jq` | `hku_require_jq` |
| deps.sh | `dlc_require_yq` | `hku_require_yq` |
| deps.sh | `dlc_check_deps` | `hku_check_deps` |
| deps.sh | `dlc_auto_install_deps` | `hku_auto_install_deps` |
| design-blueprint.sh | `dlc_generate_design_blueprint` | `hku_generate_design_blueprint` |
| detect-visual-gate.sh | `dlc_detect_visual_gate` | `hku_detect_visual_gate` |
| knowledge.sh | `dlc_knowledge_dir` | `hku_knowledge_dir` |
| knowledge.sh | `dlc_knowledge_exists` | `hku_knowledge_exists` |
| knowledge.sh | `dlc_knowledge_read` | `hku_knowledge_read` |
| knowledge.sh | `dlc_knowledge_read_section` | `hku_knowledge_read_section` |
| knowledge.sh | `dlc_knowledge_write` | `hku_knowledge_write` |
| knowledge.sh | `dlc_knowledge_update_section` | `hku_knowledge_update_section` |
| knowledge.sh | `dlc_knowledge_list` | `hku_knowledge_list` |
| knowledge.sh | `dlc_knowledge_load_for_hat` | `hku_knowledge_load_for_hat` |
| knowledge.sh | `_dlc_knowledge_validate_type` | `_hku_knowledge_validate_type` |
| knowledge.sh | `_dlc_knowledge_lock` | `_hku_knowledge_lock` |
| knowledge.sh | `_dlc_knowledge_unlock` | `_hku_knowledge_unlock` |
| parse.sh | `dlc_json_get` | `hku_json_get` |
| parse.sh | `dlc_json_get_raw` | `hku_json_get_raw` |
| parse.sh | `dlc_json_set` | `hku_json_set` |
| parse.sh | `dlc_json_validate` | `hku_json_validate` |
| parse.sh | `dlc_yaml_get` | `hku_yaml_get` |
| parse.sh | `dlc_yaml_get_raw` | `hku_yaml_get_raw` |
| parse.sh | `dlc_yaml_set` | `hku_yaml_set` |
| parse.sh | `dlc_yaml_to_json` | `hku_yaml_to_json` |
| parse.sh | `dlc_frontmatter_get` | `hku_frontmatter_get` |
| parse.sh | `dlc_frontmatter_set` | `hku_frontmatter_set` |
| parse.sh | `dlc_check_all_criteria` | `hku_check_all_criteria` |
| parse.sh | `dlc_check_unit_criteria` | `hku_check_unit_criteria` |
| parse.sh | `dlc_check_intent_criteria` | `hku_check_intent_criteria` |
| resolve-design-ref.sh | `dlc_discover_views` | `hku_discover_views` |
| resolve-design-ref.sh | `dlc_generate_ref_screenshots` | `hku_generate_ref_screenshots` |
| resolve-design-ref.sh | `dlc_resolve_design_ref` | `hku_resolve_design_ref` |
| run-visual-comparison.sh | `dlc_run_visual_comparison` | `hku_run_visual_comparison` |
| state.sh | `dlc_state_save` | `hku_state_save` |
| state.sh | `dlc_state_load` | `hku_state_load` |
| state.sh | `dlc_state_delete` | `hku_state_delete` |
| state.sh | `dlc_state_list` | `hku_state_list` |
| state.sh | `dlc_validate_phase` | `hku_validate_phase` |
| state.sh | `dlc_find_active_intent` | `hku_find_active_intent` |

#### 2. Telemetry function and variable renames (`aidlc_` -> `haiku_`, `_AIDLC_` -> `_HAIKU_`)

| File | From | To |
|------|------|----|
| telemetry.sh | `aidlc_telemetry_init` | `haiku_telemetry_init` |
| telemetry.sh | `aidlc_log_event` | `haiku_log_event` |
| telemetry.sh | `aidlc_record_intent_created` | `haiku_record_intent_created` |
| telemetry.sh | `aidlc_record_intent_completed` | `haiku_record_intent_completed` |
| telemetry.sh | `aidlc_record_unit_status_change` | `haiku_record_unit_status_change` |
| telemetry.sh | `aidlc_record_hat_transition` | `haiku_record_hat_transition` |
| telemetry.sh | `aidlc_record_bolt_iteration` | `haiku_record_bolt_iteration` |
| telemetry.sh | `aidlc_record_elaboration_complete` | `haiku_record_elaboration_complete` |
| telemetry.sh | `aidlc_record_followup_created` | `haiku_record_followup_created` |
| telemetry.sh | `aidlc_record_cleanup` | `haiku_record_cleanup` |
| telemetry.sh | `aidlc_record_review_decision` | `haiku_record_review_decision` |
| telemetry.sh | `aidlc_record_quality_gate` | `haiku_record_quality_gate` |
| telemetry.sh | `aidlc_record_integration_result` | `haiku_record_integration_result` |
| telemetry.sh | `aidlc_record_delivery_review` | `haiku_record_delivery_review` |
| telemetry.sh | `aidlc_record_delivery_created` | `haiku_record_delivery_created` |
| telemetry.sh | `aidlc_record_hat_failure` | `haiku_record_hat_failure` |
| telemetry.sh | `aidlc_record_worktree_event` | `haiku_record_worktree_event` |
| telemetry.sh | `_AIDLC_TELEMETRY_SOURCED` | `_HAIKU_TELEMETRY_SOURCED` |
| telemetry.sh | `_AIDLC_TELEMETRY_INIT` | `_HAIKU_TELEMETRY_INIT` |
| telemetry.sh | `_AIDLC_TELEMETRY_ENABLED` | `_HAIKU_TELEMETRY_ENABLED` |
| telemetry.sh | `_AIDLC_TELEMETRY_ENDPOINT` | `_HAIKU_TELEMETRY_ENDPOINT` |
| telemetry.sh | `_AIDLC_TELEMETRY_VERSION` | `_HAIKU_TELEMETRY_VERSION` |
| telemetry.sh | `_AIDLC_TELEMETRY_CURL_HEADERS` | `_HAIKU_TELEMETRY_CURL_HEADERS` |

Also rename telemetry event name strings: `ai_dlc.*` -> `haiku.*` (e.g., `ai_dlc.intent.created` -> `haiku.intent.created`). Update OTEL service name from `ai-dlc` to `haiku`.

#### 3. Guard variable renames (`_DLC_` -> `_HKU_`)

| File | From | To |
|------|------|----|
| deps.sh | `_DLC_DEPS_SOURCED` | `_HKU_DEPS_SOURCED` |
| design-blueprint.sh | `_DLC_DESIGN_BLUEPRINT_SOURCED` | `_HKU_DESIGN_BLUEPRINT_SOURCED` |
| design-blueprint.sh | `_DLC_ARCHETYPES_JSON` | `_HKU_ARCHETYPES_JSON` |
| detect-visual-gate.sh | `_DLC_DETECT_VISUAL_GATE_SOURCED` | `_HKU_DETECT_VISUAL_GATE_SOURCED` |
| hat.sh | `_DLC_HAT_SOURCED` | `_HKU_HAT_SOURCED` |
| knowledge.sh | `_DLC_KNOWLEDGE_SOURCED` | `_HKU_KNOWLEDGE_SOURCED` |
| knowledge.sh | `_DLC_KNOWLEDGE_SCRIPT_DIR` | `_HKU_KNOWLEDGE_SCRIPT_DIR` |
| knowledge.sh | `_DLC_KNOWLEDGE_TYPES` | `_HKU_KNOWLEDGE_TYPES` |
| parse.sh | `_DLC_PARSE_SOURCED` | `_HKU_PARSE_SOURCED` |
| pass.sh | `_DLC_PASS_SOURCED` | `_HKU_PASS_SOURCED` |
| run-visual-comparison.sh | `_DLC_RUN_VISUAL_COMPARISON_SOURCED` | `_HKU_RUN_VISUAL_COMPARISON_SOURCED` |
| resolve-design-ref.sh | `_DLC_RESOLVE_DESIGN_REF_SOURCED` | `_HKU_RESOLVE_DESIGN_REF_SOURCED` |
| state.sh | `_DLC_STATE_SOURCED` | `_HKU_STATE_SOURCED` |

#### 4. Environment variable renames (`AI_DLC_` -> `HAIKU_`)

| File | From | To |
|------|------|----|
| config.sh | `AI_DLC_DEFAULT_CHANGE_STRATEGY` | `HAIKU_DEFAULT_CHANGE_STRATEGY` |
| config.sh | `AI_DLC_DEFAULT_ELABORATION_REVIEW` | `HAIKU_DEFAULT_ELABORATION_REVIEW` |
| config.sh | `AI_DLC_DEFAULT_BRANCH` | `HAIKU_DEFAULT_BRANCH` |
| config.sh | `AI_DLC_CHANGE_STRATEGY` | `HAIKU_CHANGE_STRATEGY` |
| config.sh | `AI_DLC_ELABORATION_REVIEW` | `HAIKU_ELABORATION_REVIEW` |
| config.sh | `AI_DLC_AUTO_MERGE` | `HAIKU_AUTO_MERGE` |
| config.sh | `AI_DLC_AUTO_SQUASH` | `HAIKU_AUTO_SQUASH` |
| config.sh | `AI_DLC_VCS` | `HAIKU_VCS` |

#### 5. Path reference renames (`.ai-dlc/` -> `.haiku/`, `ai-dlc/` branch prefix -> `haiku/`)

Every occurrence in lib and hook files:

| Pattern | Replacement |
|---------|-------------|
| `.ai-dlc/settings.yml` | `.haiku/settings.yml` |
| `.ai-dlc/{slug}/` | `.haiku/intents/{slug}/` |
| `.ai-dlc/knowledge/` | `.haiku/knowledge/` |
| `.ai-dlc/providers/` | `.haiku/providers/` |
| `.ai-dlc/worktrees/` | `.haiku/worktrees/` |
| `.ai-dlc/hats/` | `.haiku/hats/` |
| `.ai-dlc/ELABORATION.md` | `.haiku/ELABORATION.md` |
| `.ai-dlc/pressure-tests/` | `.haiku/pressure-tests/` |
| `.ai-dlc/seeds/` | `.haiku/seeds/` |
| `ai-dlc/{slug}/` branch prefix | `haiku/{slug}/` branch prefix |
| `ai-dlc/*/main` worktree pattern | `haiku/*/main` worktree pattern |
| Error/log messages containing `ai-dlc:` | `haiku:` |

### Execution Order

1. Rename all identifiers in `plugin/lib/*.sh` (libraries first — sourced by everything)
2. Rename all identifiers in `plugin/hooks/*.sh` (hooks source libraries)
3. Update all cross-references (hooks calling library functions by new names)
4. Verify no remaining old-convention identifiers via grep sweep

### Verification

```bash
grep -r 'dlc_' plugin/lib/ --include='*.sh'          # 0 results
grep -r '_DLC_' plugin/lib/ --include='*.sh'          # 0 results
grep -r 'aidlc_' plugin/ --include='*.sh'             # 0 results
grep -r '_AIDLC_' plugin/ --include='*.sh'            # 0 results
grep -r 'AI_DLC_' plugin/ --include='*.sh'            # 0 results
grep -r 'ai_dlc\.' plugin/ --include='*.sh'           # 0 results
grep -r '\.ai-dlc/' plugin/lib/ --include='*.sh'      # 0 results
grep -r '\.ai-dlc/' plugin/hooks/ --include='*.sh'    # 0 results
```

### Not in Scope

- SKILL.md files (unit-02)
- Schema files (unit-03)
- Plugin metadata plugin.json / hooks.json (unit-02)
- Documentation, paper, website (later units)
- Architectural changes (studios, persistence, etc.)

## Success Criteria

- [x] Zero `dlc_` function prefixes remain in `plugin/lib/*.sh` (grep returns 0)
- [x] Zero `_DLC_` guard variables remain in `plugin/lib/*.sh` (grep returns 0)
- [x] Zero `aidlc_` or `_AIDLC_` prefixes remain in `plugin/**/*.sh` (grep returns 0)
- [x] Zero `AI_DLC_` environment variables remain in `plugin/lib/config.sh` (grep returns 0)
- [x] Zero `ai_dlc.*` telemetry event names remain (grep returns 0)
- [x] Zero `.ai-dlc/` path references remain in `plugin/lib/*.sh` and `plugin/hooks/*.sh` (grep returns 0)
- [x] Zero `ai-dlc/` branch prefix references remain in hooks (grep returns 0)
- [x] All hook files source renamed library functions correctly
- [x] Plugin loads without `source` errors (functions resolve)

## Risks

- **Cross-file call sites**: Library functions are called from hooks and from each other. Every call site must update, not just definitions. Mitigation: grep for each old function name across all `.sh` files after rename.
- **Partial renames**: Renaming `dlc_` could hit `_dlc_` private functions or miss compound names. Mitigation: the tables above are exhaustive — use them as a checklist.
- **Shell quoting**: Some function names appear inside strings or variable interpolation. Mitigation: search for both bare and quoted references.

## Boundaries

This unit touches ONLY `plugin/lib/*.sh` and `plugin/hooks/*.sh`. It does NOT modify SKILL.md files, schemas, plugin metadata, documentation, or architecture. It is purely an identifier and path reference rename at the shell layer.
