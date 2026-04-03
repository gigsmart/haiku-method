# Tactical Plan: unit-01-lib-hooks-rename

**Unit:** unit-01-lib-hooks-rename
**Bolt:** 1
**Scope:** `plugin/lib/*.sh` and `plugin/hooks/*.sh` only

## Rename Inventory

### Category 1: Function prefix `dlc_` → `hku_` (36 distinct functions, ~213 occurrences)

| Function (old) | Function (new) | Files |
|---|---|---|
| `dlc_require_jq` | `hku_require_jq` | deps.sh, config.sh, design-blueprint.sh |
| `dlc_require_yq` | `hku_require_yq` | deps.sh, config.sh |
| `dlc_check_deps` | `hku_check_deps` | deps.sh, detect-visual-gate.sh, resolve-design-ref.sh, run-visual-comparison.sh, + ALL hooks |
| `dlc_auto_install_deps` | `hku_auto_install_deps` | deps.sh |
| `dlc_json_get` | `hku_json_get` | parse.sh, + hooks (context-monitor, quality-gate, prompt-guard, subagent-hook, workflow-guard, redirect-plan-mode) |
| `dlc_json_get_raw` | `hku_json_get_raw` | parse.sh, subagent-hook.sh |
| `dlc_json_set` | `hku_json_set` | parse.sh, inject-context.sh |
| `dlc_json_validate` | `hku_json_validate` | parse.sh, enforce-iteration.sh, quality-gate.sh, inject-context.sh |
| `dlc_yaml_get` | `hku_yaml_get` | parse.sh, inject-context.sh |
| `dlc_yaml_get_raw` | `hku_yaml_get_raw` | parse.sh |
| `dlc_yaml_set` | `hku_yaml_set` | parse.sh |
| `dlc_yaml_to_json` | `hku_yaml_to_json` | parse.sh, config.sh |
| `dlc_frontmatter_get` | `hku_frontmatter_get` | parse.sh, hat.sh, pass.sh, dag.sh, detect-visual-gate.sh, resolve-design-ref.sh, inject-context.sh, subagent-context.sh |
| `dlc_frontmatter_set` | `hku_frontmatter_set` | parse.sh, dag.sh, inject-context.sh, enforce-iteration.sh |
| `dlc_check_all_criteria` | `hku_check_all_criteria` | parse.sh |
| `dlc_check_unit_criteria` | `hku_check_unit_criteria` | parse.sh, inject-context.sh |
| `dlc_check_intent_criteria` | `hku_check_intent_criteria` | parse.sh, enforce-iteration.sh, inject-context.sh |
| `dlc_state_save` | `hku_state_save` | state.sh, inject-context.sh |
| `dlc_state_load` | `hku_state_load` | state.sh, config.sh, enforce-iteration.sh, quality-gate.sh, inject-context.sh, subagent-context.sh, workflow-guard.sh |
| `dlc_state_delete` | `hku_state_delete` | state.sh |
| `dlc_state_list` | `hku_state_list` | state.sh |
| `dlc_validate_phase` | `hku_validate_phase` | state.sh, inject-context.sh |
| `dlc_find_active_intent` | `hku_find_active_intent` | state.sh, config.sh, enforce-iteration.sh, quality-gate.sh, inject-context.sh, subagent-context.sh, workflow-guard.sh |
| `dlc_knowledge_dir` | `hku_knowledge_dir` | knowledge.sh |
| `dlc_knowledge_exists` | `hku_knowledge_exists` | knowledge.sh |
| `dlc_knowledge_read` | `hku_knowledge_read` | knowledge.sh |
| `dlc_knowledge_read_section` | `hku_knowledge_read_section` | knowledge.sh |
| `dlc_knowledge_write` | `hku_knowledge_write` | knowledge.sh |
| `dlc_knowledge_update_section` | `hku_knowledge_update_section` | knowledge.sh |
| `dlc_knowledge_list` | `hku_knowledge_list` | knowledge.sh |
| `dlc_knowledge_load_for_hat` | `hku_knowledge_load_for_hat` | knowledge.sh |
| `dlc_generate_design_blueprint` | `hku_generate_design_blueprint` | design-blueprint.sh |
| `dlc_detect_visual_gate` | `hku_detect_visual_gate` | detect-visual-gate.sh, run-visual-comparison.sh |
| `dlc_discover_views` | `hku_discover_views` | resolve-design-ref.sh |
| `dlc_resolve_design_ref` | `hku_resolve_design_ref` | resolve-design-ref.sh, run-visual-comparison.sh |
| `dlc_generate_ref_screenshots` | `hku_generate_ref_screenshots` | resolve-design-ref.sh |
| `dlc_run_visual_comparison` | `hku_run_visual_comparison` | run-visual-comparison.sh |

