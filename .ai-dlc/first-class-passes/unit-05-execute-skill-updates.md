---
status: completed
last_updated: "2026-04-01T12:32:14Z"
depends_on: [unit-01-pass-definitions, unit-02-hat-augmentation, unit-03-pass-context-injection]
branch: ai-dlc/first-class-passes/05-execute-skill-updates
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: ""
---

# unit-05-execute-skill-updates

## Description

Update the execute skill to use pass-filtered unit selection and ensure pass transition logic works correctly with the new pass definition system. Also apply workflow constraints when spawning teammates.

## Domain Entities

- **Intent**: Source of `passes` and `active_pass` in frontmatter
- **Unit**: Filtered by `pass` field during execution
- **PassDefinition**: Provides workflow constraints via `constrain_workflow`
- **Workflow**: Constrained by the active pass's `available_workflows`

## Data Sources

- `plugin/skills/execute/SKILL.md` — Step 3 (unit selection, line 549), Step 5c (pass transition, lines 1046-1076), teammate spawning (lines 597-625)
- `plugin/lib/dag.sh` — `find_ready_units_for_pass()` (already exists, lines 247-276)
- `plugin/lib/pass.sh` — `constrain_workflow` function (created in unit-01)

## Technical Specification

### 1. Use pass-filtered unit selection in Step 3

Current code uses unfiltered selection:
```bash
READY_UNITS=$(find_ready_units "$INTENT_DIR")
```

Change to pass-aware selection:
```bash
# Read active_pass from intent frontmatter
ACTIVE_PASS=$(dlc_frontmatter_get "active_pass" "$INTENT_DIR/intent.md" 2>/dev/null || echo "")

if [ -n "$ACTIVE_PASS" ]; then
  READY_UNITS=$(find_ready_units_for_pass "$INTENT_DIR" "$ACTIVE_PASS")
else
  READY_UNITS=$(find_ready_units "$INTENT_DIR")
fi
```

This uses the existing `find_ready_units_for_pass` function in dag.sh — no DAG changes needed.

### 2. Apply workflow constraints when spawning teammates

When resolving per-unit workflow (lines 597-625), apply the pass constraint:

```bash
# After determining UNIT_WORKFLOW_NAME from unit frontmatter or discipline-based fallback:
if [ -n "$ACTIVE_PASS" ]; then
  source "${CLAUDE_PLUGIN_ROOT}/lib/pass.sh"
  CONSTRAINED_WORKFLOW=$(constrain_workflow "$UNIT_WORKFLOW_NAME" "$ACTIVE_PASS")
  if [ "$CONSTRAINED_WORKFLOW" != "$UNIT_WORKFLOW_NAME" ]; then
    echo "Note: Workflow '$UNIT_WORKFLOW_NAME' not available in '$ACTIVE_PASS' pass. Using '$CONSTRAINED_WORKFLOW'."
  fi
  UNIT_WORKFLOW_NAME="$CONSTRAINED_WORKFLOW"
fi
```

### 3. Verify pass transition logic at Step 5c

The existing pass transition logic (lines 1046-1076) parses `passes` and `active_pass` from intent frontmatter to find the next pass. This logic is functionally correct but should be verified to work with:
- Custom pass names (not just design/product/dev)
- The `validate_pass_exists` check on the next pass
- Proper notification message that references the next pass's description from its definition

Update the transition notification to include pass description:
```bash
if [ -n "$NEXT_PASS" ]; then
  source "${CLAUDE_PLUGIN_ROOT}/lib/pass.sh"
  PASS_DESC=$(load_pass_metadata "$NEXT_PASS" | grep description | ...)
  echo "The **${ACTIVE_PASS}** pass is complete. The next pass is **${NEXT_PASS}** ($PASS_DESC)."
  echo "Run /ai-dlc:elaborate to define ${NEXT_PASS} units."
fi
```

### 4. Handle pass-back scenario

When the reviewer in a later pass determines that work needs to flow back to an earlier pass:
- The reviewer reports the issue via SendMessage to the team lead
- The team lead (execute skill) should recognize pass-back signals in the reviewer output
- On pass-back: update `active_pass` in intent frontmatter to the target pass, save state with `status=pass_back`, and stop execution with a message to the user:

```
"The **{current_pass}** pass discovered issues requiring work in the **{target_pass}** pass.
Run /ai-dlc:elaborate to define new units for the {target_pass} pass."
```

This is an uncommon path — the primary mechanism is forward progression. Pass-backs happen when a fundamental assumption from an earlier pass is invalidated.

## Success Criteria

- [ ] Execute Step 3 uses `find_ready_units_for_pass` when `active_pass` is set
- [ ] Execute Step 3 uses `find_ready_units` when `active_pass` is empty (backward compatible)
- [ ] Workflow constraints applied when spawning teammates — unavailable workflows fall back to pass's `default_workflow`
- [ ] Pass transition at Step 5c works with custom pass names (not just design/product/dev)
- [ ] Pass transition notification includes the next pass's description from its definition
- [ ] Pass-back mechanism: execute can set `active_pass` backward and stop for re-elaboration

## Risks

- **Pass-back complexity**: The pass-back mechanism adds a new code path. Mitigation: keep it simple — just update frontmatter and stop. The user re-runs elaborate manually.
- **Unit selection edge case**: If all units for the active pass are completed but the intent has more passes, the "no ready units" path should trigger pass transition, not "all units blocked." Mitigation: explicitly check if the active pass is complete before falling into the blocked path.

## Boundaries

This unit updates execute skill logic ONLY. It does NOT:
- Create pass definitions (unit-01)
- Change hat resolution (unit-02)
- Modify hook injection (unit-03)
- Update elaborate skill (unit-04)
- Change settings schema (unit-06)

## Notes

- The `find_ready_units_for_pass` function already exists and is well-tested in dag.sh. The main change is calling it instead of `find_ready_units`.
- The advance skill (`plugin/skills/execute/subskills/advance/SKILL.md`) may also need awareness of passes when determining if the intent is complete. Check if the existing pass transition code in execute (Step 5c) is sufficient or if advance needs updates too.
