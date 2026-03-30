---
intent: harness-enforced-quality-gates
created: 2026-03-29
status: active
---

# Discovery Log: Harness-Enforced Quality Gates

Elaboration findings persisted during Phase 2.5 domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.

## Codebase Pattern: Hook Registration Architecture

Two hook registration files exist with different roles:

**`plugin/.claude-plugin/hooks.json`** (deleted in working tree) — Registered native CC hooks:
- PreToolUse: EnterPlanMode → redirect-plan-mode.sh
- PreToolUse: Agent|Task|Skill → subagent-hook.sh
- PreToolUse: Write|Edit → prompt-guard.sh + workflow-guard.sh
- PostToolUse: * → context-monitor.sh

**`plugin/hooks/hooks.json`** (current) — Extends with han-delegated hooks:
- All of the above PreToolUse/PostToolUse hooks, PLUS:
- SessionStart → `han hook run ai-dlc inject-context` (async)
- Stop → `han hook run ai-dlc iterate --async` (async)
- SubagentStop → `han hook run ai-dlc iterate --async` (async)

**Key finding:** The han delegation is pure dispatch overhead. `han hook run ai-dlc inject-context` simply locates the command in `han-plugin.yml` and runs `bash "${CLAUDE_PLUGIN_ROOT}/hooks/inject-context.sh"`. The same bash scripts can be called directly as native CC hooks.

## Codebase Pattern: Hook Scripts Inventory

All scripts live in `plugin/hooks/`. None depend on han CLI at runtime:

| Script | Lines | Event | Blocking? | State Files |
|--------|-------|-------|-----------|-------------|
| inject-context.sh | 741 | SessionStart | No | iteration.json, intent.md, unit-*.md, *.md state files |
| enforce-iteration.sh | 183 | Stop/SubagentStop | No (exit 0 only) | iteration.json, intent.md, unit-*.md |
| subagent-hook.sh | 52 | PreToolUse (Agent/Task/Skill) | No | Via subagent-context.sh |
| subagent-context.sh | 327 | Helper (not direct hook) | N/A | iteration.json, intent.md, unit-*.md |
| prompt-guard.sh | 22 | PreToolUse (Write/Edit) | No (advisory) | None |
| workflow-guard.sh | 23 | PreToolUse (Write/Edit) | No (advisory) | iteration.json |
| context-monitor.sh | 67 | PostToolUse | Yes (exit 2) | /tmp/context-monitor-{SID} |
| redirect-plan-mode.sh | 39 | PreToolUse (EnterPlanMode) | Yes (deny) | None |

**Libraries used by hooks** (all in `plugin/lib/`):
- `parse.sh` — JSON (jq), YAML (yq), frontmatter parsing
- `state.sh` — `dlc_state_load/save`, `dlc_find_active_intent`, `dlc_check_deps`
- `config.sh` — Provider config, project maturity detection
- `dag.sh` — Unit dependency graph, status tables, ready/blocked/in-progress queries

All libraries are native bash + jq/yq. Zero han dependencies.

## Codebase Pattern: Current "Hard Gates" in advance/SKILL.md

Three gates are currently implemented as agent-interpreted logic inside the `/advance` skill:

**PLAN_APPROVED** (planner → builder):
- Checks: `dlc_state_load "$INTENT_DIR" "current-plan.md"` exists and has content
- Enforcement: `exit 1` from skill script
- Location: advance/SKILL.md ~line 48

**TESTS_PASS** (builder → reviewer):
- Checks: Runs `npm test`, `npm run lint`, `npm run typecheck` — all must exit 0
- Enforcement: `exit 1` from skill script
- Location: advance/SKILL.md ~line 60

**CRITERIA_MET** (reviewer → completion):
- Checks: `review-result.json` has `allPass: true`
- Enforcement: `exit 1` from skill script
- Location: advance/SKILL.md ~line 85

**Critical insight:** These are NOT harness hooks. They run inside the `/advance` skill at the agent's discretion. The agent must choose to call `/advance`, which then checks conditions. The harness never prevents the agent from doing anything — the agent polices itself.

