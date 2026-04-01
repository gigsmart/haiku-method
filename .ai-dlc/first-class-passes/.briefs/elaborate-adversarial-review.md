---
intent_slug: first-class-passes
worktree_path: /Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/first-class-passes
---

# Intent

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
created: 2026-03-31
status: active
epic: ""
quality_gates:
  - name: lint
    command: bun run lint
  - name: build
    command: bun run build
---

# First-Class Passes

## Problem

Passes currently only control scheduling — which units execute when and when to transition between passes. They do not influence how hats behave during construction. A builder in a design pass produces the same production-code-oriented output as a builder in a dev pass. There is no mechanism for projects to define custom passes, augment built-in passes with project-specific instructions, or constrain which workflows are available per pass. Additionally, the hat resolution pattern allows project hats to fully override plugin hats, which can cause unpredictable behavior.

## Solution

Make passes a first-class concept that shapes construction behavior:

1. **Pass definition files** (`plugin/passes/*.md`) — frontmatter-enabled markdown files declaring available workflows, default workflow, and instructions that get injected into hat context during construction
2. **Augmentation pattern** for both passes and hats — plugin definitions are canonical (never overridden); project definitions with matching names append instructions; new names are custom additions
3. **Pass context injection** — hooks read active_pass from intent frontmatter, load the pass definition, and inject instructions into subagent context
4. **Workflow constraints** — only workflows listed in the active pass's definition are available for units in that pass
5. **User-confirmed passes** — elaboration presents configured passes as a suggestion, user confirms or overrides per intent
6. **Paper and website sync** — documentation accurately describes the pass loop, pass-backs, and customization

## Domain Model

### Entities
- **PassDefinition**: Typed pass with instructions and workflow constraints — Fields: name, description, available_workflows, default_workflow, instructions (markdown body)
- **Intent**: Overall feature being built — Fields: workflow, git config, passes (ordered array), active_pass (current), status
- **Unit**: Discrete work item — Fields: status, depends_on, discipline, pass (which pass it belongs to), workflow
- **Hat**: Construction role — Fields: name, description, instructions (markdown body)
- **Workflow**: Named sequence of hats — Fields: name, description, hats (ordered array)

### Relationships
- PassDefinition constrains available Workflows (via `available_workflows`)
- Hat receives PassDefinition instructions during construction (via hook injection)
- ProjectPassDefinition augments PluginPassDefinition (same name = append)
- ProjectHat augments PluginHat (same name = append, new name = custom)

### Data Sources
- Plugin filesystem: `plugin/passes/*.md`, `plugin/hats/*.md`, `plugin/workflows.yml`
- Project filesystem: `.ai-dlc/passes/*.md`, `.ai-dlc/hats/*.md`, `.ai-dlc/workflows.yml`
- Settings: `.ai-dlc/settings.yml` `default_passes` field

## Success Criteria
- [ ] Built-in pass definition files exist at `plugin/passes/{design,product,dev}.md` with frontmatter (name, description, available_workflows, default_workflow) and markdown instructions
- [ ] Pass instructions are injected into hat subagent context during construction via `inject-context.sh` and `subagent-context.sh`
- [ ] Workflow selection is constrained to the active pass's `available_workflows` — units requesting unavailable workflows fall back to the pass's `default_workflow`
- [ ] Hat resolution uses augmentation pattern: plugin hat always loads, project `.ai-dlc/hats/{name}.md` appends instructions (never replaces)
- [ ] Pass resolution uses same augmentation pattern: plugin pass always loads, project `.ai-dlc/passes/{name}.md` appends instructions (never replaces)
- [ ] Project-defined passes with new names (not matching plugin passes) are recognized as custom passes
- [ ] Settings schema `default_passes` accepts any string (no hardcoded enum), validated against available pass definition files
- [ ] Phase 5.95 of elaborate skill presents configured passes as suggestion, user confirms or overrides per intent
- [ ] Execute skill pass transition logic notifies user and stops for re-elaboration when a pass completes
- [ ] Paper section "Iteration Through Passes" accurately describes the pass loop, pass definitions, pass-backs, and customization
- [ ] Website docs and homepage reflect the pass concept accurately
- [ ] Single-pass (dev only) remains the default — multipass is opt-in via `default_passes` setting
- [ ] All existing quality gates pass (bun run lint, bun run build)

## Context
- Provider loading in config.sh uses a three-tier merge pattern (plugin + settings inline + project override) that serves as the precedent for pass/hat augmentation
- The DAG library (dag.sh) is already pass-aware with `find_ready_units_for_pass()` and `parse_unit_pass()`
- The paper currently shows structured pass objects with per-pass status, but the implementation uses flat string arrays — the paper should be updated to match implementation
- Execute skill already has pass transition logic at Step 5c — it needs to work with the new pass definitions
- The design workflow (`planner → designer → reviewer`) naturally maps to the design pass's available_workflows

# Units


## unit-01-pass-definitions.md

---
status: pending
last_updated: ""
depends_on: []
branch: ai-dlc/first-class-passes/01-pass-definitions
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
---

# unit-01-pass-definitions

## Description

Create the built-in pass definition files and the shared resolution library that loads, merges, and serves pass definitions to the rest of the system. This is the foundational unit — all other units depend on the pass resolution logic created here.

## Domain Entities

- **PassDefinition**: The core entity. Three built-in instances (design, product, dev) plus support for project-defined custom passes.

## Data Sources

- Plugin filesystem: `plugin/passes/{design,product,dev}.md` (to be created)
- Project filesystem: `.ai-dlc/passes/*.md` (augmentation or custom passes)
- Existing workflows: `plugin/workflows.yml` (referenced by `available_workflows` in pass frontmatter)

## Technical Specification

### 1. Create `plugin/passes/` directory with three built-in pass definitions

Each file uses frontmatter-enabled markdown:

**`plugin/passes/design.md`**
- Frontmatter: `name: design`, `description: Visual and interaction design`, `available_workflows: [design]`, `default_workflow: design`
- Instructions: orient hats toward design artifacts (mockups, prototypes, design tokens, component specs). "Done" means designs are reviewed and ready to inform subsequent passes. Not production code.

**`plugin/passes/product.md`**
- Frontmatter: `name: product`, `description: Behavioral specification and gap analysis`, `available_workflows: [default, bdd]`, `default_workflow: default`
- Instructions: orient hats toward behavioral specs, acceptance criteria, edge case analysis. Use completed design artifacts as input context. "Done" means specs are detailed enough for a dev pass to implement against.