**Special cases (full name renames, not prefix):**

| Function (old) | Function (new) | Files |
|---|---|---|
| `get_ai_dlc_config` | `get_haiku_config` | config.sh (definition + 3 call sites), subagent-context.sh |
| `export_ai_dlc_config` | `export_haiku_config` | config.sh (definition + stub), subagent-context.sh |

**Private functions (`_dlc_` → `_hku_`):**

| Function (old) | Function (new) | File |
|---|---|---|
| `_dlc_blueprint_write_knowledge` | `_hku_blueprint_write_knowledge` | design-blueprint.sh |
| `_dlc_knowledge_validate_type` | `_hku_knowledge_validate_type` | knowledge.sh |
| `_dlc_knowledge_lock` | `_hku_knowledge_lock` | knowledge.sh |
| `_dlc_knowledge_unlock` | `_hku_knowledge_unlock` | knowledge.sh |

### Category 2: Telemetry renames (17 functions + 6 vars + 2 private fns, ~83 occurrences)

**Functions `aidlc_` → `haiku_`:**

| Function (old) | Function (new) |
|---|---|
| `aidlc_telemetry_init` | `haiku_telemetry_init` |
| `aidlc_log_event` | `haiku_log_event` |
| `aidlc_record_intent_created` | `haiku_record_intent_created` |
| `aidlc_record_intent_completed` | `haiku_record_intent_completed` |
| `aidlc_record_unit_status_change` | `haiku_record_unit_status_change` |
| `aidlc_record_hat_transition` | `haiku_record_hat_transition` |
| `aidlc_record_bolt_iteration` | `haiku_record_bolt_iteration` |
| `aidlc_record_elaboration_complete` | `haiku_record_elaboration_complete` |
| `aidlc_record_followup_created` | `haiku_record_followup_created` |
| `aidlc_record_cleanup` | `haiku_record_cleanup` |
| `aidlc_record_review_decision` | `haiku_record_review_decision` |
| `aidlc_record_quality_gate` | `haiku_record_quality_gate` |
| `aidlc_record_integration_result` | `haiku_record_integration_result` |
| `aidlc_record_delivery_review` | `haiku_record_delivery_review` |
| `aidlc_record_delivery_created` | `haiku_record_delivery_created` |
| `aidlc_record_hat_failure` | `haiku_record_hat_failure` |
| `aidlc_record_worktree_event` | `haiku_record_worktree_event` |

**Private functions `_aidlc_` → `_haiku_`:**

| Function (old) | Function (new) |
|---|---|
| `_aidlc_epoch_nanos` | `_haiku_epoch_nanos` |
| `_aidlc_resource_attributes` | `_haiku_resource_attributes` |

**Variables `_AIDLC_` → `_HAIKU_`:**

| Variable (old) | Variable (new) |
|---|---|
| `_AIDLC_TELEMETRY_SOURCED` | `_HAIKU_TELEMETRY_SOURCED` |
| `_AIDLC_TELEMETRY_INIT` | `_HAIKU_TELEMETRY_INIT` |
| `_AIDLC_TELEMETRY_ENABLED` | `_HAIKU_TELEMETRY_ENABLED` |
| `_AIDLC_TELEMETRY_ENDPOINT` | `_HAIKU_TELEMETRY_ENDPOINT` |
| `_AIDLC_TELEMETRY_VERSION` | `_HAIKU_TELEMETRY_VERSION` |
| `_AIDLC_TELEMETRY_CURL_HEADERS` | `_HAIKU_TELEMETRY_CURL_HEADERS` |

**Event names (`ai_dlc.` → `haiku.`):** 15 distinct event names in telemetry.sh

