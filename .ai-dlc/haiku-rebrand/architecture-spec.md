---
title: Studio / Stage Architecture
status: planned
---

# Studio Architecture Spec

## Summary

AI-DLC's elaboration was a 2,400-line monolithic skill file that hard-coded knowledge about three disciplines — design, product, and dev. It ran the same phases regardless of context, had no concept of development lifecycles beyond software, and couldn't support organizations with custom workflows.

This spec redesigns the system around three concepts:

- **Studio** — a named development lifecycle (the ordered sequence of stages a team follows). Software teams use inception → design → product → development → operations → security. Hardware teams, security-focused teams, or any organization defines their own by dropping files in `.haiku/studios/`.
- **Stage** — a lifecycle phase that defines its own hats (roles), review mode, and outputs. Each stage runs the same internal loop: elaborate → execute → adversarial review → review gate. `STAGE.md` contains metadata and criteria guidance; hat instructions live in `hats/{hat}.md` files; output definitions live in `outputs/`. No separate workflow files or phase files.
- **Inputs/Outputs** — stages declare inputs (qualified references in STAGE.md frontmatter, each specifying a producing stage and output name) and outputs (self-describing frontmatter docs in an `outputs/` directory). Inputs are loaded during the plan phase only; during the build phase, each unit's `## References` section declares the specific artifacts its builder needs. Output scopes control persistence: `project` (`.haiku/knowledge/`), `intent` (`.haiku/intents/{name}/knowledge/`), `stage` (working context), `repo` (source tree).

The key insight is that stages aren't just elaboration modes — they're the full lifecycle. Design doesn't just spec wireframes, it builds them. Product doesn't just define criteria, it writes behavioral specs. Each stage completes its own elaborate → execute cycle and produces real artifacts before the next stage begins.

**The default experience doesn't change.** The studio always exists (default: ideation). The user chooses per-intent whether to run **continuous** (autopilot drives stage transitions, user reviews at gates) or **discrete** (user explicitly invokes each stage). Continuous mode is how AI-DLC works today — one guided session through all stages. Discrete mode expands the same pipeline into user-driven steps.

### What this eliminates

- `plugin/hats/` directory — hats are now defined in `hats/{hat}.md` files within each stage directory
- `plugin/workflows.yml` — each stage defines its own hat sequence; the studio defines stage ordering
- Workflow selection sub-skill — no need to pick a workflow; the stage already knows its hats
- `phases/ELABORATION.md` and `phases/EXECUTION.md` — the stage body is injected as context; no structured phase files
- `knowledge/` directory inside stages — replaced by `outputs/` directory with self-describing frontmatter docs
- `requires:` / `produces:` fields in STAGE.md — replaced by `inputs:` (qualified references in frontmatter) and `outputs/` (directory)

### Architecture visual

See `architecture-viz.html` for the full interactive visualization of this architecture.

---

## Problem

The elaborate skill was a monolithic 2400-line file with hard-coded knowledge about specific disciplines (design, product, dev). It couldn't support custom lifecycle configurations — a security team, hardware team, or any organization with non-standard development workflows had no way to define their own elaboration and execution behavior.

## Goal

A fully data-driven architecture where:
1. **Studios** define named lifecycle pipelines (e.g., `software: inception → design → product → development → operations → security`)
2. **Stages** define what a lifecycle phase produces, consumes, and how it operates (hats, review mode, guidance)
3. The system supports **continuous** (autopilot between gates) and **discrete** (user-driven) modes through the same stage pipeline
4. **Nothing breaks** — continuous mode (the default choice) works exactly as AI-DLC does today

## Hierarchy

```
Studio → Stages → Units → Bolts
```

| Level | Agile Equivalent | Description |
|-------|-----------------|-------------|
| **Studio** | (no equivalent) | Named pipeline of stages — the team's development lifecycle template |
| **Stage** | (no equivalent) | A lifecycle phase with defined inputs/outputs (design, product, dev, security, etc.) |
| **Unit** | Ticket / Story | A discrete piece of work within an intent |
| **Bolt** | Sprint | The iteration cycle an agent runs within a unit |

## File Structure

### Built-in