**`plugin/passes/dev.md`**
- Frontmatter: `name: dev`, `description: Working implementation`, `available_workflows: [default, tdd, adversarial, bdd]`, `default_workflow: default`
- Instructions: orient hats toward tested, deployable code. Use design artifacts and behavioral specs from prior passes as input. All completion criteria must be programmatically verifiable.

### 2. Create pass resolution functions in `plugin/lib/pass.sh`

Functions to implement:

- **`resolve_pass_definition <pass_name>`**: Returns the path to the pass definition file. Resolution: check `plugin/passes/{name}.md` for built-in, check `.ai-dlc/passes/{name}.md` for project. If both exist (same name), the plugin file is canonical.
- **`load_pass_instructions <pass_name>`**: Loads the full instructions (markdown body after frontmatter) from the pass definition. If a project file with the same name exists, appends its body as a "## Project Augmentation" section.
- **`load_pass_metadata <pass_name>`**: Returns frontmatter fields (available_workflows, default_workflow) as shell variables or JSON.
- **`list_available_passes`**: Lists all available pass names (union of plugin and project passes).
- **`validate_pass_exists <pass_name>`**: Returns 0 if a pass definition file exists (in either plugin or project), 1 otherwise.
- **`constrain_workflow <requested_workflow> <pass_name>`**: Returns the requested workflow if it's in the pass's `available_workflows`, otherwise returns the `default_workflow`.

### 3. Augmentation pattern

When loading a pass definition:
1. Always load the plugin definition first (canonical)
2. If a project `.ai-dlc/passes/{name}.md` exists with the same name, read its markdown body and append it to the plugin instructions under a `## Project Augmentation` heading
3. If a project pass has a name that doesn't match any plugin pass, it's a standalone custom pass — load it directly

This mirrors the provider loading three-tier merge pattern in `config.sh`.

## Success Criteria

- [ ] `plugin/passes/design.md` exists with correct frontmatter and meaningful instructions
- [ ] `plugin/passes/product.md` exists with correct frontmatter and meaningful instructions
- [ ] `plugin/passes/dev.md` exists with correct frontmatter and meaningful instructions
- [ ] `resolve_pass_definition` returns plugin path for built-in passes, project path for custom passes
- [ ] `load_pass_instructions` returns plugin instructions with project augmentation appended when a project file with the same name exists
- [ ] `load_pass_instructions` returns only project instructions for custom (non-built-in) passes
- [ ] `constrain_workflow` returns the requested workflow when it's in `available_workflows`, otherwise returns `default_workflow`
- [ ] `validate_pass_exists` returns 0 for built-in passes (design, product, dev) and any project-defined passes

## Risks

- **Pass instructions too vague**: If pass definitions are too generic, hats won't meaningfully change behavior. Mitigation: write specific, actionable instructions that reference concrete artifact types.
- **Shell parsing fragility**: Frontmatter parsing in bash can be brittle. Mitigation: reuse existing `_yaml_get_simple` and `dlc_frontmatter_get` patterns from dag.sh and config.sh.

## Boundaries

This unit creates the pass files and resolution library ONLY. It does NOT:
- Inject pass context into hooks (unit-03)
- Change hat resolution logic (unit-02)
- Update elaborate or execute skills (unit-04, unit-05)
- Modify the settings schema (unit-06)
- Update documentation (unit-07, unit-08)

## Notes

- Follow the existing coding style in `plugin/lib/config.sh` and `plugin/lib/dag.sh` for shell functions
- Frontmatter parsing should use `dlc_frontmatter_get` helper already available in the codebase
- The `available_workflows` field should be parsed as a YAML array, matching how `depends_on` is parsed in dag.sh

---

## unit-02-hat-augmentation.md

---
status: pending
last_updated: ""
depends_on: [unit-01-pass-definitions]
branch: ai-dlc/first-class-passes/02-hat-augmentation
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
---

# unit-02-hat-augmentation

## Description

Change the hat resolution pattern from override to augmentation in both `inject-context.sh` and `subagent-context.sh`. Plugin hats become canonical — project hats with matching names append instructions rather than replacing them. Project hats with new names remain standalone custom hats.

## Domain Entities

- **Hat**: Plugin-defined hats at `plugin/hats/*.md` are canonical. Project hats at `.ai-dlc/hats/*.md` either augment (same name) or define new custom hats (new name).

## Data Sources

- `plugin/hooks/inject-context.sh` lines 614-665 — current override resolution logic
- `plugin/hooks/subagent-context.sh` lines 185-192 — current override resolution logic
- `plugin/hats/*.md` — plugin built-in hats
- `.ai-dlc/hats/*.md` — project hats (currently override, will become augmentation)

## Technical Specification

### 1. Change `inject-context.sh` hat resolution (lines 614-665)

Current pattern (REPLACE THIS):
```bash
if [ -f ".ai-dlc/hats/${HAT}.md" ]; then
  HAT_FILE=".ai-dlc/hats/${HAT}.md"
elif [ -n "$PLUGIN_ROOT" ] && [ -f "${PLUGIN_ROOT}/hats/${HAT}.md" ]; then
  HAT_FILE="${PLUGIN_ROOT}/hats/${HAT}.md"
fi
```

New pattern:
```bash
# Always load plugin hat first (canonical)
PLUGIN_HAT_FILE=""
PROJECT_HAT_FILE=""

if [ -n "$PLUGIN_ROOT" ] && [ -f "${PLUGIN_ROOT}/hats/${HAT}.md" ]; then
  PLUGIN_HAT_FILE="${PLUGIN_ROOT}/hats/${HAT}.md"
fi

if [ -f ".ai-dlc/hats/${HAT}.md" ]; then
  PROJECT_HAT_FILE=".ai-dlc/hats/${HAT}.md"
fi
```

When rendering hat instructions:
- If both exist: render plugin hat instructions, then append project hat body under `## Project Augmentation`
- If only plugin exists: render plugin hat instructions (current behavior for built-in hats)
- If only project exists: render project hat instructions (custom hat, not augmenting anything)
- If neither exists: show "Custom hat — no instructions found" message (existing behavior)

### 2. Change `subagent-context.sh` hat resolution (lines 185-192)

Apply the same augmentation pattern. Current code:
```bash
if [ -f ".ai-dlc/hats/${HAT}.md" ]; then
  HAT_FILE=".ai-dlc/hats/${HAT}.md"
elif [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md" ]; then
  HAT_FILE="${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md"
fi
```

Change to load both files and merge instructions using the same augmentation logic.

### 3. Shared augmentation helper

Since both hooks need the same merge logic, extract a shared function. Options:
- Add to `plugin/lib/pass.sh` (created in unit-01) as a generic `load_augmented_instructions` function
- Or inline in both hooks if the logic is simple enough (read plugin body, read project body, concatenate with heading)

