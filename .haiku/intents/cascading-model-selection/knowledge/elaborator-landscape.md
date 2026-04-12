---
intent: cascading-model-selection
unit: unit-02-elaborator-model-guidance
created: 2026-04-10
type: research-notes
---

# Unit 02 — Elaborator Landscape: Research Findings

Research into which studios have elaborator-like hats, how unit frontmatter currently works, and what
complexity heuristics the elaborator should use when assigning `model:` to units.

## 1. Which Studios Have Elaborator-Like Hats

### The Only True Elaborator: `software/inception`

Only the **software** studio has a dedicated `inception` stage with an `elaborator` hat
(`plugin/studios/software/stages/inception/hats/elaborator.md`). This is the only hat in the entire
codebase whose explicit purpose is to produce unit spec files with frontmatter (`unit-NN-slug.md`).

No other studio has an equivalent. Confirmed by exhaustive survey of all 21 studios.

### What Other Studios' First-Stage Hats Actually Do

Non-software studios have domain-specific work hats in their first stages. These hats:

- Produce domain artifacts (inventories, charters, assessments, analyses)
- Do **not** write unit spec files
- Do **not** assign `model:` to downstream work
- Have `elaboration: collaborative` or `autonomous` flags in their STAGE.md, but this controls
  how the H·AI·K·U orchestrator handles elaboration turns — not what the hats themselves produce

Examples:
- `project-management/charter` → `scoper` defines project boundaries (not unit specs)
- `migration/assessment` → `migration-analyst` inventories migration artifacts (not unit specs)
- `quality-assurance/plan` → `planner` allocates test resources (not unit specs)
- `compliance/scope` → `scope-definer` defines compliance boundaries (not unit specs)

### Implication for Scope

**The unit-02 change is scoped to exactly one file:** `plugin/studios/software/stages/inception/hats/elaborator.md`.

No other studio needs updating. The `model:` field in unit frontmatter is a concept that only the
software studio's elaboration workflow produces. Cross-studio coverage mentioned in the unit spec
refers to checking — and the check result is: no other studio qualifies.

## 2. Current Elaborator Hat: What It Has and What It Lacks

### Current state (`plugin/studios/software/stages/inception/hats/elaborator.md`)

The elaborator currently provides:
- **Focus:** Break intent into units with clear boundaries, define DAG, write verifiable criteria
- **Produces:** Unit specs with completion criteria, dependencies, scope boundaries
- **Reads:** Researcher's discovery output via `## References`
- **Anti-patterns:** No circular deps, no vague criteria, no layer-based elaboration, each unit
  must complete in a single bolt

### What's Missing

No guidance on:
- Assigning `model:` to each unit
- What makes a unit "complex" vs "simple"
- Which model tier maps to which complexity class
- The anti-pattern of defaulting everything to opus

## 3. Unit Frontmatter Pattern: The `model:` Field

### How Units Are Currently Written

Unit files use YAML frontmatter with fields: `type`, `depends_on`, `discipline`, `model`, `status`,
`bolt`, `hat`, timestamps. The `model:` field exists in frontmatter for the cascading-model-selection
intent's own units (set there because the intent has been designed for it), but is NOT yet in the
`UnitFrontmatter` TypeScript interface (that's unit-01's job).

### Reference Examples (from cascading-model-selection intent)

```yaml
# unit-01-model-cascade-engine.md — complex backend work touching core orchestration
model: sonnet

# unit-02-elaborator-model-guidance.md — documentation update
model: sonnet

# unit-03-ui-model-display.md — frontend template changes
model: sonnet
```

All three are `sonnet` — reasonable for mid-complexity work. For comparison, the discovery document
notes the design intent: simple/mechanical work → `haiku`, standard implementation → `sonnet`,
complex architectural work → `opus`.

### Valid Model Values

From the codebase context and intent design: `opus`, `sonnet`, `haiku`. These map to Claude model
tiers. The orchestrator passes the resolved value directly as the `model` parameter to the Agent
tool — no translation layer.

## 4. Complexity Heuristics: What Makes a Unit "Complex"

Based on reading the existing unit specs across multiple intents and the orchestrator's execution
model, here are the signals the elaborator should use:

### Signals for `opus` (highest complexity)

- The unit requires **architectural decisions** — choosing between multiple valid approaches with
  significant trade-offs
- The unit touches **core orchestration logic** or execution engine (e.g., changing how FSM states
  transition, how cascade resolution works)
- The unit **spans multiple subsystems** and requires understanding their interactions before acting
- The unit involves **security-critical** decisions (auth, permissions, data isolation)
- The unit is the **first of its kind** — no existing pattern to follow in the codebase
- The unit requires **reverse-engineering** complex existing behavior before changing it
- **Risk of cascading breakage** is high if the unit is wrong

