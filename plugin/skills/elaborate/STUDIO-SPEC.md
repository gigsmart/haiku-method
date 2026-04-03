---
title: Studio / Stage Architecture
status: planned
---

# Studio Architecture Spec

## Summary

AI-DLC's elaboration was a 2,400-line monolithic skill file that hard-coded knowledge about three disciplines — design, product, and dev. It ran the same phases regardless of context, had no concept of development lifecycles beyond software, and couldn't support organizations with custom workflows.

This spec redesigns the system around three concepts:

- **Studio** — a named development lifecycle (the ordered sequence of stages a team follows). Software teams use inception → design → product → development → operations → security. Hardware teams, security-focused teams, or any organization defines their own by dropping files in `.haiku/studios/`.
- **Stage** — a lifecycle phase that defines its own hats (roles), review mode, and outputs. Each stage runs the same internal loop: elaborate → execute → adversarial review → review gate. One `STAGE.md` per stage contains everything. No separate workflow files, hat directories, or phase files.
- **Knowledge** — two layers of accumulated context. The global knowledge pool (`.haiku/knowledge/`) persists project-level understanding across intents. Intent artifacts accumulate as stages complete — each stage reads everything prior stages built.

The key insight is that stages aren't just elaboration modes — they're the full lifecycle. Design doesn't just spec wireframes, it builds them. Product doesn't just define criteria, it writes behavioral specs. Each stage completes its own elaborate → execute cycle and produces real artifacts before the next stage begins.

**The default experience doesn't change.** The studio always exists (default: software). The user chooses per-intent whether to run **continuous** (autopilot drives stage transitions, user reviews at gates) or **discrete** (user explicitly invokes each stage). Continuous mode is how AI-DLC works today — one guided session through all stages. Discrete mode expands the same pipeline into user-driven steps.

### What this eliminates

- `plugin/hats/` directory — hats are now defined inside each stage's STAGE.md
- `plugin/workflows.yml` — each stage defines its own hat sequence; the studio defines stage ordering
- Workflow selection sub-skill — no need to pick a workflow; the stage already knows its hats
- `phases/ELABORATION.md` and `phases/EXECUTION.md` — the stage body is injected as context into both elaboration and execution; no structured phase files

### Architecture visual

See `haiku-architecture-v2.html` for the full interactive visualization of this architecture.

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
    ├── design/
    │   ├── STAGE.md                         # Stage structural metadata
    │   └── phases/
    │       ├── ELABORATION.md               # Elaboration behavior
    │       └── EXECUTION.md                 # Construction behavior
    ├── product/
    │   ├── STAGE.md
    │   └── phases/
    │       ├── ELABORATION.md
    │       └── EXECUTION.md
    └── dev/
        ├── STAGE.md
        └── phases/
            ├── ELABORATION.md
            └── EXECUTION.md
```

### Project-level (custom or override)

```
.haiku/studios/
├── software/                                # Override built-in software studio
│   ├── STUDIO.md                            # Override stage list to include security
│   └── stages/
│       └── security/                        # Add a custom stage
│           ├── STAGE.md
│           └── phases/
│               ├── ELABORATION.md
│               └── EXECUTION.md
└── hardware/                                # Entirely custom studio
    ├── STUDIO.md
    └── stages/
        ├── pcb-design/
        │   ├── STAGE.md
        │   └── phases/
        │       ├── ELABORATION.md
        │       └── EXECUTION.md
        └── firmware/
            ├── STAGE.md
            └── phases/
                ├── ELABORATION.md
                └── EXECUTION.md
```

## File Schemas

### STUDIO.md

```yaml
---
name: software
description: Standard software development lifecycle
stages: [design, product, dev]
---
```

The body contains free-form documentation about when to use this studio, its philosophy, etc.

### STAGE.md

Contains structural metadata that applies to both elaboration and execution:

```yaml
---
name: design
description: Visual and interaction design

# What this stage produces and consumes (FSM context flow)
requires: []
produces: [design-tokens, wireframes, component-specs, interaction-flows]