**Service/scope names:** `"ai-dlc"` → `"haiku"` (2 occurrences: service.name + scope name in telemetry.sh)

**Files:** telemetry.sh (primary), dag.sh (caller: `aidlc_record_unit_status_change`, `aidlc_telemetry_init`, `_AIDLC_TELEMETRY_INIT`), inject-context.sh (caller: `aidlc_telemetry_init`, `aidlc_log_event`, `aidlc_record_bolt_iteration`)

### Category 3: Guard variable renames `_DLC_` → `_HKU_` (13 distinct, ~51 occurrences)

| Variable (old) | Variable (new) | File |
|---|---|---|
| `_DLC_DEPS_SOURCED` | `_HKU_DEPS_SOURCED` | deps.sh |
| `_DLC_PARSE_SOURCED` | `_HKU_PARSE_SOURCED` | parse.sh |
| `_DLC_STATE_SOURCED` | `_HKU_STATE_SOURCED` | state.sh |
| `_DLC_HAT_SOURCED` | `_HKU_HAT_SOURCED` | hat.sh |
| `_DLC_PASS_SOURCED` | `_HKU_PASS_SOURCED` | pass.sh |
| `_DLC_KNOWLEDGE_SOURCED` | `_HKU_KNOWLEDGE_SOURCED` | knowledge.sh |
| `_DLC_KNOWLEDGE_SCRIPT_DIR` | `_HKU_KNOWLEDGE_SCRIPT_DIR` | knowledge.sh |
| `_DLC_KNOWLEDGE_TYPES` | `_HKU_KNOWLEDGE_TYPES` | knowledge.sh |
| `_DLC_DESIGN_BLUEPRINT_SOURCED` | `_HKU_DESIGN_BLUEPRINT_SOURCED` | design-blueprint.sh |
| `_DLC_ARCHETYPES_JSON` | `_HKU_ARCHETYPES_JSON` | design-blueprint.sh |
| `_DLC_DETECT_VISUAL_GATE_SOURCED` | `_HKU_DETECT_VISUAL_GATE_SOURCED` | detect-visual-gate.sh |
| `_DLC_RESOLVE_DESIGN_REF_SOURCED` | `_HKU_RESOLVE_DESIGN_REF_SOURCED` | resolve-design-ref.sh |
| `_DLC_RUN_VISUAL_COMPARISON_SOURCED` | `_HKU_RUN_VISUAL_COMPARISON_SOURCED` | run-visual-comparison.sh |

### Category 4: Environment variable renames `AI_DLC_` → `HAIKU_` (8 distinct, ~20 occurrences)

| Variable (old) | Variable (new) |
|---|---|
| `AI_DLC_DEFAULT_CHANGE_STRATEGY` | `HAIKU_DEFAULT_CHANGE_STRATEGY` |
| `AI_DLC_DEFAULT_ELABORATION_REVIEW` | `HAIKU_DEFAULT_ELABORATION_REVIEW` |
| `AI_DLC_DEFAULT_BRANCH` | `HAIKU_DEFAULT_BRANCH` |
| `AI_DLC_CHANGE_STRATEGY` | `HAIKU_CHANGE_STRATEGY` |
| `AI_DLC_ELABORATION_REVIEW` | `HAIKU_ELABORATION_REVIEW` |
| `AI_DLC_AUTO_MERGE` | `HAIKU_AUTO_MERGE` |
| `AI_DLC_AUTO_SQUASH` | `HAIKU_AUTO_SQUASH` |
| `AI_DLC_VCS` | `HAIKU_VCS` |

**File:** config.sh only

### Category 5: Path and string reference renames (~226 occurrences)

| Pattern (old) | Pattern (new) | Count | Files |
|---|---|---|---|
| `.ai-dlc/` | `.haiku/` | 72 | 15 files (lib + hooks) |
| `ai-dlc/` branch prefix | `haiku/` | 24 | dag.sh, resolve-design-ref.sh, enforce-iteration.sh, inject-context.sh, subagent-context.sh |
| `"ai-dlc:` message prefix | `"haiku:` | 114 | deps.sh, config.sh, state.sh, parse.sh, knowledge.sh, design-blueprint.sh, detect-visual-gate.sh, resolve-design-ref.sh, run-visual-comparison.sh |

