---
status: completed
last_updated: "2026-03-31T21:05:22Z"
depends_on: [unit-01-pass-definitions, unit-02-hat-augmentation]
branch: ai-dlc/first-class-passes/03-pass-context-injection
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: ""
---

# unit-03-pass-context-injection

## Description

Wire active_pass context through the construction pipeline. The hooks (`inject-context.sh` and `subagent-context.sh`) read `active_pass` from intent frontmatter, load the corresponding pass definition using the library from unit-01, and inject pass instructions into the subagent context. Also constrain workflow selection to the active pass's available workflows.

## Domain Entities

- **PassDefinition**: Loaded via `load_pass_instructions` and `load_pass_metadata` from unit-01's `pass.sh`
- **Intent**: Source of `active_pass` field in frontmatter
- **Hat**: Receives pass instructions as additional context during construction

## Data Sources

- `plugin/hooks/inject-context.sh` — main session context hook. Currently extracts iteration state (hat, iteration, workflow) but NOT active_pass. Lines 354-365 for jq extraction.
- `plugin/hooks/subagent-context.sh` — subagent context hook. Lines 40-43 for jq extraction of iteration state.
- `plugin/lib/pass.sh` — pass resolution library (created in unit-01)
- `.ai-dlc/{slug}/intent.md` — source of `active_pass` frontmatter field

## Technical Specification

### 1. Extract `active_pass` from intent frontmatter in both hooks

**In `inject-context.sh`** (around line 354-365), add `active_pass` to the intent frontmatter extraction:

```bash
# Read active_pass from intent frontmatter (not iteration.json — passes are intent-level, not iteration-level)
ACTIVE_PASS=""
if [ -f "$INTENT_DIR/intent.md" ]; then
  ACTIVE_PASS=$(dlc_frontmatter_get "active_pass" "$INTENT_DIR/intent.md" 2>/dev/null || echo "")
fi
```

**In `subagent-context.sh`** (around line 40-43), same extraction.

### 2. Load and inject pass instructions

When `ACTIVE_PASS` is non-empty, load the pass definition and inject its instructions:

```bash
if [ -n "$ACTIVE_PASS" ]; then
  source "${PLUGIN_ROOT}/lib/pass.sh"
  PASS_INSTRUCTIONS=$(load_pass_instructions "$ACTIVE_PASS")
  PASS_METADATA=$(load_pass_metadata "$ACTIVE_PASS")
fi
```

Inject into the context output as a new section, placed BEFORE hat instructions (so the pass sets the lens, then the hat provides role-specific guidance):

```markdown
### Active Pass: {ACTIVE_PASS}

{PASS_INSTRUCTIONS}

---
```

Also display the active pass in the status line alongside iteration/hat/workflow info:
```
**Iteration:** $ITERATION | **Hat:** $HAT | **Pass:** $ACTIVE_PASS | **Workflow:** $WORKFLOW_NAME
```

### 3. Constrain workflow selection

When `ACTIVE_PASS` is set, validate the unit's workflow against the pass's available workflows:

```bash
if [ -n "$ACTIVE_PASS" ]; then
  source "${PLUGIN_ROOT}/lib/pass.sh"
  CONSTRAINED_WORKFLOW=$(constrain_workflow "$UNIT_WORKFLOW" "$ACTIVE_PASS")
  if [ "$CONSTRAINED_WORKFLOW" != "$UNIT_WORKFLOW" ]; then
    echo "**Note:** Workflow '$UNIT_WORKFLOW' is not available in the '$ACTIVE_PASS' pass. Using '$CONSTRAINED_WORKFLOW' instead."
  fi
  UNIT_WORKFLOW="$CONSTRAINED_WORKFLOW"
fi
```

This constraint should be applied in `inject-context.sh` when determining the workflow for the current unit, and in the execute skill when spawning teammates.

### 4. Handle single-pass intents

When `ACTIVE_PASS` is empty (single-pass intents, which is the default):
- Do NOT inject any pass context
- Do NOT constrain workflows
- Behavior is identical to current implementation (backward compatible)

This ensures single-pass intents have zero overhead from the pass system.

## Success Criteria

- [ ] `inject-context.sh` extracts `active_pass` from intent frontmatter
- [ ] `subagent-context.sh` extracts `active_pass` from intent frontmatter
- [ ] When `active_pass` is set, pass instructions are injected into subagent context before hat instructions
- [ ] Pass name is displayed in the status line alongside iteration/hat/workflow info
- [ ] Workflow constraint is applied: units requesting unavailable workflows get the pass's default_workflow
- [ ] Workflow constraint logs a note when it overrides the requested workflow
- [ ] When `active_pass` is empty (single-pass), no pass context is injected and no workflows are constrained
- [ ] Pass instructions include project augmentation when a project pass file exists (via unit-01's `load_pass_instructions`)

## Risks

- **Context window bloat**: Adding pass instructions to every subagent context increases token usage. Mitigation: keep pass instructions concise and focused. The instructions are only injected when `active_pass` is set (multipass intents only).
- **Hook ordering**: Pass instructions must appear before hat instructions so the pass sets the lens. Mitigation: explicitly place the pass section in the output before the hat section.

## Boundaries

This unit wires pass context through hooks ONLY. It does NOT:
- Create pass definition files (unit-01)
- Change hat resolution logic (unit-02)
- Update elaborate or execute skill flow logic (unit-04, unit-05)
- Modify settings schema (unit-06)

## Notes

- The `active_pass` field lives in intent frontmatter (not iteration.json) because passes are an intent-level concept, not an iteration-level concept. A bolt runs within a unit within a pass — the pass doesn't change per-bolt.
- The pass section in context should clearly state "You are in the {pass} pass" so the agent has an unambiguous signal about what kind of artifacts to produce.
- When both pass instructions and hat instructions are present, they work together: the pass says "produce design artifacts," the hat (e.g., builder) says "how to build things." The combination means "build design artifacts."
