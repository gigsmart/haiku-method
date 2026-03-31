---
status: success
error_message: ""
---

# Discovery Results

## Domain Model Summary

### Entities
- **Quality Gate**: A named shell command that must exit 0 to allow progression. Fields: name, command. Defined in YAML frontmatter of intent.md or unit-NN-*.md.
- **Intent Frontmatter**: YAML metadata block in intent.md. Existing fields: workflow, git, announcements, passes, status. New field: quality_gates[].
- **Unit Frontmatter**: YAML metadata block in unit files. Existing fields: status, depends_on, branch, discipline, workflow. New field: quality_gates[].
- **Hook Registration**: JSON config in `.claude-plugin/hooks.json` mapping CC events to shell scripts. Events: PreToolUse, PostToolUse, SessionStart, Stop, SubagentStop.
- **iteration.json**: Runtime state tracking hat, iteration count, status, currentUnit, workflow.
- **han-plugin.yml**: Legacy hook dispatch config. Maps hook names to shell commands. Being eliminated.

### Relationships
- Intent has many Units (1:N)
- Intent has many Quality Gates (defined in frontmatter, inherited by all units)
- Unit has many Quality Gates (defined in frontmatter, additive to intent gates)
- Hook Registration dispatches to Hook Scripts (1:1 per command entry)
- Hook Scripts read iteration.json and frontmatter to determine enforcement context
- han-plugin.yml currently mediates between hooks.json and hook scripts (being removed)

### Data Sources
- **Filesystem (.ai-dlc/)**: Intent/unit frontmatter, iteration.json, state files. Read via parse.sh (dlc_frontmatter_get, dlc_yaml_get) and state.sh (dlc_state_load, dlc_find_active_intent).
- **CC Hook Stdin**: JSON payload with session_id, hook_event_name, stop_hook_active, agent_id, agent_type. Read via jq.
- **CC Hook Stdout**: JSON output with decision, reason, hookSpecificOutput. Written via jq.

### Data Gaps
- No `quality_gates:` field exists in frontmatter schema yet — needs to be added to elaborate and construct skills
- No quality gate hook script exists yet — needs to be created
- enforce-iteration.sh currently exits 0 always (never blocks) — needs to be evaluated for gate integration
- The advance skill's hardcoded gate commands need to be replaced with frontmatter-driven gate execution

## Key Findings

- Han is pure dispatch overhead for hooks — all logic is in native bash scripts with zero han runtime dependencies
- Two hook registration files exist that should be consolidated into one (.claude-plugin/hooks.json)
- Current "hard gates" are agent-interpreted, not harness-enforced — the agent must choose to run /advance
- CC provides Stop vs SubagentStop as separate events with agent_id/agent_type in payload for scoping
- Exit 0 + JSON {"decision": "block"} is preferred over exit 2 for structured gate failure output
- stop_hook_active field prevents infinite loops when gates block nested subagents
- async: true hooks CANNOT be used for quality gates (exit codes don't block)
- Quality gate hook must NOT be async — must be synchronous to enforce blocking

## Open Questions

- Should the existing enforce-iteration.sh logic be merged INTO the quality gate hook, or should they remain separate hooks? (They both fire on Stop/SubagentStop and read the same state.)
- When gates fail on SubagentStop for a nested agent (not the builder), should it block the nested agent or pass through? The stop_hook_active guard handles the retry, but the first failure still disrupts the nested agent.
- Should the elaboration skill auto-detect repo tooling (npm vs bun vs go) during gate definition, or should the user always specify exact commands?
