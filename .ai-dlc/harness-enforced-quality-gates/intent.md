---
workflow: default
git:
  change_strategy: intent
  auto_merge: true
  auto_squash: false
announcements: []
passes: []
active_pass: ""
iterates_on: ""
created: 2026-03-29
status: completed
epic: ""
---

# Harness-Enforced Quality Gates

## Problem
The current "hard gates" in the advance skill are agent-interpreted — the agent reads instructions about running tests/lint/types and decides whether to comply. This means the agent is in its own trust chain: it can rationalize past gates, skip checks, or misinterpret enforcement rules. True enforcement requires the harness (Claude Code's hook system) to block progression with exit codes, removing the agent from the decision loop entirely.

Additionally, the plugin's Stop/SubagentStop/SessionStart hooks are delegated through `han hook run`, adding unnecessary indirection when the underlying scripts have zero han runtime dependencies.

## Solution
1. **Implement quality gate hook**: Create `quality-gate.sh` that reads `quality_gates:` from intent and unit frontmatter, runs each command, and blocks (exit 0 + `{"decision": "block"}`) if any fail. Register for both Stop and SubagentStop events.
2. **Integrate with elaboration**: Update the elaborate skill to discover repo tooling and populate `quality_gates:` in intent.md frontmatter during elaboration.
3. **Update hats and advance**: Replace hardcoded gate commands in builder/reviewer hats and advance skill with references to frontmatter-defined gates.

Gates are additive (intent defaults + unit additions), add-only during construction (ratchet effect), and harness-enforced (agent cannot bypass).

## Domain Model

### Entities
- **Quality Gate**: A named shell command (`name` + `command`) defined in YAML frontmatter. Must exit 0 to allow progression.
- **Hook Registration** (`hooks/hooks.json`): Maps CC events to shell scripts. Single canonical file.
- **Hook Scripts** (`plugin/hooks/*.sh`): Native bash scripts reading state and enforcing behavior.
- **iteration.json**: Runtime state (hat, iteration, status, currentUnit, workflow).

### Relationships
- Intent defines default `quality_gates:` inherited by all units (additive merge)
- Units define additional `quality_gates:` merged with intent gates
- Quality gate hook reads iteration.json for hat context + frontmatter for gate definitions
- Gates only enforce during "building" hats (builder, implementer, refactorer)

### Data Sources
- **Filesystem** (`.ai-dlc/`): Frontmatter via `dlc_frontmatter_get`, state via `dlc_state_load`
- **CC Hook stdin**: JSON payload with `stop_hook_active`, `agent_id`, `agent_type`, `hook_event_name`
- **CC Hook stdout**: JSON with `decision`, `reason` for blocking

### Data Gaps
- None — all required infrastructure exists in CC hooks and the plugin's lib/ scripts

## Success Criteria
- [ ] A new `plugin/hooks/quality-gate.sh` exists that reads `quality_gates:` from intent and unit frontmatter, runs each command, and exits with `{"decision": "block"}` if any fail
- [ ] Quality gate hook is registered for both Stop and SubagentStop events in `hooks/hooks.json` (NOT async)
- [ ] Quality gate hook only enforces when iteration.json has a "building" hat (builder, implementer, refactorer) — skips for planner, reviewer, designer, observer, etc.
- [ ] Quality gate hook respects `stop_hook_active` to prevent infinite loops on nested subagents
- [ ] Intent-level and unit-level `quality_gates:` merge additively — unit gates add to intent gates, never replace
- [ ] The elaborate skill (Phase 2.5 discovery or Phase 6 artifact writing) populates `quality_gates:` in intent.md frontmatter based on discovered repo tooling
- [ ] Builder hat instructions reference frontmatter-defined gates instead of hardcoded `npm test`/`npm run lint`/`npx tsc` commands
- [ ] All existing hook scripts (inject-context.sh, enforce-iteration.sh, etc.) continue to function identically after migration — no behavioral regressions

## Context
- CC hooks provide Stop and SubagentStop as separate events with `agent_id`/`agent_type` in payload
- Exit 0 + JSON `{"decision": "block"}` is preferred over exit 2 for structured output
- `stop_hook_active` field prevents infinite loops when gates block nested subagents
- `async: true` hooks cannot block — quality gate hook must be synchronous
- All existing hook scripts use native bash + jq/yq via plugin/lib/ — zero han runtime dependencies