# Execution configuration
unit_types: [design, frontend]
available_workflows: [design]
default_workflow: design
---
```

The body contains free-form documentation about the stage's purpose and philosophy.

Fields:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Stage identifier |
| `description` | string | One-line description |
| `requires` | string[] | Artifact names this stage needs from prior stages |
| `produces` | string[] | Artifact names this stage outputs for subsequent stages |
| `unit_types` | string[] | Disciplines of units this stage creates (e.g., `[design, frontend]`) |
| `available_workflows` | string[] | Workflows available during this stage's execution |
| `default_workflow` | string | Default workflow if none specified |

### phases/ELABORATION.md

How this stage behaves during elaboration. Read by the elaboration sub-skills.

```yaml
---
# Sub-skill composition
skip: []                    # Sub-skills to skip (e.g., [wireframes, git-strategy])
add: []                     # Custom sub-skills to add (from .haiku/subskills/)

# Wireframe behavior
wireframe_fidelity: high    # high | low | skip

# What to focus on
criteria_focus: design      # Hint for criteria sub-skill — reads ## Criteria Guidance below
---

# Design Stage — Elaboration

## Criteria Guidance

When generating criteria for this stage, focus on verifiable design deliverables:

- Screen layouts defined for all breakpoints (mobile 375px / tablet 768px / desktop 1280px)
- All interactive states specified (default, hover, focus, active, disabled, error)
- Color usage references only design system tokens — no raw hex values
- Touch targets meet 44px minimum on mobile breakpoints
...

Design criteria are verified by **visual approval**, not automated tests.

Bad criteria: "Design looks good", "It's responsive"
```

### phases/EXECUTION.md

How this stage behaves during construction. Read by the builder and reviewer hats.

```markdown
---
# (no frontmatter needed — structural config lives in STAGE.md)
---

# Design Stage — Execution

## Builder Focus

- Explore wireframes, mockups, or prototypes to clarify the visual and interaction direction
- Define or extend design tokens as shared vocabulary
- Specify component structure, states, and interaction behavior
...

## Reviewer Focus

- Verify design thinking addresses every acceptance criterion
- Check consistency with existing design system tokens and patterns
- Confirm interaction flows cover error states, empty states, and loading states
...

## Completion Signal

The design stage is complete when the design direction is clear enough to inform
subsequent product or dev stages without ambiguity.
```

## The Collapsible FSM

### States

```
INIT → GATHER → DISCOVER → [ELABORATE(stage) → EXECUTE(stage)]* → DELIVER
```

Where `[ELABORATE → EXECUTE]*` repeats for each stage in the studio pipeline.

### Single-Stage Mode (Collapsed)

User chooses "single-stage" during elaboration:

```
GATHER → DISCOVER → ELABORATE(all) → EXECUTE(all) → DELIVER
                        ↓
                    one cycle, all disciplines merged
```

One elaborate ↓ execute cycle. All stage definitions from the studio are merged. Sub-skills use the union of all stages' guidance.

### Multi-Stage Mode (Expanded)

User chooses "multi-stage" during elaboration:

```
                    ┌──────────┐   ┌──────────┐   ┌──────────┐
GATHER → DISCOVER → │ ELABORATE │ → │ ELABORATE │ → │ ELABORATE │ → DELIVER
                    │     ↓     │   │     ↓     │   │     ↓     │
                    │  EXECUTE  │   │  EXECUTE  │   │  EXECUTE  │
                    │  design   │   │  product  │   │   dev     │
                    └──────────┘   └──────────┘   └──────────┘
                         │              │              │
                    built artifacts → built artifacts → built artifacts