```
plugin/studios/software/
├── STUDIO.md                                # Pipeline definition
└── stages/
    ├── inception/
    │   ├── STAGE.md                         # Metadata, review mode, inputs, criteria guidance
    │   ├── hats/
    │   │   ├── architect.md                 # Hat-specific instructions
    │   │   └── decomposer.md
    │   └── outputs/
    │       └── DISCOVERY.md                 # scope: intent, format: text
    ├── design/
    │   ├── STAGE.md                         # Metadata, criteria guidance
    │   ├── hats/
    │   │   ├── designer.md
    │   │   └── design-reviewer.md
    │   └── outputs/
    │       ├── DESIGN-BRIEF.md              # scope: stage, format: design
    │       └── DESIGN-TOKENS.md             # scope: intent, format: text
    ├── product/
    │   ├── STAGE.md
    │   ├── hats/
    │   │   ├── product-owner.md
    │   │   └── specification-writer.md
    │   └── outputs/
    │       ├── BEHAVIORAL-SPEC.md           # scope: intent, format: text
    │       └── DATA-CONTRACTS.md            # scope: intent, format: text
    ├── development/
    │   ├── STAGE.md
    │   ├── hats/
    │   │   ├── planner.md
    │   │   ├── builder.md
    │   │   └── reviewer.md
    │   └── outputs/
    │       ├── CODE.md                      # scope: repo, format: code
    │       └── ARCHITECTURE.md              # scope: project, format: text
    ├── operations/
    │   ├── STAGE.md
    │   ├── hats/
    │   │   ├── ops-engineer.md
    │   │   └── sre.md
    │   └── outputs/
    │       └── RUNBOOK.md                   # scope: intent, format: text
    └── security/
        ├── STAGE.md
        ├── hats/
        │   ├── threat-modeler.md
        │   ├── red-team.md
        │   ├── blue-team.md
        │   └── security-reviewer.md
        └── outputs/
            └── THREAT-MODEL.md              # scope: intent, format: text
```

### Intent directory (.haiku/intents/{name}/)

```
.haiku/intents/my-feature/
├── intent.md                                # Problem, solution, domain model, criteria
├── knowledge/                               # Intent-scoped outputs land here
│   ├── DISCOVERY.md                         ← inception wrote this (scope: intent)
│   ├── BEHAVIORAL-SPEC.md                   ← product stage wrote this (scope: intent)
│   └── THREAT-MODEL.md                      ← security stage wrote this (scope: intent)
├── stages/
│   ├── inception/
│   │   ├── state.json
│   │   ├── WORKING-NOTES.md                 ← stage-scoped output (scope: stage)
│   │   └── units/
│   ├── design/
│   │   ├── state.json
│   │   ├── DESIGN-BRIEF.md                  ← stage-scoped output (scope: stage)
│   │   └── units/
│   │       └── unit-01-wireframes.md
│   └── development/
│       ├── state.json
│       └── units/
│           ├── unit-01-auth-api.md
│           └── unit-02-frontend.md
└── state.json                               # { active_stage, mode, studio }
```

Project-scoped outputs persist to `.haiku/knowledge/` (e.g., `ARCHITECTURE.md` from development stage). Repo-scoped outputs are actual source files written to the project tree.

### Project-level (custom or override)

```
.haiku/studios/
├── software/                                # Override built-in software studio
│   ├── STUDIO.md                            # Override stage list to include security-hardening
│   └── stages/
│       └── security-hardening/              # Custom stage
│           ├── STAGE.md
│           ├── hats/
│           │   ├── hardener.md
│           │   └── auditor.md
│           └── outputs/
│               └── PEN-TEST-REPORT.md       # scope: intent, format: text
└── hardware/                                # Entirely custom studio
    ├── STUDIO.md
    └── stages/
        ├── pcb-design/
        │   ├── STAGE.md
        │   ├── hats/
        │   │   └── pcb-designer.md
        │   └── outputs/
        │       └── SCHEMATIC.md             # scope: intent, format: design
        └── firmware/
            ├── STAGE.md
            ├── hats/
            │   └── firmware-engineer.md
            └── outputs/
                └── FIRMWARE-SPEC.md         # scope: intent, format: text
```

## File Schemas

### STUDIO.md

```yaml
---
name: software
description: Standard software development lifecycle
stages: [inception, design, product, development, operations, security]
---
```

The body contains free-form documentation about when to use this studio, its philosophy, etc.

### STAGE.md

Contains structural metadata that applies to both elaboration and execution:

```yaml
---
name: design
description: Visual and interaction design
hats: [designer, design-reviewer]
review: ask
unit_types: [design, frontend]
inputs:
  - stage: inception
    output: discovery
---
```

