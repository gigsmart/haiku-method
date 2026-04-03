---
description: (Internal) Unit decomposition, cross-cutting concerns, and spec flow analysis for H·AI·K·U elaboration
user-invocable: false
---

# Elaborate: Decompose

Composable sub-skill for decomposing an intent into units with dependency graphs, cross-cutting concern analysis, and spec flow validation. Used by single-stage and stage-elaborate mode sub-skills.

**This sub-skill runs inline** — it has access to `AskUserQuestion` and the full conversation context.

---

## Inputs (from calling context)

- `INTENT_SLUG` — the intent slug
- `AUTONOMOUS_MODE` — `true` or `false`
- `DOMAIN_MODEL` — the domain model from discovery
- `SUCCESS_CRITERIA` — the confirmed success criteria from the criteria sub-skill
- `SELECTED_WORKFLOW` — the selected workflow from workflow-select
- `UNIT_TYPES` (optional) — if set by stage-elaborate, constrains which unit disciplines to create. Empty for single-stage (all types).
- `PRIOR_UNITS` (optional) — units from prior stages that this stage's units may reference or depend on
- `ITERATES_ON` (optional) — previous intent context for iteration intents

---

## Step 1: Decompose into Units

Decompose the intent into **Units** — independent pieces of work. **You decide** whether decomposition is needed based on the scope:

- **Single unit**: The intent touches one concern, one area of code, one deliverable. No decomposition needed — create one unit and proceed.
- **Multiple units**: The intent spans multiple concerns, systems, layers, or deliverables. Decompose into 2-5 units.

Do NOT ask the user whether to decompose. Assess the complexity from the domain model, success criteria, and data sources — then decompose accordingly.

### Unit Type Filtering

When `UNIT_TYPES` is set, only create units with disciplines matching the values. The active stage's definition file specifies which unit types belong to this stage.

When `UNIT_TYPES` is empty (single-stage), create units of all types as needed.

### Iteration Intents

> When `ITERATES_ON` is set, reference the previous intent's units to understand what already exists in the codebase:
> - **Identify which previous units are affected** by the follow-up work
> - **Suggest units that modify or extend** specific previous units rather than starting from scratch
> - **Auto-populate `context` references** pointing to previous unit files
> - **Avoid duplicating work** — describe how the new unit *changes* existing work
> - **Carry forward domain knowledge** from the previous intent

### Hard Rules for Unit Boundaries

1. **Units MUST NOT span dependency boundaries.** If a piece of work depends on another piece being done first, those are two separate units with an explicit `depends_on` edge.

2. **Units MUST NOT span domains.** A unit has exactly one discipline (frontend, backend, api, documentation, devops, design, etc.). No unit should mix frontend and backend work.

3. **Design work is its own unit.** If a feature needs UI/UX design work, create a separate unit with `discipline: design` and `workflow: design`.

### Per-Unit Workflow Suggestions

| Discipline / Concern | Suggested Workflow | Rationale |
|---|---|---|
| `backend`, `api`, `devops`, `documentation` | `default` (planner → builder → reviewer) | Standard implementation cycle |
| `design` | `design` (planner → designer → reviewer) | Design artifacts need design hat, not builder |
| `infrastructure` | `default` (planner → builder → reviewer) | IaC provisioning follows standard plan-build-review |
| `observability` | `default` (planner → builder → reviewer) | Monitoring/alerting setup follows standard plan-build-review |
| Security-sensitive units | `adversarial` (planner → builder → red-team → blue-team → reviewer) | Adversarial testing for auth, crypto, data handling |
| Test-driven units | `tdd` (test-writer → implementer → refactorer → reviewer) | Red-Green-Refactor cycle |
| Units without a clear workflow need | (omit `workflow:` field) | Inherits the intent-level workflow |

**Auto-routing rules:**
- `discipline: design` → automatically set `workflow: design`
- `discipline: infrastructure` or `discipline: observability` → default workflow (no override needed)

### Unit Detail Requirements

Define each unit with **enough detail that a builder with zero prior context builds the right thing**:

- **Name and description**: What this unit accomplishes, stated in terms of the domain model
- **Domain entities**: Which entities from the domain model this unit deals with
- **Data sources**: Specific APIs, queries, endpoints, or files. Reference actual query names, endpoint paths, or file patterns discovered during Domain Discovery.
- **Technical specification**: Specific components, views, functions, or modules to create
- **Success criteria**: Specific, testable criteria that reference domain entities
- **Dependencies on other units**: What must be built first and why
- **Risks**: What could go wrong? Security concerns, performance risks, integration fragility
- **What this unit is NOT**: Explicit boundaries to prevent scope creep