```

Each stage transition:
1. Reads `stages/{name}/STAGE.md` for structural metadata
2. Reads `stages/{name}/phases/ELABORATION.md` for elaboration guidance
3. Loads prior stage artifacts via `load-prior-artifacts` sub-skill
4. Runs the invariant elaboration core parameterized by the stage's metadata
5. Executes the stage's units (bolt cycles guided by `phases/EXECUTION.md`)
6. Commits built artifacts — these become input for the next stage

### The Collapse Operation

Single-stage mode is conceptually equivalent to merging all stage definitions and running once:

- `unit_types` = union of all stages' unit types
- `criteria_guidance` = concatenation of all stages' guidance
- `artifact_types` = union of all stages' artifacts
- `available_workflows` = union of all stages' workflows
- `requires` = empty (first stage)
- `produces` = union of all stages' outputs

In practice, single-stage mode doesn't actually read stage definitions — it uses the sub-skills' built-in behavior, which produces the same result as the merge.

## Execution Model

### Hat Layering

Hats (planner, builder, reviewer, designer, etc.) are generic workers defined in `plugin/hats/*.md`. They gain stage-specific context through layering:

| Layer | Source | Single-Stage | Multi-Stage |
|-------|--------|-------------|-------------|
| 1. Hat | `plugin/hats/{hat}.md` | Always read | Always read |
| 2. Stage | `stages/{name}/phases/EXECUTION.md` | Not read | Read for active stage |
| 3. Unit | `.haiku/intents/{slug}/unit-NN-{slug}.md` | Always read | Always read |

In single-stage mode, the hat's built-in instructions already cover all disciplines — no stage guidance is needed. In multi-stage mode, the active stage's `EXECUTION.md` supplements the hat with stage-specific focus (e.g., "explore wireframes" for design stage, "implement code" for dev stage).

### Bolt Cycle

Each unit executes through bolt cycles until its criteria are met:

```
Unit → Resolve workflow → hat sequence
         │
         ├── Planner hat    → reads hat + unit spec
         ├── Builder hat    → reads hat + EXECUTION.md (multi-stage) + unit spec
         ├── Quality gates  → tests, lint, typecheck (backpressure)
         └── Reviewer hat   → reads hat + EXECUTION.md (multi-stage) + criteria
                │
                ├── Criteria met → advance to next unit
                └── Issues found → another bolt cycle
```

### Single-Stage Execution

All units execute together in dependency order. Each unit uses its own workflow (design units → design workflow, backend units → default workflow). Hats use built-in instructions only. All workflows are available. When all units complete → deliver.

### Multi-Stage Execution

Only units tagged with the active stage execute. Workflows are constrained to the stage's `available_workflows`. Hats read the active stage's `EXECUTION.md` for supplemental guidance (Builder Focus, Reviewer Focus). The reviewer checks stage-specific criteria. When all stage units complete → advance to next stage's elaboration.

```
Stage: design
  ├── Filter: units where stage: design
  ├── Constrain workflows: [design]
  ├── Hat guidance: stages/design/phases/EXECUTION.md
  ├── Execute bolt cycles per unit
  ├── Check: Completion Signal from EXECUTION.md
  └── All design units done → advance to product stage elaboration
```

## Settings

```yaml
# .haiku/settings.yml
studio: software    # Always present. Default: "software" if omitted.
```

Every project has a studio. Omitting `studio:` defaults to `software`. The per-intent decision of single-stage vs multi-stage is made during elaboration, not in settings.

Resolution order:
1. Project-level: `.haiku/studios/{name}/STUDIO.md`
2. Built-in: `plugin/studios/{name}/STUDIO.md`

## Intent Frontmatter

```yaml
---
studio: software                  # Which studio this intent uses
stages: [design, product, dev]   # Resolved from studio (empty for single-stage)
active_stage: design              # Current stage being elaborated/executed (empty for single-stage)
---
```

Single-stage intent: `stages: []`, `active_stage: ""`, `studio: "software"` (studio is always set).

## Unit Frontmatter

```yaml
---
stage: design                    # Which stage created this unit
---
```

When no studio is configured: `stage: ""`.

## Resolution Logic

### Studio Resolution

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/studio.sh"

# Returns comma-separated stage names, or "" for single-stage
STAGES=$(resolve_active_stages)
```

`resolve_active_stages` reads `studio:` from settings.yml, validates the studio and all its stages exist, and returns the stage list. Returns `""` when no studio is configured.

### Stage Resolution (within a studio)

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/stage.sh"

# Resolves relative to the active studio
STAGE_FILE=$(resolve_stage_definition "design" "software")
# → plugin/studios/software/stages/design/STAGE.md
```

### Phase Resolution (within a stage)

The elaboration and execution systems read phase files directly:

```bash
STAGE_DIR=$(dirname "$(resolve_stage_definition "$STAGE_NAME" "$STUDIO_NAME")")
ELABORATION_FILE="${STAGE_DIR}/phases/ELABORATION.md"
EXECUTION_FILE="${STAGE_DIR}/phases/EXECUTION.md"
```

## Sub-Skill Parameterization

Sub-skills are generic — they contain no hard-coded knowledge about specific stages. They read guidance from the active stage's phase files:

| Sub-Skill | Reads From | What It Gets |
|-----------|-----------|--------------|
| `criteria` | `phases/ELABORATION.md` → `## Criteria Guidance` | Good/bad examples, focus area |
| `decompose` | `STAGE.md` → `unit_types` | Allowed unit disciplines |
| `workflow-select` | `STAGE.md` → `available_workflows` | Constrained workflow list |
| `wireframes` | `phases/ELABORATION.md` → `wireframe_fidelity` | high / low / skip |
| Builder hat | `phases/EXECUTION.md` → `## Builder Focus` | Construction guidance |
| Reviewer hat | `phases/EXECUTION.md` → `## Reviewer Focus` | Review guidance |
| Advance | `phases/EXECUTION.md` → `## Completion Signal` | When to advance |

## Custom Stage Example: Security

A company adds a security stage to the software studio:

```
.haiku/studios/software/
├── STUDIO.md                          # Override: stages: [design, product, security, dev]
└── stages/
    └── security/
        ├── STAGE.md
        └── phases/
            ├── ELABORATION.md
            └── EXECUTION.md
```

**STAGE.md:**
```yaml
---
name: security
description: Threat modeling and penetration testing
requires: [behavioral-specs, data-contracts]
produces: [threat-model, security-requirements, vulnerability-report]
unit_types: [security, backend]
available_workflows: [adversarial]
default_workflow: adversarial
---
```

**phases/ELABORATION.md:**
```yaml
---
skip: [design-direction, wireframes]
add: [threat-model]
wireframe_fidelity: skip
criteria_focus: security
---

# Security Stage — Elaboration

## Criteria Guidance

- OWASP Top 10 coverage for all endpoints
- Authentication and authorization boundary testing
- Data protection requirements (encryption at rest, in transit)
- Input validation and output encoding
...
```

**phases/EXECUTION.md:**
```markdown
# Security Stage — Execution

## Builder Focus

- Perform STRIDE threat modeling for all data flows and trust boundaries
- Write security-focused tests: injection, auth bypass, CSRF, SSRF
- Review dependencies for known CVEs
...

## Reviewer Focus

- Verify all identified threats have documented mitigations
- Check security test coverage against OWASP Top 10
...

## Completion Signal

All identified threats have documented mitigations, security tests cover the
attack surface, and no critical/high findings remain unaddressed.
```

## Custom Studio Example: Hardware

```
.haiku/studios/hardware/
├── STUDIO.md
└── stages/
    ├── requirements/
    │   ├── STAGE.md
    │   └── phases/
    │       ├── ELABORATION.md
    │       └── EXECUTION.md
    ├── pcb-design/
    │   ├── STAGE.md
    │   └── phases/
    │       ├── ELABORATION.md
    │       └── EXECUTION.md
    ├── firmware/
    │   ├── STAGE.md
    │   └── phases/
    │       ├── ELABORATION.md
    │       └── EXECUTION.md
    └── integration-test/
        ├── STAGE.md
        └── phases/
            ├── ELABORATION.md
            └── EXECUTION.md
```

## Migration Path

1. ~~Extract shared phases into sub-skills~~ (done)
2. ~~Rename pass → stage~~ (done)
3. ~~Create studio infrastructure~~ (done — STUDIO.md, studio.sh, stage.sh)
4. Split STAGE.md into STAGE.md + phases/ELABORATION.md + phases/EXECUTION.md
5. Update sub-skills to read from phase files instead of STAGE.md body
6. Update execution hats to read from phases/EXECUTION.md
7. Update settings schema (studio: field replaces default_stages)
8. Update paper, website docs, and CLAUDE.md terminology
9. Delete REFACTOR-SPEC.md (superseded by this spec)

## Backwards Compatibility

**Single-stage mode (no studio configured) MUST work identically to the current system.** This means:
- No `studio:` in settings → `stages: []`, `active_stage: ""`
- Sub-skills use built-in defaults when no stage definition is available
- No STAGE.md, ELABORATION.md, or EXECUTION.md files are read
- The elaboration and execution flows are unchanged from the current working system