The body contains free-form documentation about the stage's purpose: `## Criteria Guidance` (good/bad examples for criteria) and `## Completion Signal` (when the stage is done). Hat-specific instructions live in `hats/{hat}.md` files within the stage directory.

Inputs are qualified references that specify both the producing stage and the output name. A bare slug is ambiguous -- two stages could have outputs with the same name. The `stage` + `output` pair together resolve to the exact persisted location. Inputs are loaded during the **plan phase** only (see Input Loading below).

Outputs are defined in the `outputs/` directory alongside STAGE.md -- each output is a separate file with self-describing frontmatter (see Output Doc Schema below).

Fields:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Stage identifier |
| `description` | string | One-line description |
| `hats` | string[] | Ordered hat roles for this stage's build phase |
| `review` | string \| string[] | Review gate mode: `auto`, `ask`, or `external`. Arrays declare multiple available modes — the first is the default. See Review Gate Resolution below. |
| `unit_types` | string[] | Disciplines of units this stage creates (e.g., `[design, frontend]`) |
| `inputs` | object[] | Qualified references to outputs from prior stages (`stage` + `output` pairs) |

#### Review Gate Resolution

When `review` is an array (e.g., `[external, ask]`), the first element is the **default** gate used during normal execution (`/haiku:resume`). In autopilot mode, the orchestrator selects the most permissive non-`external` option from the array — `ask` → overridden to `auto`. If the array contains only `external`, autopilot blocks and surfaces the gate to the user rather than silently bypassing it.

| `review` value | `/haiku:resume` behavior | `/haiku:autopilot` behavior |
|---|---|---|
| `auto` | Advances automatically | Advances automatically |
| `ask` | Pauses for user approval | Overridden to `auto` |
| `external` | Creates PR/review request | Blocks — cannot be bypassed |
| `[external, ask]` | Creates PR/review request (default) | Selects `ask`, overrides to `auto` |
| `[external, auto]` | Creates PR/review request (default) | Selects `auto`, advances automatically |

This allows stages to express "prefer external review, but autopilot may proceed with a lighter gate" without removing the external review option entirely.

### Output Doc Schema

Each file in a stage's `outputs/` directory:

```yaml
---
name: discovery
location: .haiku/intents/{intent-slug}/knowledge/DISCOVERY.md
scope: intent
format: text
required: true
---

# Discovery Output Guide

When exploring the domain, document:
- Every entity and its fields
- Every API endpoint and its behavior
- Architecture patterns and constraints
```

Fields:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Output identifier (referenced by other stages' `inputs:` lists) |
| `location` | string | Path template where the output is persisted (uses `{intent-slug}` for intent slug) |
| `scope` | string | Persistence scope: `project`, `intent`, `stage`, or `repo` |
| `format` | string | Content format: `text`, `code`, `design` |
| `required` | boolean | Whether this output must be produced before the stage completes |

Output scopes determine persistence:

| Scope | Location | Lifespan |
|-------|----------|----------|
| `project` | `.haiku/knowledge/{name}.md` | Persists across intents |
| `intent` | `.haiku/intents/{intent-slug}/knowledge/{name}.md` | This intent only |
| `stage` | `.haiku/intents/{intent-slug}/stages/{stage}/{name}` | Working context for this stage's units |
| `repo` | Project source tree | Actual code, configs — permanent |

## The Collapsible FSM

### States

```
INIT → GATHER → DISCOVER → [ELABORATE(stage) → EXECUTE(stage)]* → DELIVER
```

Where `[ELABORATE → EXECUTE]*` repeats for each stage in the studio pipeline.

### Continuous Mode

User chooses "continuous" during elaboration:

```
GATHER → DISCOVER → ELABORATE(all) → EXECUTE(all) → DELIVER
                        ↓
                    one cycle, all stage definitions merged
```

One elaborate ↓ execute cycle. All stage definitions from the studio are merged. Sub-skills use the union of all stages' guidance.

### Discrete Mode

User chooses "discrete" during elaboration:

```
                    ┌──────────┐   ┌──────────┐   ┌──────────┐
GATHER → DISCOVER → │ ELABORATE │ → │ ELABORATE │ → │ ELABORATE │ → DELIVER
                    │     ↓     │   │     ↓     │   │     ↓     │
                    │  EXECUTE  │   │  EXECUTE  │   │  EXECUTE  │
                    │  design   │   │  product  │   │development│
                    └──────────┘   └──────────┘   └──────────┘
                         │              │              │
                    built artifacts → built artifacts → built artifacts
```

Each stage transition:
1. Reads `stages/{name}/STAGE.md` for structural metadata (hat sequence, inputs, criteria guidance)
2. Reads `stages/{name}/hats/*.md` for hat-specific instructions
3. Reads `stages/{name}/outputs/*.md` for output definitions (scope, format, location)
4. **Plan phase**: Resolves qualified inputs from prior stage outputs and loads them as decomposition context
5. Runs the invariant elaboration core parameterized by the stage's metadata; populates each unit's `## References` section
6. **Build phase**: Executes the stage's units (bolt cycles guided by hat files); each builder reads only its unit's `## References`, not the full input set
7. Writes outputs to scope-based locations -- these become inputs for the next stage

### The Collapse Operation

Continuous mode is conceptually equivalent to merging all stage definitions and running once:

- `unit_types` = union of all stages' unit types
- `## Criteria Guidance` = concatenation of all stages' `## Criteria Guidance` body sections
- `outputs/` = union of all stages' output definitions (from each stage's `outputs/` directory)
- `inputs` = empty (no prior stage outputs exist)