The function signature:
```bash
# load_augmented_instructions <plugin_file> <project_file>
# Returns: plugin instructions + optional "## Project Augmentation
{project instructions}"
```

### 4. Update execute skill hat resolution

The execute skill (`plugin/skills/execute/SKILL.md`) also resolves hats at lines 643-648 and 760-765 using the same override pattern. Update these to use the same augmentation pattern, or reference the shared function.

## Success Criteria

- [ ] Plugin hat is always loaded when it exists — project hat with same name never replaces it
- [ ] Project hat with same name as plugin hat: its body is appended under `## Project Augmentation` heading
- [ ] Project hat with new name (no plugin match): loaded as standalone custom hat
- [ ] When neither plugin nor project hat exists: existing "no instructions found" message is preserved
- [ ] `inject-context.sh` uses augmentation pattern
- [ ] `subagent-context.sh` uses augmentation pattern
- [ ] `execute/SKILL.md` hat resolution references use augmentation pattern

## Risks

- **Breaking existing project hats**: Projects currently using `.ai-dlc/hats/builder.md` as a full replacement will now see their instructions appended to the plugin builder instead. Mitigation: this is the intended behavior change — project instructions augment rather than replace.
- **Duplicate instructions**: If a project hat copies plugin instructions and adds to them, the augmented output will have duplicates. Mitigation: document that project hat files should contain ONLY additional instructions, not copies of plugin instructions.

## Boundaries

This unit changes hat resolution ONLY. It does NOT:
- Create pass definition files (unit-01)
- Inject pass context into hooks (unit-03)
- Update elaborate or execute skill logic beyond hat resolution (unit-04, unit-05)

## Notes

- The provider loading pattern in `config.sh` (`load_provider_instructions`) is the precedent — it loads plugin markdown first, then merges project overrides. Study that implementation.
- The "## Project Augmentation" heading helps agents distinguish between canonical and project-added instructions.
- Also update the fallback "Create a hat definition at..." message to explain augmentation: "To augment an existing hat, create `.ai-dlc/hats/{hat}.md` with additional instructions."

---

## unit-03-pass-context-injection.md

---
status: pending
last_updated: ""
depends_on: [unit-01-pass-definitions, unit-02-hat-augmentation]
branch: ai-dlc/first-class-passes/03-pass-context-injection
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
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

---

## unit-04-elaborate-skill-updates.md

---
status: pending
last_updated: ""
depends_on: [unit-01-pass-definitions]
branch: ai-dlc/first-class-passes/04-elaborate-skill-updates
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
---

# unit-04-elaborate-skill-updates

## Description

Update the elaborate skill's Phase 5.95 (Iteration Passes) to present configured passes as a suggestion rather than silently applying them, support custom pass names validated against available definitions, and properly tag units with their pass.

## Domain Entities

- **PassDefinition**: Validated via `validate_pass_exists` from unit-01's `pass.sh`
- **Intent**: `passes` and `active_pass` frontmatter fields written during elaboration
- **Unit**: `pass` frontmatter field set to the active pass during elaboration
- **Settings**: `default_passes` array in `.ai-dlc/settings.yml`

## Data Sources

- `plugin/skills/elaborate/SKILL.md` — Phase 5.95 (lines 1320-1341) is the primary target
- `plugin/schemas/settings.schema.json` — `default_passes` field definition (lines 42-50)
- `plugin/lib/pass.sh` — pass validation functions (created in unit-01)
- `.ai-dlc/settings.yml` — source of `default_passes` configuration

## Technical Specification

### 1. Update Phase 5.95 to present passes as suggestion

Current behavior: if `DEFAULT_PASSES` has 2+ entries, apply them directly without asking.

New behavior:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/pass.sh"
DEFAULT_PASSES=$(yq -r '.default_passes // [] | join(",")' .ai-dlc/settings.yml 2>/dev/null || echo "")
```

**If `DEFAULT_PASSES` is empty or contains fewer than 2 entries**: skip this phase entirely (same as current). Set `passes: []` and `active_pass: ""`.

**If `DEFAULT_PASSES` has 2+ entries**: validate each pass name, then ask the user to confirm:

```bash
# Validate each configured pass
for pass_name in $(echo "$DEFAULT_PASSES" | tr ',' ' '); do
  if ! validate_pass_exists "$pass_name"; then
    echo "WARNING: Pass '$pass_name' has no definition file. Skipping."
  fi
done
```

Present to user via AskUserQuestion:
```
"Project default passes: {pass1} → {pass2} → {pass3}. Use these for this intent?"
Options:
- "Use defaults" — Apply the configured passes
- "Override" — Specify different passes or use single-pass
- "Single pass (dev only)" — Skip multipass, use single implicit dev pass
```

If "Override": ask the user which passes and in what order, validating each against `validate_pass_exists`.

### 2. Support custom pass names

Currently `default_passes` is constrained to `["design", "product", "dev"]` by the settings schema enum. The schema change is in unit-06, but the elaborate skill needs to work with any valid pass name.

When validating passes, check `validate_pass_exists` rather than comparing against a hardcoded list. Any pass name that has a definition file (in `plugin/passes/` or `.ai-dlc/passes/`) is valid.

### 3. Display pass information during elaboration

When passes are configured for the intent, show the pass context to the user:

```markdown
## Passes Configured

| Pass | Description | Available Workflows |
|------|-------------|-------------------|
| design | Visual and interaction design | design |
| product | Behavioral specification and gap analysis | default, bdd |
| dev | Working implementation | default, tdd, adversarial, bdd |