### Signals for `sonnet` (standard complexity)

- The unit implements a **known pattern** but with meaningful application logic
- The unit involves **API design** (types, interfaces, function signatures) with some judgment calls
- The unit is a **standard feature addition** — new endpoint, new component, new tool
- The unit requires **reading existing code** to understand context before modifying it
- The unit involves **cross-file changes** within a bounded scope
- The unit writes **substantive documentation** (not boilerplate)
- The unit has **moderate risk** — breakage would be caught by CI or type checking
- This is the **default** when uncertain

### Signals for `haiku` (mechanical/straightforward)

- The unit is **purely additive** — adding a column, a badge, a field — with no logic changes
- The unit follows an **exact pattern** already established in the codebase (copy-paste-adapt)
- The unit involves only **string changes, renaming, or reformatting**
- The unit is a **dependency on completed units** doing all the hard work — this unit just wires
  things up or exposes an already-computed value
- The unit writes **boilerplate documentation** from a clear template
- The unit has **low risk** — wrong output is immediately visible and easily corrected
- The unit has **no decision-making** — the spec is complete enough to execute mechanically

## 5. The Anti-Pattern: Defaulting Everything to Opus

The discovery document identifies this explicitly: the problem being solved is unnecessary token
burn on simple work. The elaborator MUST resist the instinct to assign `opus` to everything "just
to be safe." Complexity tiers only work if they're used honestly.

**The test:** If a junior engineer could execute the unit spec correctly by following instructions,
it's not opus-level. If the unit requires judgment about which approach to take among competing
architectural options, it might be.

**The failure mode:** An elaborator that assigns `opus` to "add a Model column to the units table"
defeats the entire purpose of model selection. That's a `haiku` task — the location, the value to
display, and the HTML template are all specified. No judgment required.

## 6. How the Model Assignment Integrates with the Cascade Engine

Context from unit-01 research (already in `unit-01-implementation-notes.md`):

The cascade resolves: `unit.model → hat.model → stage.default_model → studio.default_model`

The elaborator's `model:` assignment in unit frontmatter sits at the **top of the cascade** —
it is the highest-priority override. This means:

- When the elaborator assigns `model: haiku`, the unit runs on haiku regardless of what the hat
  definition defaults to
- When the elaborator leaves `model:` unset, the system falls through to hat defaults
- **The elaborator should always set `model:`** — leaving it unset gives the hat definition
  control, which is appropriate for research/generic hats but not for units where complexity
  is known at elaboration time

## 7. Cross-Studio Summary

| Studio | First Stage | Has Elaborator Hat | Produces Unit Specs | Needs Update |
|--------|------------|-------------------|---------------------|--------------|
| software | inception | YES (`elaborator`) | YES | YES |
| compliance | scope/assess | NO | NO | NO |
| customer-success | adoption | NO | NO | NO |
| data-pipeline | deployment | NO | NO | NO |
| dev-evangelism | create | NO | NO | NO |
| documentation | audit | NO | NO | NO |
| executive-strategy | communicate | NO | NO | NO |
| finance | analysis | NO | NO | NO |
| hr | interview | NO | NO | NO |
| ideation | create | NO | NO | NO |
| incident-response | investigate | NO | NO | NO |
| legal | draft | NO | NO | NO |
| marketing | content | NO | NO | NO |
| migration | assessment | NO | NO | NO |
| product-strategy | discovery | NO | NO | NO |
| project-management | charter | NO | NO | NO |
| quality-assurance | analyze | NO | NO | NO |
| sales | close | NO | NO | NO |
| security-assessment | enumeration | NO | NO | NO |
| training | deliver | NO | NO | NO |
| vendor-management | evaluate | NO | NO | NO |

## 8. What the Implementer Needs to Add to `elaborator.md`

A new **Model Assignment** section with:

1. **Requirement** — Every unit MUST have a `model:` field set during elaboration. This is not
   optional. The elaborator is the right moment to assess complexity — before execution, when the
   full scope is visible.

2. **Complexity tiers** — Defined with specific signals (see §4 above), not vague descriptions.

3. **Decision heuristic** — Start at `sonnet` as the default. Justify upward to `opus` or downward
   to `haiku` based on signals.

4. **Anti-patterns**:
   - MUST NOT assign `opus` to units with fully-specified, mechanical execution paths
   - MUST NOT leave `model:` unset — every unit spec MUST include the field
   - MUST NOT assign the same model to all units without assessing each individually
   - MUST NOT let "this is important work" justify `opus` — importance and complexity are different

5. **Produces** section update — Add `model:` field to the list of required unit frontmatter fields.
