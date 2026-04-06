---
name: unit-01-quality-gate-hook
type: backend
status: completed
depends_on: []
bolt: 0
hat: ""
started_at: null
completed_at: null
---


# unit-01-quality-gate-hook

## Description
Create `plugin/hooks/quality-gate.sh` — a Stop/SubagentStop hook that reads `quality_gates:` from intent and unit YAML frontmatter, runs each gate command, and blocks the agent from stopping if any gate fails. This is the core enforcement mechanism that removes the agent from its own trust chain.

## Discipline
backend - Shell script implementing the gate enforcement logic.

## Domain Entities
- **Quality Gate**: A `{name, command}` pair in YAML frontmatter. `command` is a shell command that must exit 0.
- **Hook Registration** (`hooks/hooks.json`): Updated to register quality-gate.sh for Stop and SubagentStop.
- **iteration.json**: Read for `hat` and `currentUnit` to determine enforcement context.
- **Intent frontmatter**: Source of intent-level `quality_gates:` list.
- **Unit frontmatter**: Source of unit-level `quality_gates:` list (additive to intent).

## Data Sources
- **CC Hook stdin** (JSON):
  ```json
  {
    "session_id": "...",
    "hook_event_name": "Stop|SubagentStop",
    "stop_hook_active": true|false,
    "cwd": "/path",
    "agent_id": "...",
    "agent_type": "..."
  }
  ```
- **iteration.json** (via `dlc_state_load`): `hat`, `currentUnit`, `status`
- **intent.md frontmatter** (via `dlc_frontmatter_get`): `quality_gates` list
- **unit-NN-*.md frontmatter** (via `dlc_frontmatter_get`): `quality_gates` list

## Technical Specification

### quality-gate.sh Script

```bash
#!/bin/bash
# quality-gate.sh - Stop/SubagentStop hook
# Enforces quality gates defined in intent/unit frontmatter.
# Blocks agent from stopping if any gate command returns non-zero.
```

**Algorithm:**

1. **Read stdin payload** — parse `stop_hook_active`, `hook_event_name`
2. **Early exits** (exit 0, allow stop):
   - `dlc_check_deps` fails (AI-DLC not active/available)
   - No active intent found (`dlc_find_active_intent` returns empty)
   - iteration.json doesn't exist or has no `hat` field
   - `hat` is NOT in the building role set: `{builder, implementer, refactorer}`
   - `status` is `completed` or `blocked`
   - `stop_hook_active` is `true` (already blocked once — allow through to prevent infinite loop)
3. **Find current unit** — read `currentUnit` from iteration.json, locate the unit file
4. **Load intent-level gates** — parse `quality_gates` from intent.md frontmatter as YAML list
5. **Load unit-level gates** — parse `quality_gates` from current unit's frontmatter as YAML list
6. **Merge gates** — concatenate intent gates + unit gates (additive, no deduplication)
7. **If no gates defined** — exit 0 (allow stop)
8. **Run each gate** — for each `{name, command}`:
   - Run `command` via `bash -c "$command"` with a timeout (30 seconds)
   - Capture stdout+stderr and exit code
   - Record pass/fail
9. **If all pass** — exit 0 (allow stop)
10. **If any fail** — output JSON to stdout and exit 0:
    ```json
    {
      "decision": "block",
      "reason": "Quality gates failed:\n\n## FAILED: {gate_name}\nCommand: {command}\nExit code: {code}\nOutput:\n```\n{output}\n```\n\n{repeat for each failure}\n\nFix the failures and try again."
    }
    ```

**Key design choices:**