**CRITICAL: Pattern ordering for `ai-dlc/` branch prefixes:**
- Must NOT match `.ai-dlc/` (already handled separately)
- Must NOT match `/ai-dlc:` (skill invocations — OUT OF SCOPE for this unit)
- Must NOT match `ai-dlc-` (team name pattern in inject-context.sh)

## Execution Steps

### Step 1: Rename identifiers in `plugin/lib/deps.sh`

**Renames:**
- Guard: `_DLC_DEPS_SOURCED` → `_HKU_DEPS_SOURCED`
- Functions: `dlc_require_jq`, `dlc_require_yq`, `dlc_check_deps`, `dlc_auto_install_deps` → `hku_*`
- Messages: `"ai-dlc:` → `"haiku:`

**Verification:** `grep -c 'dlc_\|_DLC_\|ai-dlc:' plugin/lib/deps.sh` should return 0

### Step 2: Rename identifiers in `plugin/lib/parse.sh`

**Renames:**
- Guard: `_DLC_PARSE_SOURCED` → `_HKU_PARSE_SOURCED`
- Functions: all `dlc_json_*`, `dlc_yaml_*`, `dlc_frontmatter_*`, `dlc_check_*_criteria` → `hku_*`
- Messages: `"ai-dlc:` → `"haiku:`

**Verification:** `grep -c 'dlc_\|_DLC_\|ai-dlc:' plugin/lib/parse.sh` should return 0

### Step 3: Rename identifiers in `plugin/lib/state.sh`

**Renames:**
- Guard: `_DLC_STATE_SOURCED` → `_HKU_STATE_SOURCED`
- Functions: `dlc_state_save`, `dlc_state_load`, `dlc_state_delete`, `dlc_state_list`, `dlc_validate_phase`, `dlc_find_active_intent` → `hku_*`
- Messages: `"ai-dlc:` → `"haiku:`
- Paths: `.ai-dlc/` → `.haiku/`

**Verification:** `grep -c 'dlc_\|_DLC_\|ai-dlc' plugin/lib/state.sh` should return 0

### Step 4: Rename identifiers in `plugin/lib/config.sh`

**Renames:**
- Functions: `get_ai_dlc_config` → `get_haiku_config`, `export_ai_dlc_config` → `export_haiku_config`
- Functions: `dlc_require_jq`, `dlc_require_yq`, `dlc_yaml_to_json`, `dlc_find_active_intent`, `dlc_state_load` → `hku_*`
- Env vars: all `AI_DLC_*` → `HAIKU_*`
- Paths: `.ai-dlc/` → `.haiku/`
- Messages: `"ai-dlc:` → `"haiku:` (in comment: "# config.sh - AI-DLC" stays as comment)

**Verification:** `grep -c 'dlc_\|_DLC_\|AI_DLC_\|ai-dlc[/:]' plugin/lib/config.sh` should return 0 (excluding comments)

### Step 5: Rename identifiers in `plugin/lib/telemetry.sh`

**Renames:**
- Guard: `_AIDLC_TELEMETRY_SOURCED` → `_HAIKU_TELEMETRY_SOURCED`
- Variables: all `_AIDLC_*` → `_HAIKU_*`
- Functions: all `aidlc_*` → `haiku_*`
- Private: `_aidlc_*` → `_haiku_*`
- Event names: all `ai_dlc.*` → `haiku.*`
- Service name: `"ai-dlc"` → `"haiku"` (service.name + scope name)

**Verification:** `grep -c 'aidlc_\|_AIDLC_\|ai_dlc\|"ai-dlc"' plugin/lib/telemetry.sh` should return 0

### Step 6: Rename identifiers in `plugin/lib/knowledge.sh`

**Renames:**
- Guard: `_DLC_KNOWLEDGE_SOURCED`, `_DLC_KNOWLEDGE_SCRIPT_DIR`, `_DLC_KNOWLEDGE_TYPES` → `_HKU_*`
- Functions: all `dlc_knowledge_*` → `hku_knowledge_*`
- Private: `_dlc_knowledge_*` → `_hku_knowledge_*`
- Messages: `"ai-dlc:` → `"haiku:`
- Paths: `.ai-dlc/` → `.haiku/`

