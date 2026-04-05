---
name: unit-01-quick-skill-rewrite
type: backend
status: completed
depends_on: []
bolt: 0
hat: ""
started_at: 2026-03-31T05:22:14Z
completed_at: 2026-03-31T05:22:14Z
---


# unit-01-quick-skill-rewrite

## Description
Rewrite the `/quick` skill (`plugin/skills/quick/SKILL.md`) to support workflow-aware execution with subagent delegation. The current 7-step linear flow is replaced with a hat loop that spawns subagents for each hat phase, using a temporary `.ai-dlc/quick/` artifact to enable the existing hook system's context injection. Hat files are the single source of truth — read at runtime, never inlined.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **QuickTask**: The user's task description parsed from the skill argument, with optional workflow name as first word
- **Workflow**: The selected named workflow — resolved from `plugin/workflows.yml` and `.ai-dlc/workflows.yml`
- **Hat**: Each hat in the workflow sequence, loaded from hat files by the existing hook system
- **HatCycle**: The progression through each hat, tracking commits and reviewer decisions
- **Quick Artifact**: Temporary `.ai-dlc/quick/` directory with minimal `intent.md` and `iteration.json` — enables hook context injection, cleaned up after completion

## Success Criteria
- [ ] `/quick` accepts an optional workflow name as first argument and falls back to `default` when not specified
- [ ] Quick mode reads `plugin/workflows.yml` and `.ai-dlc/workflows.yml` to resolve hat sequences
- [ ] Quick mode creates a temporary `.ai-dlc/quick/` artifact (intent.md + iteration.json) for hook integration
- [ ] The `.ai-dlc/quick/` directory is gitignored and cleaned up after completion
- [ ] Each hat phase spawns a subagent that receives hat context via the existing hook system
- [ ] Builder hats produce one commit per cycle; planner/reviewer hats produce no commits
- [ ] Reviewer rejection loops back to builder with max 3 cycles before recommending `/elaborate`
- [ ] Quick mode refuses to start if another active intent already exists; orphaned quick artifacts are detected and offered for cleanup
- [ ] Hat context reaches subagents (verified via hook injection or fallback manual injection)
- [ ] Cowork mode rejection still works
- [ ] Scope validation still triggers during execution
- [ ] Plugin auto-deploys via version bump on merge to main (existing CI — no changes needed)
- [ ] Lint passes (`bun run lint`) after skill file changes

## Notes
- **Departure from discovery recommendation:** Discovery recommended "Option A: Inline Hat Loop" with inline behavioral guidelines in the skill. The final design chose the opposite: a temporary artifact enabling the existing hook system to load hat files at runtime. This was decided during elaboration because inline guidelines would drift from hat files over time. The hook-integration approach has zero drift risk since hat files are the single source of truth. Builders should follow this unit spec, not the discovery's architectural recommendation.
- The key insight is that `.ai-dlc/quick/intent.md` with `status: active` and `iteration.json` is all the existing hook system needs. `dlc_find_active_intent()` in state.sh scans `.ai-dlc/*/intent.md` — it will find the quick artifact automatically.
- Hat files are the single source of truth. The hook system loads them at runtime via `subagent-context.sh`. No inline behavioral guidelines in the skill, no generated reference files. Zero drift risk.
- The `.ai-dlc/quick/` directory uses a fixed name (not timestamped) — only one quick-mode task can run at a time. This is fine because quick mode is inherently single-task.
- Custom project hats in `.ai-dlc/hats/` work automatically because the hook system already checks project overrides first.