In practice, continuous mode doesn't actually read stage definitions — it uses the sub-skills' built-in behavior, which produces the same result as the merge.

## Execution Model

### Hat Layering

Hats (planner, builder, reviewer, designer, etc.) are defined in `hats/{hat}.md` files within each stage directory. They gain stage-specific context through layering:

| Layer | Source | Continuous | Discrete |
|-------|--------|------------|---------|
| 1. Hat | `stages/{stage}/hats/{hat}.md` file | Always read | Always read |
| 2. Outputs | Stage's `outputs/` directory definitions | Merged | Active stage only |
| 3. References | Unit's `## References` section | Always read | Always read |
| 4. Unit | `.haiku/intents/{intent-slug}/stages/{stage}/units/unit-NN-*.md` | Always read | Always read |

In continuous mode, all stage definitions are merged and hat guidance comes from the combined hat files. In discrete mode, the active stage's hat files provide hat-specific guidance. Stage inputs are loaded during the plan phase for decomposition context. During the build phase, each unit's `## References` section declares which specific artifacts the builder needs -- the full stage input set is NOT injected into builders.

### Bolt Cycle

Each unit executes through bolt cycles until its criteria are met:

```
Unit → Resolve hat sequence from STAGE.md frontmatter `hats:` field
         │
         ├── Planner hat    → reads hats/planner.md + unit spec + unit ## References
         ├── Builder hat    → reads hats/builder.md + unit spec + unit ## References
         ├── Quality gates  → tests, lint, typecheck (backpressure)
         └── Reviewer hat   → reads hats/reviewer.md + criteria + outputs/ defs
                │
                ├── Criteria met → advance to next unit
                └── Issues found → another bolt cycle
```

The planner and builder hats read the unit's `## References` section -- NOT the full stage input set. This keeps builder context focused on what each unit actually needs.

### Continuous Mode Execution

All units execute together in dependency order. All stage definitions are merged into a single context — hat guidance comes from the combined hat files across stages, outputs from the union of all stages' `outputs/` directories. When all units complete → deliver.

### Discrete Mode Execution

Only units tagged with the active stage execute. During the plan phase, the orchestrator loads all resolved stage inputs as context for decomposition and criteria definition. During the build phase, each unit's `## References` section drives what artifacts the builder reads -- the full stage input set is not re-loaded. The reviewer checks stage-specific criteria and verifies required outputs are produced. When all stage units complete, outputs are written to their scope-based locations, and the orchestrator advances to the next stage.

```
Stage: design
  ├── Filter: units where stage: design
  ├── Plan phase: resolve inputs [{stage: inception, output: discovery}]
  │   └── Load resolved artifacts as context for decomposition
  ├── Decompose into units, populate each unit's ## References
  ├── Build phase: per unit, builder reads unit ## References (not full inputs)
  ├── Hat guidance: stages/design/hats/{hat-name}.md files
  ├── Execute bolt cycles per unit
  ├── Write outputs: DESIGN-BRIEF.md (scope: stage), DESIGN-TOKENS.md (scope: intent)
  └── All design units done → advance to product stage
```

## Settings

```yaml
# .haiku/settings.yml
studio: ideation    # Always present. Default: "ideation" if omitted.
```

Every project has a studio. Omitting `studio:` defaults to `ideation`. The per-intent decision of continuous vs discrete mode is made when starting the intent, not in settings.