**Verification:** `grep -c 'dlc_\|_DLC_\|ai-dlc' plugin/lib/knowledge.sh` should return 0

### Step 7: Rename identifiers in `plugin/lib/hat.sh`

**Renames:**
- Guard: `_DLC_HAT_SOURCED` → `_HKU_HAT_SOURCED`
- Functions: `dlc_frontmatter_get` (call site only) → `hku_frontmatter_get`
- Paths: `.ai-dlc/` → `.haiku/`

**Verification:** `grep -c 'dlc_\|_DLC_\|ai-dlc' plugin/lib/hat.sh` should return 0 (excluding comments)

### Step 8: Rename identifiers in `plugin/lib/pass.sh`

**Renames:**
- Guard: `_DLC_PASS_SOURCED` → `_HKU_PASS_SOURCED`
- Functions: `dlc_frontmatter_get` (call site only) → `hku_frontmatter_get`
- Paths: `.ai-dlc/` → `.haiku/`

**Verification:** `grep -c 'dlc_\|_DLC_\|ai-dlc' plugin/lib/pass.sh` should return 0 (excluding comments)

### Step 9: Rename identifiers in `plugin/lib/dag.sh`

**Renames:**
- Functions: `dlc_frontmatter_set`, `dlc_json_set` (call sites) → `hku_*`
- Telemetry calls: `aidlc_record_unit_status_change`, `aidlc_telemetry_init`, `_AIDLC_TELEMETRY_INIT` → `haiku_*`/`_HAIKU_*`
- Branch prefixes: `ai-dlc/` → `haiku/` (in discover_branch_intents, branch patterns)
- Paths: `.ai-dlc/` → `.haiku/`

**Verification:** `grep -c 'dlc_\|aidlc_\|_AIDLC_\|ai-dlc[/]' plugin/lib/dag.sh` should return 0 (excluding comments)

### Step 10: Rename identifiers in `plugin/lib/design-blueprint.sh`

**Renames:**
- Guard: `_DLC_DESIGN_BLUEPRINT_SOURCED`, `_DLC_ARCHETYPES_JSON` → `_HKU_*`
- Functions: `dlc_require_jq`, `dlc_generate_design_blueprint` → `hku_*`
- Private: `_dlc_blueprint_write_knowledge` → `_hku_blueprint_write_knowledge`
- Messages: `"ai-dlc:` → `"haiku:`
- Paths: `.ai-dlc/` → `.haiku/`

**Verification:** `grep -c 'dlc_\|_DLC_\|ai-dlc' plugin/lib/design-blueprint.sh` should return 0

### Step 11: Rename identifiers in `plugin/lib/detect-visual-gate.sh`

**Renames:**
- Guard: `_DLC_DETECT_VISUAL_GATE_SOURCED` → `_HKU_DETECT_VISUAL_GATE_SOURCED`
- Functions: `dlc_detect_visual_gate`, `dlc_check_deps`, `dlc_frontmatter_get` → `hku_*`
- Messages: `"ai-dlc:` → `"haiku:`

**Verification:** `grep -c 'dlc_\|_DLC_\|ai-dlc:' plugin/lib/detect-visual-gate.sh` should return 0

### Step 12: Rename identifiers in `plugin/lib/resolve-design-ref.sh`

**Renames:**
- Guard: `_DLC_RESOLVE_DESIGN_REF_SOURCED` → `_HKU_RESOLVE_DESIGN_REF_SOURCED`
- Functions: `dlc_discover_views`, `dlc_resolve_design_ref`, `dlc_generate_ref_screenshots`, `dlc_check_deps`, `dlc_frontmatter_get` → `hku_*`
- Messages: `"ai-dlc:` → `"haiku:`
- Branch prefix: `"ai-dlc/$iterates_on/main"` → `"haiku/$iterates_on/main"`
- Paths: `.ai-dlc/` → `.haiku/`

**Verification:** `grep -c 'dlc_\|_DLC_\|ai-dlc' plugin/lib/resolve-design-ref.sh` should return 0

### Step 13: Rename identifiers in `plugin/lib/run-visual-comparison.sh`

