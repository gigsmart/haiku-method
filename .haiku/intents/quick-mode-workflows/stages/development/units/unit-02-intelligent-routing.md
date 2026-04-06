---
name: unit-02-intelligent-routing
type: backend
status: completed
depends_on: []
bolt: 0
hat: ""
started_at: 2026-03-31T13:15:27Z
completed_at: 2026-03-31T13:15:27Z
---


# unit-02-intelligent-routing

## Description
Add intelligent task routing to the SessionStart context injection (`plugin/hooks/inject-context.sh`). When no active AI-DLC intent exists and no explicit slash command is used, the injected context should guide the agent to assess task scope and suggest either `/quick` (with a workflow recommendation) or `/elaborate` to the user.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Success Criteria
- [x] `inject-context.sh` includes routing heuristic guidance in the "no active task" output for both greenfield and established paths
- [x] The routing text includes scope signals, workflow recommendations, and the "always confirm" instruction
- [x] Existing hook behavior is unchanged — active intent detection, hat injection, and all other hook functions work identically
- [x] The routing heuristics reference `/quick [workflow]` syntax matching unit-01's argument format
- [x] Plugin auto-deploys via version bump on merge to main (existing CI — no changes needed)
- [x] The routing heuristic text injected into session context is under 40 lines (including scope signals table and workflow suggestions)
- [x] Lint passes (`bun run lint`) after hook file changes

## Notes
- The routing heuristics are purely advisory text injected into the agent's context. The agent applies them using its own judgment — there's no programmatic routing engine.
- Keep the heuristic text lean. The agent is already good at scope assessment; it just needs to know that `/quick` with workflows exists as an option and when to suggest it.
- The `$AVAILABLE_WORKFLOWS` variable is already computed and displayed by the hook. The routing text should reference it rather than duplicating the list.