- **`stop_hook_active` guard**: When true, a previous Stop hook already blocked this session and the agent continued. If we block again, we risk an infinite loop (especially for nested subagents that can't fix the gates). Allow through on retry.
- **Building hats only**: Only `builder`, `implementer`, `refactorer` hats are enforced. Planner, reviewer, designer, etc. don't produce code changes that need gate validation.
- **Exit 0 + JSON**: Preferred over exit 2 because it allows structured failure output with gate names, commands, and error text.
- **30-second timeout per gate**: Prevents hung commands from blocking the hook indefinitely. Use `timeout 30 bash -c "$command"` or equivalent.
- **cwd**: Gates run in the current working directory (the worktree), which should be the project root where test/lint commands expect to run.

### Parsing quality_gates from frontmatter

The `quality_gates:` field is a YAML list in frontmatter:
```yaml
quality_gates:
  - name: tests
    command: "npm test"
  - name: lint
    command: "npm run lint"
```

Use `dlc_yaml_get` or `yq` to extract the list. Parse each entry's `name` and `command` fields. Example:
```bash
GATES_JSON=$(dlc_frontmatter_get "quality_gates" "$INTENT_FILE" | yq -o=json '.' 2>/dev/null)
```

If the field is empty, null, or the key doesn't exist, treat as zero gates (not an error).

### hooks.json Registration

Add quality-gate.sh to both Stop and SubagentStop events. It must NOT be async:

```json
"Stop": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/enforce-iteration.sh\"",
        "async": true
      },
      {
        "type": "command",
        "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/quality-gate.sh\"",
        "timeout": 120
      }
    ]
  }
],
"SubagentStop": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/enforce-iteration.sh\"",
        "async": true
      },
      {
        "type": "command",
        "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/quality-gate.sh\"",
        "timeout": 120
      }
    ]
  }
]
```

Note: `timeout: 120` (2 minutes) at the hook level, separate from the 30-second per-gate timeout. This gives room for multiple gates without hitting the hook timeout.

### Source Libraries

```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
source "${PLUGIN_ROOT}/lib/parse.sh"
source "${PLUGIN_ROOT}/lib/state.sh"
```

Use existing `dlc_check_deps`, `dlc_find_active_intent`, `dlc_state_load`, `dlc_json_get`, `dlc_frontmatter_get` functions. No new library code needed.

## Success Criteria
- [x] `plugin/hooks/quality-gate.sh` exists and is executable
- [x] Hook reads `quality_gates:` from both intent.md and current unit frontmatter
- [x] Intent and unit gates merge additively (both lists run)
- [x] Each gate command is executed with a timeout
- [x] Failed gates produce `{"decision": "block"}` JSON with gate name, command, exit code, and output
- [x] Passing gates (or no gates) allow stop (exit 0, no JSON)
- [x] Hook only enforces for building hats: builder, implementer, refactorer
- [x] Hook respects `stop_hook_active` — allows stop on second attempt
- [x] Hook exits silently (exit 0) when no active intent, no iteration state, or non-building hat
- [x] Registered in `hooks/hooks.json` for both Stop and SubagentStop (NOT async)

## Risks
- **Frontmatter parsing fragility**: YAML list extraction from markdown frontmatter can break on edge cases. Mitigation: use existing `dlc_frontmatter_get` + `yq` pipeline, test with empty/missing/malformed fields.
- **Gate command environment**: Commands run in the hook's shell environment, which may differ from the agent's. Mitigation: commands run in cwd (worktree root) with `bash -c`, same as how the agent would run them.
- **Timeout cascading**: If multiple gates each take close to 30 seconds, the 120-second hook timeout might be hit. Mitigation: most gate commands (test, lint, typecheck) complete in under 10 seconds for typical projects.

## Boundaries
This unit creates the hook script and registers it. It does NOT:
- Populate quality_gates in frontmatter (unit-03: elaborate-integration)
- Update builder/reviewer hat instructions (unit-04: hat-integration)
- Modify advance skill logic (unit-04: hat-integration)
- Change enforce-iteration.sh behavior (stays as-is from unit-01)

## Notes
- The hook runs in parallel with enforce-iteration.sh (both registered for Stop/SubagentStop). They are independent — enforce-iteration handles iteration continuation, quality-gate handles gate enforcement.
- If both hooks try to block: CC respects the first `{"decision": "block"}` it receives. Both reasons may be combined by CC.
- The `stop_hook_active` guard is critical for nested subagents. Without it, an Explore agent spawned by the builder would be blocked by gates it can't fix, creating a deadlock.
