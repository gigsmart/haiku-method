---
status: pending
last_updated: ""
depends_on: []
branch: ai-dlc/harness-enforced-quality-gates/01-hook-migration
discipline: devops
pass: ""
workflow: ""
ticket: ""
---

# unit-01-hook-migration

## Description
Migrate the three han-delegated hooks (SessionStart, Stop, SubagentStop) in `plugin/hooks/hooks.json` to direct bash script calls. Delete `plugin/han-plugin.yml`. This removes han from the hook execution critical path while keeping all behavioral semantics identical.

## Discipline
devops - Infrastructure/configuration change to hook registration.

## Domain Entities
- **Hook Registration** (`plugin/hooks/hooks.json`): The single canonical file mapping CC events to shell commands.
- **han-plugin.yml**: Legacy dispatch config that maps hook names to bash commands. Being deleted.

## Data Sources
- `plugin/hooks/hooks.json` — current hook registration with `han hook run` commands
- `plugin/han-plugin.yml` — current han hook definitions (inject-context, iterate)
- `plugin/hooks/inject-context.sh` — the SessionStart script (741 lines, no han deps)
- `plugin/hooks/enforce-iteration.sh` — the Stop/SubagentStop script (183 lines, no han deps)

## Technical Specification

### Step 1: Modify `plugin/hooks/hooks.json`

Replace the three han-delegated entries:

**SessionStart** — change:
```json
"command": "han hook run ai-dlc inject-context"
```
to:
```json
"command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/inject-context.sh\""
```

**Stop** — change:
```json
"command": "han hook run ai-dlc iterate --async"
```
to:
```json
"command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/enforce-iteration.sh\""
```

**SubagentStop** — same change as Stop:
```json
"command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/enforce-iteration.sh\""
```

Keep all other hook entries (PreToolUse, PostToolUse) unchanged — they already call scripts directly.

### Step 2: Evaluate async flag

The current han-delegated hooks have `"async": true`. For enforce-iteration.sh, this means its exit code currently doesn't block. Evaluate whether to:
- Keep `async: true` for inject-context.sh (SessionStart context injection doesn't need to block)
- Keep `async: true` for enforce-iteration.sh on Stop/SubagentStop (currently advisory, not blocking)

**Decision:** Keep async behavior identical to current — this unit is about migration, not behavioral change. The quality gate hook (unit-02) will add the blocking enforcement.

### Step 3: Delete `plugin/han-plugin.yml`

Remove the file entirely. Its two hook definitions (inject-context, iterate) are now registered directly in hooks.json.

### Step 4: Verify no other references to han-plugin.yml

Grep plugin/ for any references to `han-plugin.yml` or `han hook run ai-dlc`. Ensure nothing else depends on these.

## Success Criteria
- [ ] `plugin/hooks/hooks.json` contains zero `han hook run` commands
- [ ] `plugin/han-plugin.yml` is deleted
- [ ] SessionStart hook calls `inject-context.sh` directly
- [ ] Stop hook calls `enforce-iteration.sh` directly
- [ ] SubagentStop hook calls `enforce-iteration.sh` directly
- [ ] All PreToolUse and PostToolUse hooks are unchanged
- [ ] Existing hook behavior is identical (async flags preserved)

## Risks
- **Broken hook dispatch**: If the `${CLAUDE_PLUGIN_ROOT}` variable isn't resolved the same way han resolves it. Mitigation: other hooks in the same file already use this pattern successfully.
- **han-plugin.yml referenced elsewhere**: Skills or docs might reference it. Mitigation: grep for references in Step 4.

## Boundaries
This unit does NOT modify any hook script logic. It only changes how hooks are registered and dispatched. The quality gate hook is unit-02. Hat/skill updates are unit-03/04.

## Notes
- The existing PreToolUse hooks (subagent-hook.sh, prompt-guard.sh, workflow-guard.sh, redirect-plan-mode.sh) and PostToolUse hooks (context-monitor.sh) already use direct `bash "${CLAUDE_PLUGIN_ROOT}/hooks/..."` calls — they're the pattern to follow.
- The `depends_on` field in han-plugin.yml (git-storytelling commit hook) was optional and can be safely dropped — CC hooks manage ordering by array position.
