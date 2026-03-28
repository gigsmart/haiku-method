---
status: pending
last_updated: ""
depends_on: []
branch: ai-dlc/remove-hankeep-improve-state/01-foundation-libraries
discipline: backend
pass: ""
workflow: ""
ticket: ""
---

# unit-01-foundation-libraries

## Description
Create the three utility libraries that replace the `han` CLI dependency: dependency validation (`deps.sh`), JSON/YAML parsing (`parse.sh`), and file-based state management (`state.sh`). These form the foundation that all other units build on.

## Discipline
backend - Shell library code.

## Domain Entities
- **deps.sh**: Validates `jq` (v1.7+) and `yq` (mikefarah/Go v4+) are installed. Provides `dlc_check_deps()` for hook entry points, `dlc_auto_install_deps()` for guided installation. On failure, exits with code 2 (stderr only, no stdout pollution per Claude Code hook convention).
- **parse.sh**: Thin wrappers around `jq` and `yq` matching the `han parse` API surface:
  - `dlc_json_get <field> [default]` — pipe JSON stdin, extract field (replaces `han parse json field -r --default val`)
  - `dlc_json_get_raw <field>` — same but returns raw JSON (arrays/objects)
  - `dlc_json_set <field> <value>` — pipe JSON stdin, set field, output to stdout
  - `dlc_json_validate` — validate JSON on stdin (replaces `han parse json-validate`)
  - `dlc_yaml_get <field> [default]` — extract from YAML stdin (replaces `han parse yaml field -r`)
  - `dlc_yaml_get_raw <field>` — returns raw YAML
  - `dlc_yaml_set <field> <value> <file>` — update YAML/frontmatter in-place (replaces `han parse yaml-set`)
  - `dlc_yaml_to_json` — convert YAML stdin to JSON (replaces `han parse yaml-to-json`)
  - `dlc_frontmatter_get <field> <file>` — extract from markdown frontmatter
  - `dlc_frontmatter_set <field> <value> <file>` — update markdown frontmatter in-place using `yq --front-matter=process`
- **state.sh**: File-based state management replacing `han keep`. State files live at `.ai-dlc/{intent-slug}/state/`:
  - `dlc_state_save <intent_dir> <key> <content>` — atomic write (tmp + mv)
  - `dlc_state_load <intent_dir> <key>` — read file, return empty string if missing
  - `dlc_state_delete <intent_dir> <key>` — remove state file
  - `dlc_state_list <intent_dir>` — list state keys
  - `dlc_find_active_intent` — scan `.ai-dlc/*/intent.md` for `status: active`, return directory path

## Data Sources
- Existing `plugin/lib/state.sh` — has stub functions, needs completion
- Existing `plugin/lib/config.sh` — reference for jq usage patterns
- `han parse` command reference in intent.md — documents all subcommands to replace

## Technical Specification

### deps.sh
Located at `plugin/lib/deps.sh`. Sourced by hooks at entry point.
- `dlc_check_deps()`: Check `command -v jq` and `command -v yq`. For yq, verify mikefarah version via `yq --version` (should contain "mikefarah"). On missing deps: print install instructions to stderr (brew for macOS, apt for Debian, go install for yq) and `exit 2`. On success: return 0 silently.
- `dlc_require_jq()`: Check just jq.
- `dlc_require_yq()`: Check just yq (mikefarah).
- `dlc_auto_install_deps()`: Attempt `brew install jq yq` on macOS, fall back to printing manual instructions.

### parse.sh
Located at `plugin/lib/parse.sh`. Sourced by hooks and libs that need parsing.
- Sources `deps.sh` for dependency validation.
- All functions handle errors gracefully: return default/empty on failure, never crash the hook.
- `dlc_json_get` uses `jq -r ".\($field) // \"\($default)\""` pattern.
- `dlc_yaml_set` detects `.md` files and uses `yq --front-matter=process`, uses plain `yq -i` for `.yml`/`.yaml` files.
- `dlc_frontmatter_get` uses `yq --front-matter=extract` for markdown files.

### state.sh
Located at `plugin/lib/state.sh`. Replaces `han keep save/load/delete`.
- State directory: `.ai-dlc/{intent-slug}/state/` (created on first write).
- All writes are atomic: `printf '%s' "$content" > "${file}.tmp" && mv "${file}.tmp" "$file"`.
- `dlc_find_active_intent`: Scans `.ai-dlc/*/intent.md`, uses `dlc_frontmatter_get` to check `status: active`. Returns the FIRST active intent directory. Handles zero matches (returns empty).
- Must work from any working directory (uses `git rev-parse --show-toplevel` to find repo root).

## Success Criteria
- [ ] `dlc_check_deps` correctly detects missing jq and prints install instructions to stderr
- [ ] `dlc_check_deps` correctly detects wrong yq variant (kislyuk vs mikefarah)
- [ ] `dlc_check_deps` returns 0 silently when both deps are present
- [ ] `dlc_json_get "field" "default"` extracts fields from JSON with default fallback
- [ ] `dlc_yaml_get "field"` extracts fields from YAML
- [ ] `dlc_yaml_set "field" "value" "file.md"` updates frontmatter in markdown files
- [ ] `dlc_frontmatter_get "status" "intent.md"` returns the status from frontmatter
- [ ] `dlc_state_save` writes atomically (no partial writes on crash)
- [ ] `dlc_state_load` returns empty string for missing keys (no errors)
- [ ] `dlc_find_active_intent` discovers active intents from any working directory

## Risks
- **yq version detection**: `yq --version` output format varies between versions. Mitigation: check for "mikefarah" string presence, not exact format.
- **Frontmatter edge cases**: Some .md files have complex frontmatter (arrays, nested objects). Mitigation: test with actual unit-*.md and intent.md files from the repo.
- **State directory creation**: First state write needs `mkdir -p`. Mitigation: `dlc_state_save` always creates the directory before writing.

## Boundaries
This unit creates the libraries only. It does NOT migrate any existing hook or skill code — that's Units 2-4.

## Notes
- Match existing code style in plugin/lib/ (bash, no set -e, graceful error handling)
- Source deps.sh at the top of parse.sh so dependency checks cascade
- The existing state.sh has stub functions — preserve the file structure and enhance in-place
