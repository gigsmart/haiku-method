---
name: unit-02-hat-augmentation
type: backend
status: completed
inputs: ["knowledge/DISCOVERY.md"]
depends_on: [unit-01-pass-definitions]
bolt: 0
hat: ""
started_at: 2026-03-31T20:08:07Z
completed_at: 2026-03-31T20:08:07Z
---


# unit-02-hat-augmentation

## Description

Change the hat resolution pattern from override to augmentation in both `inject-context.sh` and `subagent-context.sh`. Plugin hats become canonical — project hats with matching names append instructions rather than replacing them. Project hats with new names remain standalone custom hats.

## Domain Entities

- **Hat**: Plugin-defined hats at `plugin/hats/*.md` are canonical. Project hats at `.ai-dlc/hats/*.md` either augment (same name) or define new custom hats (new name).

## Data Sources

- `plugin/hooks/inject-context.sh` lines 614-665 — current override resolution logic
- `plugin/hooks/subagent-context.sh` lines 185-192 — current override resolution logic
- `plugin/hats/*.md` — plugin built-in hats
- `.ai-dlc/hats/*.md` — project hats (currently override, will become augmentation)

## Technical Specification

### 1. Change `inject-context.sh` hat resolution (lines 614-665)

Current pattern (REPLACE THIS):
```bash
if [ -f ".ai-dlc/hats/${HAT}.md" ]; then
  HAT_FILE=".ai-dlc/hats/${HAT}.md"
elif [ -n "$PLUGIN_ROOT" ] && [ -f "${PLUGIN_ROOT}/hats/${HAT}.md" ]; then
  HAT_FILE="${PLUGIN_ROOT}/hats/${HAT}.md"
fi
```

New pattern:
```bash
# Always load plugin hat first (canonical)
PLUGIN_HAT_FILE=""
PROJECT_HAT_FILE=""

if [ -n "$PLUGIN_ROOT" ] && [ -f "${PLUGIN_ROOT}/hats/${HAT}.md" ]; then
  PLUGIN_HAT_FILE="${PLUGIN_ROOT}/hats/${HAT}.md"
fi

if [ -f ".ai-dlc/hats/${HAT}.md" ]; then
  PROJECT_HAT_FILE=".ai-dlc/hats/${HAT}.md"
fi
```

When rendering hat instructions:
- If both exist: render plugin hat instructions, then append project hat body under `## Project Augmentation`
- If only plugin exists: render plugin hat instructions (current behavior for built-in hats)
- If only project exists: render project hat instructions (custom hat, not augmenting anything)
- If neither exists: show "Custom hat — no instructions found" message (existing behavior)

### 2. Change `subagent-context.sh` hat resolution (lines 185-192)

Apply the same augmentation pattern. Current code:
```bash
if [ -f ".ai-dlc/hats/${HAT}.md" ]; then
  HAT_FILE=".ai-dlc/hats/${HAT}.md"
elif [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md" ]; then
  HAT_FILE="${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md"
fi
```

Change to load both files and merge instructions using the same augmentation logic.

### 3. Shared augmentation helper

Since both hooks need the same merge logic, extract a shared function. Options:
- Add to `plugin/lib/pass.sh` (created in unit-01) as a generic `load_augmented_instructions` function
- Or inline in both hooks if the logic is simple enough (read plugin body, read project body, concatenate with heading)

The function signature:
```bash
# load_augmented_instructions <plugin_file> <project_file>
# Returns: plugin instructions + optional "## Project Augmentation\n{project instructions}"
```

### 4. Update execute skill hat resolution

The execute skill (`plugin/skills/execute/SKILL.md`) also resolves hats at lines 643-648 and 760-765 using the same override pattern. Update these to use the same augmentation pattern, or reference the shared function.

## Success Criteria

- [x] Plugin hat is always loaded when it exists — project hat with same name never replaces it
- [x] Project hat with same name as plugin hat: its body is appended under `## Project Augmentation` heading
- [x] Project hat with new name (no plugin match): loaded as standalone custom hat
- [x] When neither plugin nor project hat exists: existing "no instructions found" message is preserved
- [x] `inject-context.sh` uses augmentation pattern
- [x] `subagent-context.sh` uses augmentation pattern
- [x] `execute/SKILL.md` hat resolution references use augmentation pattern

## Risks

- **Breaking existing project hats**: Projects currently using `.ai-dlc/hats/builder.md` as a full replacement will now see their instructions appended to the plugin builder instead. Mitigation: this is the intended behavior change — project instructions augment rather than replace.
- **Duplicate instructions**: If a project hat copies plugin instructions and adds to them, the augmented output will have duplicates. Mitigation: document that project hat files should contain ONLY additional instructions, not copies of plugin instructions.

## Boundaries

This unit changes hat resolution ONLY. It does NOT:
- Create pass definition files (unit-01)
- Inject pass context into hooks (unit-03)
- Update elaborate or execute skill logic beyond hat resolution (unit-04, unit-05)

## Notes

- The provider loading pattern in `config.sh` (`load_provider_instructions`) is the precedent — it loads plugin markdown first, then merges project overrides. Study that implementation.
- The "## Project Augmentation" heading helps agents distinguish between canonical and project-added instructions.
- Also update the fallback "Create a hat definition at..." message to explain augmentation: "To augment an existing hat, create `.ai-dlc/hats/{hat}.md` with additional instructions."