Resolution order:
1. Project-level: `.haiku/studios/{name}/STUDIO.md`
2. Built-in: `plugin/studios/{name}/STUDIO.md`

## Intent Frontmatter

```yaml
---
studio: software                  # Which studio this intent uses
stages: [inception, design, product, development, operations, security]   # Resolved from studio (empty for continuous mode)
active_stage: design              # Current stage being elaborated/executed (empty for continuous mode)
mode: discrete                    # continuous | discrete (default: continuous)
---
```

Continuous mode intent: `stages: []`, `active_stage: ""`, `studio: "ideation"` (studio is always set).

## Unit Frontmatter

```yaml
---
stage: design                    # Which stage created this unit
---
```

When running in continuous mode: `stage: ""` (all stage definitions merged, no active stage).

## Resolution Logic

### Studio Resolution

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/studio.sh"

# Returns comma-separated stage names, or "" in legacy mode (no settings file)
STAGES=$(resolve_active_stages)
```

`resolve_active_stages` reads `studio:` from settings.yml, validates the studio and all its stages exist, and returns the stage list. Returns `""` in legacy mode (no `.haiku/settings.yml` exists — pre-H·AI·K·U state).

### Stage Resolution (within a studio)

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/stage.sh"

# Resolves relative to the active studio
STAGE_FILE=$(resolve_stage_definition "design" "software")
# → plugin/studios/software/stages/design/STAGE.md
```

### Output Resolution (within a stage)

The orchestrator reads output definitions from the stage's `outputs/` directory:

```bash
STAGE_DIR=$(dirname "$(hku_resolve_stage "$STAGE_NAME" "$STUDIO_NAME")")
OUTPUTS_DIR="${STAGE_DIR}/outputs/"
# Each *.md file in outputs/ is a self-describing output doc with frontmatter
```

### Input Resolution

Inputs listed in STAGE.md frontmatter are qualified references. Each entry specifies the producing stage and output name, so resolution is direct -- no searching across all stages:

```bash
# For each input in STAGE.md inputs:
#   - stage: product
#     output: behavioral-spec
#
# 1. Resolve the producing stage's STAGE.md from the studio
# 2. Read the output definition from that stage's outputs/ dir matching the name
# 3. Read the persisted file from the output's scope-based location path
```

#### Input Loading: Plan Phase Only

Inputs are loaded during the **plan phase** of a stage. The orchestrator reads all resolved input artifacts as context for decomposing work into units and defining criteria. During the **build phase**, the full input set is NOT loaded into each builder agent. Instead, each unit's spec declares a `## References` section listing the specific artifacts that unit's builder needs. This prevents context bloat -- a stage might declare 5 inputs, but a given unit only needs 2 of them.

#### Unit References

During the plan phase, the orchestrator populates each unit's `## References` section based on what the unit actually needs:

```markdown
## References
- .haiku/intents/{intent-slug}/knowledge/DISCOVERY.md
- .haiku/intents/{intent-slug}/knowledge/BEHAVIORAL-SPEC.md
```

The builder agent reads ONLY these listed files. This keeps builder context focused and avoids loading irrelevant knowledge artifacts into every build agent.

## Sub-Skill Parameterization

Sub-skills are generic — they contain no hard-coded knowledge about specific stages. They read guidance from the active stage's phase files:

| Sub-Skill | Reads From | What It Gets |
|-----------|-----------|--------------|
| `criteria` | `STAGE.md` → `## Criteria Guidance` | Good/bad examples, focus area |
| `decompose` | `STAGE.md` → `unit_types` | Allowed unit disciplines |
| `wireframes` | `STAGE.md` → `hats:` list | Whether design hats are present |
| Builder hat | `hats/{hat}.md` file | Construction guidance |
| Reviewer hat | `hats/{hat}.md` file | Review guidance |
| Advance | `STAGE.md` → `## Completion Signal` | When to advance |
| Output writer | `outputs/*.md` → frontmatter | Scope, location, format for each output |
| Input loader | `STAGE.md` → `inputs:` list | Qualified references (stage + output) to load from prior stages (plan phase only) |

## Custom Stage Example: Security

A company adds a security stage to the software studio:

```
.haiku/studios/software/
├── STUDIO.md                          # Override: stages: [design, product, security, development]
└── stages/
    └── security/
        ├── STAGE.md
        ├── hats/
        │   ├── threat-modeler.md
        │   ├── red-team.md
        │   ├── blue-team.md
        │   └── reviewer.md
        └── outputs/
            ├── THREAT-MODEL.md        # scope: intent, format: text
            ├── SECURITY-REQS.md       # scope: intent, format: text
            └── VULN-REPORT.md         # scope: intent, format: text
```

