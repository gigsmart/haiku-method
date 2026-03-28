---
status: pending
last_updated: ""
depends_on:
  - unit-02-migrate-hooks
branch: ai-dlc/remove-hankeep-improve-state/05-simplify-iteration-state
discipline: backend
pass: ""
workflow: ""
ticket: ""
---

# unit-05-simplify-iteration-state

## Description
Simplify the iteration.json state file by removing redundant fields, adding a formal phase enum, and implementing single-pass JSON extraction. This is an improvement opportunity enabled by the file-based state migration.

## Discipline
backend - State schema and parsing optimization.

## Domain Entities
- **iteration.json**: The core state file tracking hat progression, iteration count, and workflow state
- **inject-context.sh**: Primary consumer, currently parses iteration.json with 10+ individual han parse calls
- **enforce-iteration.sh**: Secondary consumer, reads iteration count and status
- **subagent-context.sh**: Reads hat, workflow, and status

## Technical Specification

### 1. Remove redundant `unitStates` field
Current iteration.json stores `unitStates` as a nested object duplicating status from unit-*.md frontmatter. The DAG library (dag.sh) already reads status from unit files, not iteration.json. Remove `unitStates` entirely.

Simplified schema:
```json
{
  "iteration": 3,
  "hat": "builder",
  "workflow": ["planner", "builder", "reviewer"],
  "workflowName": "default",
  "status": "active",
  "currentUnit": "unit-02-auth",
  "targetUnit": null,
  "phase": "execution",
  "maxIterations": 0,
  "needsAdvance": false
}
```

### 2. Add formal phase enum
Define valid phases: `elaboration`, `execution`, `operation`, `reflection`, `closed`. Add validation in state.sh that warns (but doesn't crash) on invalid phase values.

### 3. Single-pass JSON extraction
Replace the current pattern of 10+ individual jq calls with one:
```bash
eval "$(echo "$ITERATION_JSON" | jq -r '@sh "
  ITERATION=\(.iteration // 1)
  HAT=\(.hat // "planner")
  STATUS=\(.status // "active")
  WORKFLOW_NAME=\(.workflowName // "default")
  PHASE=\(.phase // "execution")
  CURRENT_UNIT=\(.currentUnit // "")
  MAX_ITERATIONS=\(.maxIterations // 0)
  NEEDS_ADVANCE=\(.needsAdvance // false)
"')"
```

This eliminates 10+ subprocess spawns on every hook invocation.

### 4. Update consumers
After schema changes, update:
- inject-context.sh: Remove unitStates parsing, use single-pass extraction
- enforce-iteration.sh: Use single-pass extraction
- subagent-context.sh: Use single-pass extraction
- Any skill that reads/writes unitStates must be updated to not expect it

## Success Criteria
- [ ] `unitStates` field no longer exists in iteration.json
- [ ] Phase field validates against enum: elaboration, execution, operation, reflection, closed
- [ ] inject-context.sh uses single-pass jq extraction (one subprocess, not 10+)
- [ ] All hooks and skills that previously read unitStates work correctly without it
- [ ] State file is smaller and more readable

## Risks
- **unitStates removal**: Some code path may depend on unitStates that we haven't identified. Mitigation: grep the full codebase for "unitStates" before removing to identify all consumers.
- **eval with jq**: The `eval "$(jq @sh)"` pattern is safe when input is from a file we control, but must never be used with untrusted input. Mitigation: Document this constraint.

## Boundaries
This unit only changes the iteration.json schema and its consumers. It does NOT change the unit-*.md file format, the DAG resolution logic, or the workflow/hat system.

## Notes
- This unit depends on Unit 2 because it modifies the same hook files that Unit 2 migrates. Running them in parallel would cause merge conflicts.
- This is a stretch goal — the core han removal works without it. If time is limited, this can be deferred.