**Hardcoded commands:** The gate commands (`npm test`, `npm run lint`, `npx tsc --noEmit`) are baked into the skill. They can't be customized per-project, per-intent, or per-unit.

## Codebase Pattern: iteration.json State Structure

```json
{
  "hat": "builder|planner|reviewer|integrator",
  "iteration": 1,
  "status": "active|blocked|completed",
  "currentUnit": "unit-slug",
  "workflow": ["planner", "builder", "reviewer"],
  "workflowName": "default|adversarial|design|tdd|hypothesis",
  "targetUnit": "unit-slug|null",
  "integratorComplete": false,
  "teamName": "optional-team-id",
  "needsAdvance": false,
  "maxIterations": 50
}
```

Read by: inject-context.sh, enforce-iteration.sh, subagent-context.sh, workflow-guard.sh
Written by: /advance, /fail, /execute, /construct, inject-context.sh (migration), enforce-iteration.sh (status updates)

## Codebase Pattern: Workflow Definitions

Five named workflows in `plugin/workflows.yml`:
- `default`: [planner, builder, reviewer]
- `adversarial`: [planner, builder, red-team, blue-team, reviewer]
- `design`: [planner, designer, reviewer]
- `hypothesis`: [observer, hypothesizer, experimenter, analyst]
- `tdd`: [test-writer, implementer, refactorer, reviewer]

Per-unit workflow override via unit frontmatter `workflow:` field.
Quality gates would need to apply based on which hat is active, not just "builder".

## External Research: CC Hook Technical Specs

### Stop Hook Exit Codes
| Exit Code | Effect |
|-----------|--------|
| 0 (no JSON) | Allow stop normally |
| 0 + `{"decision": "block", "reason": "..."}` | Block stop, feed reason to agent |
| 2 | Block stop, feed stderr to agent |
| 1, 3+ | Non-blocking error, agent still stops |

**Best practice:** Use exit 0 + JSON `{"decision": "block"}` for quality gates. Allows structured output, metadata, and explicit reason text. Exit 2 is simpler but loses JSON output capability.

### SubagentStop Payload
```json
{
  "session_id": "abc123",
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_id": "agent-abc123",
  "agent_type": "Explore|general-purpose|...",
  "last_assistant_message": "...",
  "cwd": "/path",
  "permission_mode": "default"
}
```

Key fields for scoping:
- `agent_id` — unique per subagent
- `agent_type` — the subagent_type from Agent tool
- `stop_hook_active` — true if already forced to continue by a previous Stop hook (prevents infinite loops)

### Hook Execution Order
- Multiple hooks for same event run **in parallel**
- First exit 2 (or decision:block) blocks the action
- All hooks attempt execution regardless of other hooks' results
- **async: true** means exit codes don't block — cannot use for quality gates

### Env Var Persistence
- `$CLAUDE_ENV_FILE` only available in SessionStart/CwdChanged/FileChanged
- Hooks can write `export VAR=value` to this file for session-wide persistence
- Stop/SubagentStop hooks do NOT get CLAUDE_ENV_FILE

### PreToolUse on Skill
```json
{
  "tool_name": "Skill",
  "tool_input": {
    "skill": "skill-name",
    "args": "arguments string"
  }
}
```
Can modify via `updatedInput` — completely replaces original input.

## Architecture Decision: Gate Enforcement Scoping

**Problem:** Stop/SubagentStop hooks fire for ALL sessions. A builder subagent spawns nested subagents (Explore, test-runner). Those nested agents trigger SubagentStop. We must prevent them from running quality gates.

**Options analyzed:**

1. **Stop only (not SubagentStop):** Gates run when the top-level session stops. Problem: in team mode, builders are subagents — Stop won't fire for them.

2. **SubagentStop + iteration.json hat check:** Read iteration.json, only enforce if hat=builder. Problem: nested subagents see the same iteration.json and would also match.

3. **SubagentStop + agent_type filter:** Only enforce for specific agent types (e.g., "general-purpose" builders). Problem: agent_type is generic, not role-specific.

