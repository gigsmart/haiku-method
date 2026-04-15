---
name: unit-02-migrate-hooks
status: pending
depends_on: []
bolt: 0
hat: ''
started_at: null
completed_at: null
---


# unit-02-migrate-hooks

## Description
Replace all `han keep`, `han parse`, and `han hook` calls in executable hook scripts and library files with the new foundation libraries (deps.sh, parse.sh, state.sh). This is the critical migration unit — 106 references across 12 files.

## Discipline
backend - Shell script migration.

## Domain Entities
- **Hook files** (8 files, ~90 han references): inject-context.sh (41), subagent-context.sh (21), enforce-iteration.sh (15), workflow-guard.sh (5), prompt-guard.sh (3), context-monitor.sh (3), redirect-plan-mode.sh (1), hooks.json (1)
- **Library files** (2 files, ~14 han references): dag.sh (10), config.sh (4)
- **Config files** (2 files): hooks.json, han-plugin.yml

## Technical Specification

### Migration Pattern: han parse json
Replace every `han parse json` call with the corresponding `dlc_json_get` function from parse.sh:
```bash
# Before:
FIELD=$(echo "$JSON" | han parse json field -r --default "val" 2>/dev/null || echo "val")
# After:
FIELD=$(echo "$JSON" | dlc_json_get "field" "val")
```

For raw JSON extraction (arrays/objects):
```bash
# Before:
ARRAY=$(echo "$JSON" | han parse json field 2>/dev/null || echo '[]')
# After:
ARRAY=$(echo "$JSON" | dlc_json_get_raw "field")
```

For JSON validation:
```bash
# Before:
echo "$JSON" | han parse json-validate --quiet 2>/dev/null
# After:
echo "$JSON" | dlc_json_validate
```

### Migration Pattern: han parse yaml
```bash
# Before:
STATUS=$(han parse yaml status -r --default pending < "$file" 2>/dev/null || echo "pending")
# After:
STATUS=$(dlc_yaml_get "status" "pending" < "$file")
```

For frontmatter in .md files:
```bash
# Before:
han parse yaml-set status "$new_status" < "$file" > "$file.tmp" && mv "$file.tmp" "$file"
# After:
dlc_frontmatter_set "status" "$new_status" "$file"
```

### Migration Pattern: han keep
```bash
# Before:
ITERATION_JSON=$(han keep load iteration.json --quiet 2>/dev/null || echo "")
# After:
INTENT_DIR=$(dlc_find_active_intent)
ITERATION_JSON=$(dlc_state_load "$INTENT_DIR" "iteration.json")
```

```bash
# Before:
han keep save iteration.json "$STATE"
# After:
dlc_state_save "$INTENT_DIR" "iteration.json" "$STATE"
```

### Migration Pattern: han hook
In hooks.json, replace:
```json
"command": "han hook wrap-subagent-context --context-command 'bash \"${CLAUDE_PLUGIN_ROOT}/hooks/subagent-context.sh\"'"
```
With direct invocation:
```json
"command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/subagent-context.sh\""
```
Note: Investigate what `han hook wrap-subagent-context` actually does (likely JSON output formatting) and replicate that behavior in subagent-context.sh directly if needed.

### Source Dependencies
Every hook file must add near the top (replacing the current `command -v han` check):
```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
source "${PLUGIN_ROOT}/lib/deps.sh"
source "${PLUGIN_ROOT}/lib/parse.sh"
source "${PLUGIN_ROOT}/lib/state.sh"
dlc_check_deps || exit 2
```

### File-by-file scope
| File | han keep | han parse | han hook | Total |
|------|----------|-----------|----------|-------|
| inject-context.sh | 10 save/load | 30 json/yaml | 0 | 41 |
| subagent-context.sh | 5 load | 15 json/yaml | 0 | 21 |
| enforce-iteration.sh | 4 load | 10 json | 0 | 15 |
| dag.sh | 0 | 10 yaml/yaml-set | 0 | 10 |
| workflow-guard.sh | 2 load | 3 json | 0 | 5 |
| config.sh | 1 load | 3 yaml | 0 | 4 |
| prompt-guard.sh | 0 | 3 json | 0 | 3 |
| context-monitor.sh | 0 | 3 json | 0 | 3 |
| redirect-plan-mode.sh | 0 | 1 json | 0 | 1 |
| hooks.json | 0 | 0 | 1 | 1 |
| han-plugin.yml | 0 | 0 | 0 | 1 (comment) |

## Success Criteria
- [ ] Zero `han keep`, `han parse`, or `han hook` calls remain in any .sh or .json file under plugin/hooks/ or plugin/lib/
- [ ] All hooks source deps.sh/parse.sh/state.sh instead of checking for `han`
- [ ] inject-context.sh correctly loads/saves state from .ai-dlc/{slug}/state/ files
- [ ] subagent-context.sh reads iteration state without `han keep`
- [ ] enforce-iteration.sh reads iteration state without `han keep`
- [ ] dag.sh updates unit frontmatter via `dlc_frontmatter_set` (not `han parse yaml-set`)
- [ ] hooks.json invokes subagent-context.sh directly (no `han hook` wrapper)
- [ ] Existing hook behavior is preserved (same outputs, same exit codes)

## Risks
- **inject-context.sh is complex** (41 references, largest hook): High surface area for bugs. Mitigation: Migrate systematically top-to-bottom, test after each major section.
- **han hook wrapper behavior unknown**: `han hook wrap-subagent-context` may do JSON formatting or error handling. Mitigation: Test subagent-context.sh output with and without the wrapper to understand the delta.
- **State directory bootstrapping**: First run after migration won't have .ai-dlc/{slug}/state/ directory. Mitigation: dlc_state_save creates it, and hooks handle empty returns gracefully (|| echo "" fallbacks are preserved).

## Boundaries
This unit migrates executable code ONLY (hooks + libs). It does NOT update skill or hat documentation — those are Units 3 and 4. It does NOT simplify iteration.json — that's Unit 5.

## Notes
- Start with the smallest hooks (redirect-plan-mode.sh, prompt-guard.sh) to validate the migration pattern, then tackle inject-context.sh
- Preserve all `2>/dev/null || echo ""` fallback patterns during migration
- config.sh already uses jq directly — only the 4 han parse yaml calls need migration