Active pass: **design** (units elaborated in this session belong to this pass)
```

Load descriptions from pass definitions using `load_pass_metadata`.

### 4. Tag units with active pass

When writing unit frontmatter in Phase 6 Step 3, set `pass:` to the active pass value:

```yaml
pass: "design"  # Set to active_pass when passes are configured
```

This is already partially described in the elaborate skill but should be explicitly enforced: every unit created during a pass gets tagged with that pass.

### 5. Update intent.md frontmatter format

The `passes` field in intent frontmatter should be a flat array of pass names (matching the current implementation), NOT structured objects with per-pass status (as the paper currently shows). The paper will be updated in unit-07 to match.

```yaml
passes: [design, product, dev]
active_pass: "design"
```

## Success Criteria

- [ ] Phase 5.95 presents configured passes as a suggestion with AskUserQuestion (not silently applied)
- [ ] User can accept defaults, override with different passes, or choose single-pass
- [ ] Custom pass names are validated against `validate_pass_exists` — invalid names produce a warning
- [ ] Pass descriptions and available workflows are displayed when passes are configured
- [ ] Units created during elaboration have `pass:` set to the active pass value
- [ ] Single-pass intents (empty or 1-entry default_passes) skip Phase 5.95 entirely (backward compatible)

## Risks

- **User confusion**: If the user doesn't understand passes, the AskUserQuestion could be confusing. Mitigation: clear description in the question text explaining what passes do and that single-pass is always an option.
- **Pass validation on empty project**: New projects won't have `.ai-dlc/passes/` yet. Mitigation: `validate_pass_exists` checks plugin passes first, so built-in passes always validate. Custom passes require the project to create definition files.

## Boundaries

This unit updates the elaborate skill's pass handling ONLY. It does NOT:
- Create pass definition files (unit-01)
- Change hook injection (unit-03)
- Update execute skill pass transitions (unit-05)
- Modify the settings schema (unit-06)
- Update documentation (unit-07, unit-08)

## Notes

- The autonomous mode behavior should also be updated: in autonomous mode, auto-accept default passes without asking (current behavior) but validate each pass name first.
- The `active_pass` in intent frontmatter is what the hooks read during construction. Getting this right during elaboration is critical.

---

## unit-05-execute-skill-updates.md

---
status: pending
last_updated: ""
depends_on: [unit-01-pass-definitions, unit-02-hat-augmentation, unit-03-pass-context-injection]
branch: ai-dlc/first-class-passes/05-execute-skill-updates
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
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

---

## unit-06-settings-schema.md

---
status: pending
last_updated: ""
depends_on: [unit-01-pass-definitions]
branch: ai-dlc/first-class-passes/06-settings-schema
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
---

# unit-06-settings-schema

## Description

Update the settings schema to remove the hardcoded pass enum and accept any string that maps to a pass definition file. Update the setup skill and fundamentals skill to document pass customization.

## Domain Entities

- **Settings**: `default_passes` field in `.ai-dlc/settings.yml`
- **PassDefinition**: Available passes determined by files in `plugin/passes/` and `.ai-dlc/passes/`

## Data Sources

- `plugin/schemas/settings.schema.json` — `default_passes` definition (lines 42-50)
- `plugin/skills/setup/SKILL.md` — initial project setup that creates settings.yml
- `plugin/skills/fundamentals/SKILL.md` — documents pass customization for users

## Technical Specification

### 1. Update `settings.schema.json`

Current:
```json
"default_passes": {
  "type": "array",
  "items": {
    "type": "string",
    "enum": ["design", "product", "dev"]
  },
  "default": [],
  "description": "Default iteration passes for new intents. Empty array means single dev pass (the default). Example: ['design', 'dev'] for design-then-dev workflow."
}
```

Change to:
```json
"default_passes": {
  "type": "array",
  "items": {
    "type": "string"
  },
  "default": [],
  "description": "Default iteration passes for new intents. Each name must have a pass definition file in plugin/passes/ or .ai-dlc/passes/. Empty array means single dev pass (the default). Built-in passes: design, product, dev. Custom passes: create .ai-dlc/passes/{name}.md."
}
```

Remove the `enum` constraint, leaving `type: string`. Validation happens at runtime via `validate_pass_exists`.

### 2. Update setup skill

In `plugin/skills/setup/SKILL.md`, update the passes configuration section to:
- List built-in passes (design, product, dev) with their descriptions
- Explain that custom passes can be created by adding `.ai-dlc/passes/{name}.md`
- Show the available passes dynamically using `list_available_passes` from pass.sh
- Default to `[]` (single dev pass) unless the user opts into multipass

### 3. Update fundamentals skill

In `plugin/skills/fundamentals/SKILL.md`, add a section on passes:
- What passes are and when to use them
- Built-in pass types and their purposes
- How to create custom passes (`.ai-dlc/passes/{name}.md` format)
- How to augment built-in passes with project-specific instructions
- How to configure default passes in settings.yml
- Single-pass vs multipass tradeoffs

### 4. Update TypeScript types if needed

Check `plugin/shared/src/types.ts` — the `passes?: string[]` and `active_pass?: string` types are already correct (no enum constraint in TypeScript). Verify no TypeScript validation code hardcodes the pass names.

## Success Criteria

- [ ] `settings.schema.json` `default_passes.items` has no `enum` constraint — accepts any string
- [ ] Schema description documents built-in passes and how to create custom ones
- [ ] Setup skill presents available passes dynamically (built-in + project-defined)
- [ ] Fundamentals skill documents pass customization, augmentation, and single-pass default
- [ ] TypeScript types do not hardcode pass name validation

## Risks

- **Invalid pass names**: Without enum validation, users could configure pass names with no definition file. Mitigation: runtime validation via `validate_pass_exists` in the elaborate skill (unit-04). Schema relaxation is intentional.

## Boundaries

This unit updates schema and documentation skills ONLY. It does NOT:
- Create pass definition files (unit-01)
- Change hook behavior (unit-02, unit-03)
- Modify elaborate or execute flow logic (unit-04, unit-05)
- Update the paper or website (unit-07, unit-08)

## Notes

- The schema change is minimal (removing `enum`). The real documentation work is in the fundamentals skill, which is the primary reference for users learning the methodology.
- The setup skill should mention passes as an advanced/optional feature — don't overwhelm new users.

---

## unit-07-paper-updates.md

---
status: pending
last_updated: ""
depends_on: [unit-01-pass-definitions]
branch: ai-dlc/first-class-passes/07-paper-updates
discipline: documentation
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
---

# unit-07-paper-updates

## Description

Update the AI-DLC 2026 paper to accurately describe the pass system as implemented: pass definition files, the pass loop, pass-backs, workflow constraints per pass, project customization (augmentation pattern), and the single-pass default. Fix the paper-implementation mismatch where the paper shows structured pass objects but implementation uses flat arrays.

## Domain Entities

- **Paper**: The methodology specification at `website/content/papers/ai-dlc-2026.md`
- **PassDefinition**: As implemented in the plugin — the paper must describe what the plugin does

## Data Sources

- `website/content/papers/ai-dlc-2026.md` — the paper. Key sections:
  - "Iteration Through Passes" (line 373) — main pass description
  - "Pass" glossary entry (line 698) — artifact definition
  - "Multi-Pass Elaboration" (line 1085) — elaboration flow
  - "Execution Phase" (line 1099) — execution with passes
  - Glossary (line ~1684) — pass definition
  - Mermaid diagram (lines 379-415) — pass flow visualization
- `plugin/passes/*.md` — built-in pass definitions (created in unit-01) — the source of truth for what passes do

## Technical Specification

### 1. Fix pass frontmatter format mismatch

The paper currently shows structured pass objects in intent frontmatter (line 720):
```yaml
passes:
  - type: design
    status: completed
  - type: product
    status: active
  - type: dev
    status: pending
```

The implementation uses flat arrays:
```yaml
passes: [design, product, dev]
active_pass: "design"
```

Update ALL paper references to use the flat array format matching the implementation. Pass status is tracked implicitly through `active_pass` and unit statuses, not per-pass status fields.

### 2. Update "Iteration Through Passes" section (line 373)

Expand this section to describe:
- **Pass definition files**: passes are defined as frontmatter-enabled markdown files with instructions and workflow constraints
- **Built-in passes**: design, product, dev — with brief descriptions matching the pass definition files
- **Pass instructions**: injected into hat context during construction, shaping what the hat produces
- **Workflow constraints**: each pass declares which workflows are available. A design pass only allows the design workflow; a dev pass allows default, tdd, adversarial, bdd
- **The pass loop**: elaborate → execute → (transition) → elaborate → execute → ... → done
- **Single-pass default**: intents with no passes configured use a single implicit dev pass with zero overhead

### 3. Add pass customization documentation

Add a subsection on pass customization:
- **Project augmentation**: projects can augment built-in passes by creating `.ai-dlc/passes/{name}.md` — instructions are appended, not replaced
- **Custom passes**: projects can define entirely new pass types by creating `.ai-dlc/passes/{name}.md` with a name that doesn't match any built-in pass
- **Pass configuration**: `default_passes` in settings.yml, user confirms per intent during elaboration
- **Same augmentation pattern applies to hats**: plugin hats are canonical, project hats augment

### 4. Document pass-backs

Expand the existing pass-back description to be more specific:
- When a later pass discovers issues requiring earlier-pass work, `active_pass` is set backward
- Re-elaboration occurs for the target pass (new units are created alongside existing ones)
- Forward progression resumes after the pass-back is resolved
- Pass-backs are triggered manually (by reviewer recommendation or user decision), not automatically

### 5. Update the Pass artifact definition (line 698)

Revise to mention:
- Pass definition files (not just the conceptual definition)
- Frontmatter fields: `available_workflows`, `default_workflow`
- The augmentation pattern for project customization
- Updated frontmatter example using flat array format

### 6. Update the glossary entry (line ~1684)

Add: "Passes are defined as frontmatter-enabled markdown files with instructions and workflow constraints. Built-in passes: design, product, dev. Projects can augment or extend."

### 7. Update Mermaid diagram if needed

The existing Mermaid diagram (lines 379-415) showing the three-pass flow is still accurate. Verify it doesn't need changes. If adding pass-back arrows or customization notes, keep the diagram clean and simple.

## Success Criteria

- [ ] Paper pass frontmatter examples use flat array format matching implementation (`passes: [design, product, dev]`, `active_pass: "design"`)
- [ ] "Iteration Through Passes" section describes pass definition files, instructions, and workflow constraints
- [ ] Pass customization (augmentation pattern) is documented in the paper
- [ ] Pass-backs are described with specific mechanics (active_pass set backward, re-elaborate, resume forward)
- [ ] Pass artifact definition updated with definition file details and updated frontmatter example
- [ ] Glossary entry updated to mention definition files and customization
- [ ] Single-pass default is clearly stated as zero-overhead
- [ ] Hat augmentation pattern (same as passes) is mentioned for consistency
- [ ] Paper claims match the implementation in the plugin — no aspirational features presented as implemented

## Risks

- **Paper drift**: The paper could describe aspirational features not yet implemented. Mitigation: every claim should map to a specific implementation file. If it doesn't exist yet, mark it clearly.
- **Over-documentation**: Adding too much implementation detail makes the paper less readable. Mitigation: keep the paper focused on concepts and principles. Refer to plugin files for implementation specifics.

## Boundaries

This unit updates the paper ONLY. It does NOT:
- Create pass definition files (unit-01)
- Change plugin implementation (unit-02 through unit-06)
- Update website content (unit-08)

## Notes

- The paper is the source of truth for methodology concepts. Changes here should focus on "what and why," not "how to implement it in bash."
- After updating the paper, verify cross-component consistency per the sync-check rule: does the plugin implement what the paper describes?
- The pass concept aligns with the paper's existing philosophy: "Everyone Becomes a Builder" — passes don't change the workflow, they change the lens.

---

## unit-08-website-updates.md

---
status: pending
last_updated: ""
depends_on: [unit-07-paper-updates]
branch: ai-dlc/first-class-passes/08-website-updates
discipline: documentation
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
---

# unit-08-website-updates

## Description

Update the website docs and homepage to reflect the pass concept. The website presents the methodology to users — it needs to explain passes clearly for both developers exploring AI-DLC and teams evaluating multipass workflows.

## Domain Entities

- **Website**: Next.js 15 static site at `website/`
- **Docs**: Content at `website/content/docs/`
- **Homepage**: Landing page content

## Data Sources

- `website/content/docs/` — existing documentation pages
- `website/content/papers/ai-dlc-2026.md` — the paper (updated in unit-07, source of truth for concepts)
- `website/src/` — page components and layouts
- Homepage content (find the main landing page file)

## Technical Specification

### 1. Identify existing website docs that reference passes

Search `website/content/docs/` for any existing references to passes, multipass, or iteration. Also check the homepage content for methodology descriptions that should mention passes.

### 2. Update or create docs page for passes

If a passes-specific docs page doesn't exist, create one at an appropriate location in the docs hierarchy. If pass content exists elsewhere, update it.

The docs page should cover:
- **What is a pass?** — A typed iteration through the AI-DLC loop (elaborate → execute → review) through a different disciplinary lens
- **Built-in passes**: design, product, dev — with descriptions of what each produces
- **When to use multipass**: Cross-functional teams, complex features requiring design → product → dev flow
- **When to stay single-pass**: Solo developers, small tasks, pure engineering work (the default)
- **The pass loop**: Same intent, artifacts accumulate, each pass elaborates and executes before the next begins
- **Pass-backs**: When a later pass discovers issues, work flows back to an earlier pass
- **Customization**: How to create custom passes (`.ai-dlc/passes/{name}.md`), how to augment built-in passes
- **Configuration**: `default_passes` in settings.yml, per-intent override during elaboration

### 3. Update homepage if it describes methodology phases

If the homepage describes the AI-DLC lifecycle or workflow, add a mention of passes as the mechanism for cross-functional iteration. Keep it brief — the homepage is marketing-level, not tutorial-level.

### 4. Update any existing docs that describe the construction loop

If existing docs describe the elaborate → execute → review loop, add a note about how passes wrap this loop with different disciplinary lenses. Passes don't change the loop — they change what the loop produces.

### 5. Verify all website claims match paper and implementation

Per the sync-check rule:
- Are claims about the methodology accurate to the paper (updated in unit-07)?
- Are claims about the plugin accurate to the implementation (updated in units 01-06)?

## Success Criteria

- [ ] Website docs explain what passes are and when to use them
- [ ] Built-in passes (design, product, dev) are described with their purposes
- [ ] Single-pass default is clearly communicated — multipass is opt-in
- [ ] Pass customization (augmentation, custom passes) is documented
- [ ] Homepage mentions passes if it describes the methodology lifecycle
- [ ] All website claims about passes match the paper and plugin implementation
- [ ] Website builds successfully (`bun run build` in website directory)

## Risks

- **Stale docs**: If other docs pages describe the lifecycle without mentioning passes, the information is incomplete. Mitigation: search all docs for lifecycle/phase/workflow references and update as needed.
- **Scope creep into website redesign**: The docs update could expand into a full website overhaul. Mitigation: only update content related to passes. Don't reorganize unrelated docs.

## Boundaries

This unit updates website content ONLY. It does NOT:
- Update the paper (unit-07)
- Change plugin implementation (units 01-06)
- Redesign the website layout or navigation
- Add new website features unrelated to passes

## Notes

- The website is a Next.js 15 static site. Content is in `website/content/docs/` as markdown files.
- Keep docs language accessible — passes should be explained in terms a developer new to AI-DLC can understand.
- Link to the paper for the full theoretical treatment. The docs should be practical, the paper conceptual.

---

# Discovery Context

---
intent: first-class-passes
created: 2026-03-31
status: active
---

# Discovery Log: First-Class Passes

Elaboration findings persisted during Phase 2.5 domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.

## Codebase Context

**Stack:** Shell (hooks/lib), TypeScript (shared parser, CLI dashboard, MCP server), Next.js 15 (website)
**Architecture:** Monorepo with three components — plugin (Claude Code plugin), website (Next.js static site), paper (methodology spec). Plugin uses bash hooks and SKILL.md-based agent orchestration.
**Build tools:** Bun (lockfile present: `bun.lock`), Biome (linting/formatting), npm workspaces (`website`, `plugin/shared`, `plugin/mcp-server`, `plugin/cli`)
**Conventions:** YAML frontmatter in markdown files for metadata, bash hooks for lifecycle events, shell libraries in `plugin/lib/`, hat definitions as markdown in `plugin/hats/`, skills as `SKILL.md` files in `plugin/skills/{name}/`
**Concerns:** Hat resolution currently uses override semantics (project `.ai-dlc/hats/` replaces plugin `hats/`), needs to change to augmentation. No pass definition files exist yet (`plugin/passes/` directory missing). Pass types are hardcoded as an enum in settings schema.

## Codebase Pattern: Current Pass Implementation

Passes currently exist as a scheduling/metadata concept only -- they control which units execute in a given phase but do NOT influence how hats behave during construction. Here is a comprehensive map of every file that touches passes:

### Data Model (types.ts)
- `IntentFrontmatter.passes?: string[]` -- ordered pass array on the intent
- `IntentFrontmatter.active_pass?: string` -- currently active pass
- `UnitFrontmatter.pass?: string` -- which pass a unit belongs to

### Settings Schema (settings.schema.json)
- `default_passes` property: `type: "array"`, items: `enum: ["design", "product", "dev"]`
- **Problem:** Hardcoded enum. Custom passes (e.g., "security", "accessibility") cannot be added without schema changes.
- Default is `[]` (empty = single implicit dev pass)

### Elaborate Skill (Phase 5.95)
- Reads `default_passes` from `.ai-dlc/settings.yml` via yq
- If <2 entries: sets `passes: []`, `active_pass: ""` (skip)
- If >=2 entries: sets `passes` to configured array, `active_pass` to first entry
- Override via `.ai-dlc/{intent}/settings.yml`
- Unit template includes `pass: ""` field

### Execute Skill (Step 5c completion)
- On intent completion, checks for next pass in the sequence
- Parses `passes:` and `active_pass:` from intent.md via grep/sed
- If next pass exists: updates `active_pass`, notifies user to re-elaborate, saves `status=pass_transition`
- If no next pass: marks intent complete

### DAG Library (dag.sh)
- `parse_unit_pass()` function extracts `pass` field from unit frontmatter
- `find_ready_units_for_pass()` function filters ready units by active_pass
- When `active_pass` is empty, returns all ready units (backward compatible)

### Hook Injection (inject-context.sh and subagent-context.sh)
- **inject-context.sh** (lines 615-665): Hat resolution uses override pattern:
  1. Check `.ai-dlc/hats/${HAT}.md` (project override)
  2. If not found, check `${PLUGIN_ROOT}/hats/${HAT}.md` (plugin built-in)
  - Project file completely replaces plugin file (no augmentation)
  - **No pass context is injected** -- hats get no awareness of the active pass
- **subagent-context.sh** (lines 186-214): Same override pattern for hat resolution
  - Again, project `.ai-dlc/hats/` completely replaces plugin hats
  - No pass context injection

### Paper Documentation
- **Section: "Iteration Through Passes"** (line 373): Well-documented conceptual model with mermaid diagram showing design/product/dev passes with backward flow
- **Glossary entry "Pass"** (line 698): Documents pass structure, built-in types table, and frontmatter format
- **Note:** The paper shows pass frontmatter as `- type: design / status: completed` (structured objects), but the actual implementation uses flat string arrays (`passes: [design, dev]`). This is a paper-implementation mismatch.

### Website Docs (concepts.md)
- Lines 61-87: Pass types table, configuration example, basic explanation
- Lines 355-380: "When to Use Passes" section, backward flow diagram
- Fairly complete but lacks detail on pass-backs and lifecycle

### Workflows (workflows.yml)
- 6 named workflows: default, adversarial, design, hypothesis, tdd, bdd
- **No pass-to-workflow mapping** -- passes don't constrain which workflows are available
- The `design` workflow uses `[planner, designer, reviewer]` hats -- this is relevant for design passes but there's no mechanism linking them

### What's Missing (The Gap)
1. **No pass definition files** -- `plugin/passes/` directory doesn't exist
2. **No pass-to-hat context injection** -- hats don't know what pass they're in
3. **No per-pass workflow constraints** -- any workflow can be used in any pass
4. **No project-level pass customization** -- can't add/augment passes per project
5. **Hat resolution is override-only** -- project hats replace, not augment
6. **Settings schema hardcodes pass enum** -- can't add custom pass types
7. **Paper-implementation mismatch** on pass frontmatter format

## Codebase Pattern: Hat Resolution and Context Injection

### Current Hat Resolution Pattern

Both `inject-context.sh` (SessionStart hook) and `subagent-context.sh` (SubagentPrompt hook) use the same override pattern:

**inject-context.sh (lines 615-665):**
```bash
# Resolution order: 1) User override (.ai-dlc/hats/), 2) Plugin built-in (hats/)
HAT_FILE=""
if [ -f ".ai-dlc/hats/${HAT}.md" ]; then
  HAT_FILE=".ai-dlc/hats/${HAT}.md"
elif [ -n "$PLUGIN_ROOT" ] && [ -f "${PLUGIN_ROOT}/hats/${HAT}.md" ]; then
  HAT_FILE="${PLUGIN_ROOT}/hats/${HAT}.md"
fi
```

**subagent-context.sh (lines 186-214):**
```bash
if [ -f ".ai-dlc/hats/${HAT}.md" ]; then
  HAT_FILE=".ai-dlc/hats/${HAT}.md"
elif [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md" ]; then
  HAT_FILE="${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md"
fi
```

**Problem:** This is a pure override pattern -- if `.ai-dlc/hats/builder.md` exists, it completely replaces `plugin/hats/builder.md`. The user must copy the entire canonical hat definition just to add a few lines.

### Desired Pattern (from intent description)

The new pattern should be **augmentation, not override**:
1. Plugin hat definitions are canonical (always loaded)
2. Project `.ai-dlc/hats/{hat}.md` with matching name **appends** instructions
3. Project `.ai-dlc/hats/{hat}.md` with a new name is a custom hat (no plugin equivalent)

This matches how workflows already work -- `plugin/workflows.yml` provides defaults, `.ai-dlc/workflows.yml` can override/add entries. But for hats, we want append, not replace.

### Context Injection Insertion Point

Both hooks build context output as sequential echo statements. The hat injection is near the end:
- `inject-context.sh`: lines 627-665 (hat instructions section)
- `subagent-context.sh`: lines 185-215 (hat instructions section)

The pass context should be injected AFTER the hat instructions, as an additional context block. This is where pass definition instructions would go.

### Current Workflow Loading Pattern

Workflows use a merge pattern in `inject-context.sh` (lines 65-119):
1. Parse plugin workflows first
2. Parse project workflows (override or add by name)
3. Build merged workflow list

This is the precedent for the pass definition loading pattern.

### Provider Loading Pattern

Config.sh `load_provider_instructions()` (lines 374-412) uses a three-tier merge:
1. Built-in default (`plugin/providers/{category}.md`)
2. Inline instructions from settings.yml
3. Project override from `.ai-dlc/providers/{type}.md`

Each tier appends; nothing is replaced. This is closest to the desired hat/pass augmentation pattern.

## Architecture Decision: Pass Definition Files

### Proposed Structure

Create `plugin/passes/*.md` files with YAML frontmatter + markdown instructions:

```markdown
---
name: "Design"
description: "Visual and interaction design pass"
available_workflows: [design, default]
default_workflow: design
---

# Design Pass Instructions

When working in the design pass, focus on...
{instructions that get injected into hat context}
```

### File Location Resolution

Same pattern as providers (three-tier merge):

1. **Plugin built-in**: `plugin/passes/{pass-name}.md` (canonical, always loaded)
2. **Project augmentation**: `.ai-dlc/passes/{pass-name}.md` (appends to matching built-in)
3. **Project custom**: `.ai-dlc/passes/{new-name}.md` (new pass not in plugin)

Built-in pass definitions to create:
- `plugin/passes/design.md` -- design pass instructions
- `plugin/passes/product.md` -- product pass instructions
- `plugin/passes/dev.md` -- dev pass instructions (implicit default)

### Frontmatter Schema

```yaml
name: string          # Display name
description: string   # Short description
available_workflows:  # Workflows allowed in this pass
  - design
  - default
default_workflow: string  # Fallback workflow for units in this pass
```

### Injection Point

The pass definition instructions should be injected into hat context during construction (SessionStart and SubagentPrompt hooks):

1. Read `active_pass` from intent.md frontmatter
2. Load the pass definition (plugin + project augmentation)
3. Inject the pass instructions as a new section after hat instructions

This means modifying `inject-context.sh` and `subagent-context.sh` to:
- After loading hat instructions, check for active_pass
- If active_pass is set, load the pass definition
- Inject pass instructions as a `### Active Pass Context` section

### Workflow Constraint Enforcement

Currently `workflow-guard.sh` and the elaborate skill don't consider pass constraints. The implementation should:

1. During elaboration: when assigning workflows to units, check the active pass's `available_workflows`
2. During execution: `workflow-guard.sh` should verify the unit's workflow is allowed for the active pass
3. Fallback: if a unit requests a workflow not in the pass's list, use `default_workflow`

### Settings Schema Change

Current `default_passes` in `settings.schema.json`:
```json
"default_passes": {
  "type": "array",
  "items": { "type": "string", "enum": ["design", "product", "dev"] }
}
```

Should change to:
```json
"default_passes": {
  "type": "array",
  "items": { "type": "string" },
  "default": []
}
```

Any string is valid as long as a matching pass definition file exists (plugin or project level). Validation happens at runtime, not at schema level.

## Architecture Decision: Hat Augmentation Pattern

### Current vs. Proposed

**Current:** Project file replaces plugin file.
```
.ai-dlc/hats/builder.md  →  replaces  →  plugin/hats/builder.md
```

**Proposed:** Plugin file is always loaded. Project file with same name appends.
```
plugin/hats/builder.md     →  always loaded (canonical)
.ai-dlc/hats/builder.md   →  appended after (augmentation)
.ai-dlc/hats/my-custom.md →  standalone custom hat (no plugin equivalent)
```

### Implementation in inject-context.sh

Replace the current if/elif with:

```bash
# Always load plugin hat first (canonical)
HAT_CONTENT=""
PLUGIN_HAT="${PLUGIN_ROOT}/hats/${HAT}.md"
PROJECT_HAT=".ai-dlc/hats/${HAT}.md"

if [ -f "$PLUGIN_HAT" ]; then
  HAT_CONTENT=$(cat "$PLUGIN_HAT" | sed '1,/^---$/d' | sed '1,/^---$/d')
  NAME=$(dlc_frontmatter_get "name" "$PLUGIN_HAT")
  DESC=$(dlc_frontmatter_get "description" "$PLUGIN_HAT")
fi

# Append project augmentation (if exists and plugin hat exists)
if [ -f "$PROJECT_HAT" ] && [ -f "$PLUGIN_HAT" ]; then
  PROJECT_INSTRUCTIONS=$(cat "$PROJECT_HAT" | sed '1,/^---$/d' | sed '1,/^---$/d')
  HAT_CONTENT="${HAT_CONTENT}

### Project Augmentation
${PROJECT_INSTRUCTIONS}"
elif [ -f "$PROJECT_HAT" ] && [ ! -f "$PLUGIN_HAT" ]; then
  # Custom hat (no plugin equivalent)
  HAT_CONTENT=$(cat "$PROJECT_HAT" | sed '1,/^---$/d' | sed '1,/^---$/d')
  NAME=$(dlc_frontmatter_get "name" "$PROJECT_HAT")
  DESC=$(dlc_frontmatter_get "description" "$PROJECT_HAT")
fi
```

### Same Change in subagent-context.sh

The same pattern must be applied in `subagent-context.sh` lines 186-214.

## Existing Implementations: Cross-Component Consistency Check

### Files That Must Be Updated

This intent touches all three components. Here is the full manifest of files requiring changes:

**Plugin (primary implementation):**
- `plugin/passes/design.md` -- NEW: design pass definition
- `plugin/passes/product.md` -- NEW: product pass definition
- `plugin/passes/dev.md` -- NEW: dev pass definition
- `plugin/hooks/inject-context.sh` -- MODIFY: hat augmentation + pass injection
- `plugin/hooks/subagent-context.sh` -- MODIFY: hat augmentation + pass injection
- `plugin/schemas/settings.schema.json` -- MODIFY: remove hardcoded pass enum
- `plugin/skills/elaborate/SKILL.md` -- MODIFY: Phase 5.95 wording, pass definition resolution
- `plugin/skills/execute/SKILL.md` -- MODIFY: pass-aware workflow constraint enforcement
- `plugin/lib/dag.sh` -- VERIFY: `find_ready_units_for_pass()` already pass-aware (likely no changes)
- `plugin/shared/src/types.ts` -- VERIFY: `passes` and `active_pass` fields already present (likely no changes)
- `plugin/workflows.yml` -- VERIFY: may need documentation comments about pass constraints

**Paper (methodology documentation):**
- `website/content/papers/ai-dlc-2026.md` -- MODIFY: Document pass loop, pass-backs, pass customization, fix frontmatter format mismatch

**Website (user-facing documentation):**
- `website/content/docs/concepts.md` -- MODIFY: Update pass section with definition files, customization, augmentation
- Other docs pages may need minor updates

### Paper-Implementation Mismatch Detail

The paper (line 717-728) shows pass frontmatter as structured objects:
```yaml
passes:
  - type: design
    status: completed
  - type: product
    status: active
```

But the actual implementation uses flat string arrays:
```yaml
passes: [design, product, dev]
active_pass: "design"
```

The flat format is simpler and sufficient. The paper should be updated to match the implementation, not the other way around. Pass status is derived from unit completion, not stored in the passes array.

## Deployment Architecture: CI/CD

**CI Platform:** GitHub Actions (`.github/workflows/`)

Workflows present:
- `bump-plugin-version.yml` -- auto-bumps plugin version
- `claude-code-review.yml` -- Claude-powered PR review
- `claude-conflict-resolver.yml` -- automated merge conflict resolution
- `claude.yml` -- Claude Code execution
- `deploy-website.yml` -- website deployment on push to main

No CI changes needed for this intent -- pass definition files are markdown consumed at runtime by Claude Code hooks, not built artifacts.

## Quality Gate Candidates

Detected from project tooling:

| Gate | Command | Source |
|------|---------|--------|
| lint | `bun run lint` | `package.json` `scripts.lint` (uses Biome) |
| build | `bun run build` | `package.json` `scripts.build` (builds all workspaces) |

**Note:** `bun.lock` present, so all npm commands should use `bun` instead.

No test runner detected -- `package.json` has no `scripts.test` entry. The plugin is primarily markdown/shell-based; tests would be shell script tests if any existed.

Recommended `quality_gates:` YAML block:
```yaml
quality_gates:
  - name: lint
    command: bun run lint
  - name: build
    command: bun run build
```

## Domain Model

### Entities

- **PassDefinition**: A typed pass with instructions and workflow constraints -- Fields: name, description, available_workflows, default_workflow, instructions (markdown body)
- **Intent**: The overall feature being built -- Fields: workflow, git config, passes (ordered array), active_pass (current), status, units
- **Unit**: A discrete work item within an intent -- Fields: status, depends_on, branch, discipline, pass (which pass it belongs to), workflow
- **Hat**: A role in the construction workflow -- Fields: name, description, instructions (markdown body)
- **Workflow**: A named sequence of hats -- Fields: name, description, hats (ordered array)
- **Settings**: Project-level configuration -- Fields: default_passes, providers, quality_gates, etc.

### Relationships

- Intent has many Units
- Intent has an ordered sequence of Passes (via `passes` array)
- Intent has one active Pass (via `active_pass`)
- Unit belongs to one Pass (via `pass` field)
- PassDefinition constrains available Workflows (via `available_workflows`)
- Workflow defines a sequence of Hats (via `hats` array)
- Hat receives PassDefinition instructions during construction (via hook injection)
- Settings provides default Passes for new Intents (via `default_passes`)
- ProjectPassDefinition augments a PluginPassDefinition (same name = append)
- ProjectHat augments a PluginHat (same name = append, new name = custom)

### Data Sources

- **Plugin filesystem** (markdown files):
  - Available: hat definitions, skill definitions, workflow definitions, hook scripts, settings schema
  - Missing: pass definition files (to be created)
  - Real sample: `plugin/hats/builder.md` with frontmatter + markdown body

- **Project filesystem** (.ai-dlc/ directory):
  - Available: intent.md, unit-*.md, settings.yml, custom workflows, custom hats
  - Missing: custom pass definitions (`.ai-dlc/passes/`)
  - Real sample: `.ai-dlc/settings.yml` with `default_passes: [design, dev]`

- **TypeScript parser** (plugin/shared/src/):
  - Available: IntentFrontmatter with `passes?` and `active_pass?`, UnitFrontmatter with `pass?`
  - Missing: PassDefinition type (new), no changes needed to existing types

### Data Gaps

- **Pass definition content**: Need to author the actual instructions for design, product, and dev passes. These should describe what hats should focus on during each pass type. Research into design methodology, product management practices, and development best practices needed to write high-quality instructions.
- **Workflow constraint validation**: Need to determine what happens when a unit's workflow conflicts with the pass's allowed workflows. The intent description says "fall back to default_workflow" which is straightforward.
- **Pass-back mechanism detail**: The intent describes backward pass transitions but the implementation details are sparse. Need to define: who triggers a pass-back, how is `active_pass` updated, are existing units in the new active pass re-elaborated or just new units added?