4. **Both Stop + SubagentStop with marker file:** Construction loop writes `.ai-dlc/{slug}/state/gate-session-active` before spawning builder. Hook checks: marker exists AND hat=builder. Nested subagents see the marker too — same problem.

5. **Both Stop + SubagentStop with stop_hook_active guard:** On first fire, check gates. If gates fail, block (decision:block). Agent fixes and tries to stop again — stop_hook_active=true. Check gates again. This is the natural loop. Nested subagents that trigger SubagentStop would also be checked, BUT: they're in the same cwd with the same iteration.json. If gates pass, they pass for nested agents too. If gates fail, nested agents get blocked — but they can't fix the gates (they're not builders). This could deadlock.

**Recommended approach:** Use **both Stop and SubagentStop**, but gate the enforcement:
- Read iteration.json for current hat and unit
- Only enforce when `hat` is in a "building" role (builder, implementer, refactorer, etc.)
- Check `stop_hook_active` — if already in continuation from a previous gate failure, allow a second stop attempt to pass through (prevents infinite loops on nested agents)
- If no active intent or no quality_gates defined, exit 0 silently

This means nested subagents MIGHT trigger gates on their first stop, but `stop_hook_active=true` on retry lets them through. The key protection: the builder gets blocked until gates pass, and the builder is the one who can fix things.

## Architecture Decision: Two Hook Files → One

Currently two hook registration files exist:
- `plugin/.claude-plugin/hooks.json` — PreToolUse + PostToolUse (native CC hooks)
- `plugin/hooks/hooks.json` — Above + SessionStart/Stop/SubagentStop (han-delegated)

Migration should **consolidate into a single `plugin/.claude-plugin/hooks.json`** that contains ALL hooks as native CC hooks. Delete `plugin/hooks/hooks.json` and `plugin/han-plugin.yml`.

## Architecture Decision: Quality Gate Hook Design

The new quality gate hook would be a **Stop/SubagentStop hook** that:

1. Reads stdin JSON payload
2. Checks `stop_hook_active` — if true and all gates passed on previous run, allow stop
3. Finds active intent via `dlc_find_active_intent`
4. Loads iteration.json, checks hat is in building role
5. Loads current unit's frontmatter for unit-level quality_gates
6. Loads intent.md frontmatter for intent-level quality_gates
7. Merges gates (additive — intent + unit)
8. Runs each gate command, captures output
9. If all pass: exit 0 (allow stop)
10. If any fail: output `{"decision": "block", "reason": "..."}` with failure details

**File:** `plugin/hooks/quality-gate.sh`
**Registration:** Both Stop and SubagentStop in `.claude-plugin/hooks.json`

## Data Source: Frontmatter Schema for Quality Gates

New frontmatter fields to add:

**In intent.md:**
```yaml
quality_gates:
  - name: tests
    command: "npm test"
  - name: lint
    command: "npm run lint"
  - name: typecheck
    command: "npx tsc --noEmit"
```

**In unit-NN-*.md:**
```yaml
quality_gates:
  - name: auth_integration
    command: "npm test -- --filter auth"
```

Merge rule: unit gates are ADDITIVE to intent gates. Deduplication by name is NOT performed — same name in both means both run (intent version + unit version). This preserves the ratchet guarantee.

## Codebase Pattern: han-plugin.yml Contents

```yaml
hooks:
  inject-context:
    command: bash "${CLAUDE_PLUGIN_ROOT}/hooks/inject-context.sh"
    event: SessionStart
    description: Inject AI-DLC iteration context
  iterate:
    command: bash "${CLAUDE_PLUGIN_ROOT}/hooks/enforce-iteration.sh"
    event: Stop
    description: Enforce iteration pattern
    depends_on:
      - plugin: "*"
        hook: "*"
      - plugin: git-storytelling
        hook: commit
        optional: true
```

The `depends_on` in han ensures hook ordering. In native CC hooks, ordering is managed by hook array position within the same event. The `git-storytelling` dependency is optional and can be dropped.