**STAGE.md:**
```yaml
---
name: security
description: Threat modeling and penetration testing
hats: [threat-modeler, red-team, blue-team, reviewer]
review: [external, ask]
unit_types: [security, backend]
inputs:
  - stage: product
    output: behavioral-spec
  - stage: development
    output: code
---

# Security Stage

## Criteria Guidance

- OWASP Top 10 coverage for all endpoints
- Authentication and authorization boundary testing
- Data protection requirements (encryption at rest, in transit)
- Input validation and output encoding

## Completion Signal

All identified threats have documented mitigations, security tests cover the
attack surface, and no critical/high findings remain unaddressed.
```

**hats/threat-modeler.md:**
```yaml
---
name: threat-modeler
stage: security
studio: software
---

**Focus:** Perform STRIDE threat modeling for all data flows and trust boundaries. Identify attack surface and categorize threats.
```

**hats/red-team.md:**
```yaml
---
name: red-team
stage: security
studio: software
---

**Focus:** Write security-focused tests: injection, auth bypass, CSRF, SSRF. Review dependencies for known CVEs.
```

**hats/blue-team.md:**
```yaml
---
name: blue-team
stage: security
studio: software
---

**Focus:** Verify mitigations for all identified threats. Validate security controls.
```

**hats/reviewer.md:**
```yaml
---
name: reviewer
stage: security
studio: software
---

**Focus:** Verify all identified threats have documented mitigations. Check security test coverage against OWASP Top 10.
```

**outputs/THREAT-MODEL.md:**
```yaml
---
name: threat-model
location: .haiku/intents/{intent-slug}/knowledge/THREAT-MODEL.md
scope: intent
format: text
required: true
---

# Threat Model Output Guide

Document all identified threats with:
- STRIDE classification
- Attack vectors and impact assessment
- Mitigations (implemented and recommended)
```

## Custom Studio Example: Hardware

```
.haiku/studios/hardware/
├── STUDIO.md
└── stages/
    ├── requirements/
    │   ├── STAGE.md
    │   ├── hats/
    │   │   └── requirements-analyst.md
    │   └── outputs/
    │       └── REQUIREMENTS-SPEC.md         # scope: intent, format: text
    ├── pcb-design/
    │   ├── STAGE.md
    │   ├── hats/
    │   │   └── pcb-designer.md
    │   └── outputs/
    │       └── SCHEMATIC.md                 # scope: intent, format: design
    ├── firmware/
    │   ├── STAGE.md
    │   ├── hats/
    │   │   └── firmware-engineer.md
    │   └── outputs/
    │       ├── FIRMWARE-SPEC.md             # scope: intent, format: text
    │       └── CODE.md                      # scope: repo, format: code
    └── integration-test/
        ├── STAGE.md
        ├── hats/
        │   └── test-engineer.md
        └── outputs/
            └── TEST-REPORT.md               # scope: intent, format: text
```

## Migration Path

1. ~~Extract shared phases into sub-skills~~ (done)
2. ~~Rename pass → stage~~ (done)
3. ~~Create studio infrastructure~~ (done — STUDIO.md, studio.sh, stage.sh)
4. Replace `knowledge/` directories with `outputs/` directories containing self-describing frontmatter docs
5. Replace `requires:`/`produces:` with `inputs:` (frontmatter list) and `outputs/` (directory)
6. Update sub-skills and hats to read guidance from `hats/{hat}.md` files and STAGE.md criteria/completion sections
7. Update settings schema (studio: field replaces default_stages)
8. Update paper, website docs, and CLAUDE.md terminology
9. Delete REFACTOR-SPEC.md (superseded by this spec)

## Backwards Compatibility

**Legacy mode (no studio configured) MUST work identically to the current system.** This means:
- No `.haiku/settings.yml` at all → `stages: []`, `active_stage: ""`
  (Omitting `studio:` in an existing settings file defaults to `ideation` — see Settings Schema)
- Sub-skills use built-in defaults when no stage definition is available
- No STAGE.md or outputs/ files are read
- The elaboration and execution flows are unchanged from the current working system

> **Note:** In practice, omitting `studio:` defaults to `ideation` (see Settings Schema above). "No studio configured" describes the pre-H·AI·K·U legacy state where the settings file itself doesn't exist. This guarantee ensures existing projects continue to work before running the migration.