**Renames:**
- Guard: `_DLC_RUN_VISUAL_COMPARISON_SOURCED` → `_HKU_RUN_VISUAL_COMPARISON_SOURCED`
- Functions: `dlc_run_visual_comparison`, `dlc_detect_visual_gate`, `dlc_resolve_design_ref`, `dlc_check_deps` → `hku_*`
- Messages: `"ai-dlc:` → `"haiku:`
- Paths: `.ai-dlc/` → `.haiku/`

**Verification:** `grep -c 'dlc_\|_DLC_\|ai-dlc' plugin/lib/run-visual-comparison.sh` should return 0

### Step 14: Rename identifiers in ALL `plugin/hooks/*.sh`

Process each hook file, renaming:
- `dlc_*` call sites → `hku_*`
- `aidlc_*` call sites → `haiku_*`
- `_AIDLC_*` → `_HAIKU_*`
- `export_ai_dlc_config` → `export_haiku_config`
- `.ai-dlc/` → `.haiku/`
- `ai-dlc/` branch prefix → `haiku/` (in branch patterns and string literals)
- `ai-dlc:` message prefix → `haiku:` (only in echo/error messages, NOT `/ai-dlc:` skill invocations)
- `AI-DLC` in display text → `H·AI·K·U` or `HAIKU` as appropriate

**Hook files and their specific renames:**

| File | Categories |
|---|---|
| `context-monitor.sh` | dlc_ calls, .ai-dlc/ paths, display text |
| `enforce-iteration.sh` | dlc_ calls, .ai-dlc/ paths, ai-dlc/ branch patterns, display text |
| `ensure-deps.sh` | No dlc_ identifiers (standalone) — only display text "AI-DLC" |
| `inject-context.sh` | dlc_ calls, aidlc_ calls, .ai-dlc/ paths, ai-dlc/ branch patterns, display text |
| `prompt-guard.sh` | dlc_ calls, .ai-dlc/ paths |
| `quality-gate.sh` | dlc_ calls |
| `redirect-plan-mode.sh` | dlc_ calls, display text (keep `/ai-dlc:elaborate` skill refs) |
| `subagent-context.sh` | dlc_ calls, export_ai_dlc_config, .ai-dlc/ paths, ai-dlc/ branch patterns, display text |
| `subagent-hook.sh` | dlc_ calls |
| `workflow-guard.sh` | dlc_ calls |

**CRITICAL: `/ai-dlc:` skill invocation references are OUT OF SCOPE.** Do not rename these — skill names are defined in SKILL.md files which are not part of this unit.

**Verification:** For each hook: `grep -c 'dlc_\|_DLC_\|aidlc_\|_AIDLC_\|AI_DLC_' <file>` should return 0

### Step 15: Final verification sweep

Run these commands from the worktree root:

```bash
# Category 1: Zero dlc_ function prefixes
grep -rn '\bdlc_' plugin/lib/*.sh plugin/hooks/*.sh | grep -v '^[^:]*:#' | wc -l
# Expected: 0

# Category 2: Zero aidlc_ or _AIDLC_ prefixes  
grep -rn 'aidlc_\|_AIDLC_' plugin/lib/*.sh plugin/hooks/*.sh | wc -l
# Expected: 0

# Category 3: Zero _DLC_ guard variables
grep -rn '_DLC_' plugin/lib/*.sh plugin/hooks/*.sh | wc -l
# Expected: 0

# Category 4: Zero AI_DLC_ env vars
grep -rn 'AI_DLC_' plugin/lib/*.sh plugin/hooks/*.sh | wc -l
# Expected: 0

# Category 5a: Zero ai_dlc. event names
grep -rn 'ai_dlc\.' plugin/lib/*.sh plugin/hooks/*.sh | wc -l
# Expected: 0

# Category 5b: Zero .ai-dlc/ path references
grep -rn '\.ai-dlc/' plugin/lib/*.sh plugin/hooks/*.sh | wc -l
# Expected: 0

# Category 5c: Zero ai-dlc/ branch prefix references (excluding /ai-dlc: skill refs)
grep -rn 'ai-dlc/' plugin/lib/*.sh plugin/hooks/*.sh | grep -v '/ai-dlc:' | grep -v '\.ai-dlc/' | grep -v 'ai-dlc-' | wc -l
# Expected: 0

# Category 5d: Confirm new identifiers exist
grep -rc 'hku_' plugin/lib/*.sh | grep -v ':0$' | wc -l
# Expected: ≥ 11 (all lib files with public functions)

# Cross-reference: hooks call library functions by new names
grep -rn 'hku_check_deps\|hku_json_get\|hku_state_load\|hku_find_active_intent' plugin/hooks/*.sh | wc -l
# Expected: > 0

# Source validation: try sourcing each lib file
for f in plugin/lib/deps.sh plugin/lib/parse.sh plugin/lib/state.sh plugin/lib/config.sh; do
  bash -n "$f" 2>&1 && echo "OK: $f" || echo "FAIL: $f"
done
```

