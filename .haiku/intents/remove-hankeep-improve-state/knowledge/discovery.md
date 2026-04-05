---
intent: remove-hankeep-improve-state
created: 2026-03-27
status: active
---

# Discovery Log: Remove Han Keep Dependency

Findings from comprehensive plugin review on 2026-03-27.

## Current Han Usage (260 references across 32 files)

### Executable Code (106 references, 12 files)
- inject-context.sh (41): han keep load/save, han parse yaml/json — heaviest consumer
- subagent-context.sh (21): han keep load, han parse json/yaml
- enforce-iteration.sh (15): han keep load, han parse json
- dag.sh (10): han parse yaml, han parse yaml-set
- workflow-guard.sh (5): han keep load, han parse json
- config.sh (4): han parse yaml
- prompt-guard.sh (3): han parse json
- context-monitor.sh (3): han parse json
- hooks.json (1): han hook wrap-subagent-context
- redirect-plan-mode.sh (1): han parse json
- han-plugin.yml (1): comment reference
- state.sh (1): reference

### Skill Documentation (145 references, 15 files)
advance (35), execute (34), elaborate (13), refine (12), reset (11),
fundamentals (10), reflect (9), resume (5), operate (5), fail (4),
blockers (3), followup (2), completion-criteria (1), backpressure (1)

### Hat Documentation (9 references, 6 files)
planner (3), red-team (2), hypothesizer (1), experimenter (1), builder (1), observer (1)

## Replacement Strategy

### han parse → jq + yq (mikefarah/Go)
- JSON: `han parse json field -r` → `jq -r '.field'`
- YAML: `han parse yaml field -r` → `yq -r '.field'`
- Frontmatter: `han parse yaml-set field val` → `yq --front-matter=process '.field = "val"' -i`
- YAML→JSON: `han parse yaml-to-json` → `yq -o=json '.'`
- JSON validate: `han parse json-validate` → `jq empty`

### han keep → File-based state in .ai-dlc/{slug}/state/
- Save: write to .ai-dlc/{slug}/state/{key}
- Load: read from .ai-dlc/{slug}/state/{key}
- Delete: rm .ai-dlc/{slug}/state/{key}
- Cross-branch: no longer needed (all state in working tree)

### han hook → Direct hook script invocation
- Replace `han hook wrap-subagent-context` with direct bash invocation

## Key Implementation Notes
- config.sh already uses jq (30+ calls) — keep as-is
- state.sh exists with stub functions — needs completion
- config.ts was deleted (orphaned, no references)
- inject-context.sh is the highest-impact file (41 refs)