---

## Step 2: Operations-Aware Unit Creation

**Gate:** Skip this sub-phase entirely if the intent has no deployment surface.

When the intent DOES have a deployment surface:

### Detect deployment surface

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
STACK_INFRA=$(get_stack_layer "infrastructure")
STACK_MONITORING=$(get_stack_layer "monitoring")
STACK_COMPUTE=$(get_stack_layer "compute")
```

### Apply auto-creation rules

**Large intents (>2 units) with new deployable services:**
- **Auto-create a dedicated infrastructure unit** (`discipline: infrastructure`) with no `depends_on`
- **Auto-create a dedicated observability unit** (`discipline: observability`) that `depends_on` feature units

**Small intents (1-2 units):**
- Do NOT create separate infrastructure or observability units
- Fold ops concerns into existing feature units

**No deployment surface:**
- Skip entirely

### Dependency wiring for auto-created ops units
- Infrastructure unit: `depends_on: []` (foundational)
- Feature units that deploy: add infrastructure unit to `depends_on`
- Observability unit: `depends_on` all feature units

---

## Step 3: Cross-Cutting Concern Analysis

**Skip if there is only one unit.**

After units are defined, identify concerns that span multiple units (authentication, error handling, logging, shared state, caching).

**Auto-decide** how to handle each concern:

- **If the concern requires shared code or infrastructure** (auth middleware, shared component library, database schema): create a foundation unit with `depends_on: []` and add it to consuming units' dependencies
- **If the concern is a pattern or convention** (error format, naming rules): add it as an intent-level success criterion — do NOT create a unit

---

## Step 4: Spec Flow Analysis

After decomposing into units, analyze the specification flow for gaps:

1. **Trace user flows end-to-end** — For each key user flow, verify every step has a unit covering it.
2. **Check data flow completeness** — For each data entity, verify CRUD operations are covered where applicable.
3. **Verify error paths** — For each success path, verify the corresponding error path is specified.
4. **Cross-unit boundary check** — Where unit A's output feeds unit B's input, verify the contract is specified in both units.

Report gaps as:
```markdown
### Spec Flow Gaps
- [ ] **Missing unit**: {user flow} has no unit covering {step}
- [ ] **Missing error path**: {unit} specifies success but not {failure scenario}
- [ ] **Contract gap**: {unit A} outputs {format} but {unit B} expects {different format}
```

Fix gaps by adding missing units or updating existing unit specs before proceeding.

---

## Step 5: Spec Alignment Gate

**This is a high-level alignment check before writing artifacts.** Confirm the overall direction before investing effort in detailed unit specs.

Present the **elaboration summary**:

```markdown
## Elaboration Summary

### Intent
{1-2 sentence problem statement}

### Domain Model
{Key entities and relationships — abbreviated}

### Data Sources
{List each data source}

### Units
For each unit:
- **unit-NN-{slug}**: {one-line description}
  - Discipline: {discipline}
  - Depends on: {dependencies or "none"}
  - Builds: {specific components/modules/endpoints}

### Workflow
{workflow name}
```

**Visual Review (preferred):**

Check if visual review is enabled and `ask_user_visual_question` MCP tool is available. If so, call it with the elaboration summary as context.

**Fallback:** Use `AskUserQuestion`:
```json
{
  "questions": [{
    "question": "Does this intent and unit breakdown generally align with what you want built? (You'll review each unit in detail when we write the specs.)",
    "header": "Alignment",
    "options": [
      {"label": "Looks right", "description": "The intent, units, and scope are correct — proceed to write detailed specs"},
      {"label": "Wrong breakdown", "description": "The unit decomposition needs changes"},
      {"label": "Wrong direction", "description": "The overall approach needs rethinking"}
    ],
    "multiSelect": false
  }]
}
```

**Autonomous mode:** Auto-approve. Skip the alignment question.

- **"Looks right"**: Proceed to output
- **"Wrong breakdown"**: Discuss, revise units, re-present
- **"Wrong direction"**: Discuss, potentially re-run discovery or criteria

---

## Output

The decomposed unit list (with disciplines, dependencies, specs, and criteria) is carried forward to the calling mode sub-skill for artifact writing (Phase 6).