### Step 16: Commit

```
refactor(haiku-rebrand): rename all identifiers in plugin/lib/*.sh and plugin/hooks/*.sh

Rename categories:
- dlc_ → hku_ (36 functions + 4 private)
- get_ai_dlc_config → get_haiku_config, export_ai_dlc_config → export_haiku_config
- aidlc_ → haiku_ (17 telemetry functions + 2 private)
- _AIDLC_ → _HAIKU_ (6 telemetry variables)
- _DLC_ → _HKU_ (13 guard variables)
- AI_DLC_ → HAIKU_ (8 environment variables)
- ai_dlc.* → haiku.* (15 telemetry event names)
- .ai-dlc/ → .haiku/ (path references)
- ai-dlc/ → haiku/ (branch prefixes)
- ai-dlc: → haiku: (error/log message prefixes)
```

## Sed Pattern Ordering (CRITICAL)

When applying sed substitutions to a file, use this order to avoid partial matches:

1. `get_ai_dlc_config` → `get_haiku_config` (longest specific match first)
2. `export_ai_dlc_config` → `export_haiku_config`
3. `AI_DLC_` → `HAIKU_` (all-caps env vars)
4. `_AIDLC_` → `_HAIKU_` (telemetry guard/vars)
5. `_aidlc_` → `_haiku_` (telemetry private fns)
6. `aidlc_` → `haiku_` (telemetry public fns)
7. `_dlc_` → `_hku_` (private lib fns)
8. `_DLC_` → `_HKU_` (guard vars)
9. `dlc_` → `hku_` (public lib fns — most general, LAST)
10. `ai_dlc\.` → `haiku.` (event name strings)
11. `"ai-dlc"` → `"haiku"` (service/scope names)
12. `\.ai-dlc/` → `.haiku/` (path references — use `\.` to anchor)
13. Branch prefix: `ai-dlc/` → `haiku/` (context-sensitive — only in branch patterns, NOT after `.` or `/`)
14. `"ai-dlc:` → `"haiku:` (message prefixes)

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Partial rename in `_dlc_` private functions** | Apply `_dlc_` before `dlc_` in sed ordering |
| **`/ai-dlc:` skill invocations accidentally renamed** | Exclude `/ai-dlc:` from branch prefix and message prefix patterns |
| **`ai-dlc-` team name pattern renamed** | Exclude `ai-dlc-` from branch prefix rename |
| **Shell quoting breaks with sed** | Use `replace_all` Edit tool or `sed -i` with proper escaping |
| **Cross-file call sites missed** | Run final verification sweep (Step 15) |
| **Comments with `AI-DLC` display text** | Rename file header comments to say `H·AI·K·U` or `HAIKU` as appropriate |
| **haiku.sh has no dlc_ identifiers** | haiku.sh uses `haiku_` naming already — no renames needed, just `.ai-dlc/` → `.haiku/` if present |

## Out-of-Scope Reminders

- `/ai-dlc:*` skill invocation references (defined in SKILL.md files)
- `CLAUDE_PLUGIN_ROOT` environment variable (set by Claude Code harness)
- `plugin/.claude-plugin/plugin.json` (metadata, not in scope)
- Files outside `plugin/lib/*.sh` and `plugin/hooks/*.sh`
- `plugin/lib/haiku.sh` already uses `haiku_` prefix — verify no `.ai-dlc/` paths need changing
