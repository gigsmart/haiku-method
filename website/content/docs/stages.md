---
title: Stages
description: Stage-based model — each stage defines its own hats, review mode, and completion signals
order: 32
---

A **stage** is a phase of work within a studio's lifecycle. Each stage defines its own hats (roles), review mode, unit types, and input requirements. Stages are defined in `STAGE.md` files.

## How Stages Work

When `/haiku:run` executes an intent, it progresses through stages in the order defined by the studio. Each stage:

1. Activates its hats in sequence
2. Processes units matching its `unit_types`
3. Runs review according to its `review` mode
4. Produces outputs that downstream stages can consume via `inputs`

## STAGE.md Schema

Every stage is defined by a `STAGE.md` file with YAML frontmatter, plus a `hats/` directory containing per-hat instruction files:

```yaml
---
name: development
description: Implement the specification through code
hats: [planner, builder, reviewer]
review: ask
unit_types: [backend, frontend, fullstack]
inputs:
  - stage: product
    output: behavioral-spec
  - stage: product
    output: data-contracts
---
```

### Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Stage identifier |
| `description` | string | What this stage accomplishes |
| `hats` | list | Ordered sequence of hats (roles) for this stage |
| `review` | enum | Review mode: `auto`, `ask`, or `external` |
| `unit_types` | list | Which unit types this stage processes |
| `inputs` | list | Artifacts required from prior stages |

### Review Modes

| Mode | Behavior |
|------|----------|
| `auto` | Stage completes without human review if criteria pass |
| `ask` | Prompts the human to approve before advancing |
| `external` | Requires external review (e.g., PR approval) before advancing |

A stage can specify multiple review modes as a list (e.g., `[external, ask]`), meaning it uses external review first, with ask as fallback.

## Hats Within Stages

Hats are defined as files in the stage's `hats/` directory (e.g., `stages/development/hats/builder.md`). Each hat file specifies:

- **Focus** — What this hat concentrates on
- **Produces** — What artifacts or outputs the hat creates
- **Reads** — What inputs the hat consumes
- **Anti-patterns** — Common mistakes to avoid

### Example: Development Stage Hats

The development stage directory contains:

```
stages/development/
  STAGE.md
  hats/
    planner.md
    builder.md
    reviewer.md
```

Each hat file follows this structure:

**`hats/planner.md`:**
```markdown
**Focus:** Read the unit spec and prior stage outputs, plan the implementation
approach, identify files to modify, assess risks.

**Produces:** Tactical plan with files to modify, implementation steps,
verification commands, and risk assessment.

**Reads:** Unit spec, behavioral-spec, and data-contracts.

**Anti-patterns:**
- Planning without reading the completion criteria
- Not identifying risks or potential blockers up front
```

**`hats/builder.md`:**
```markdown
**Focus:** Implement code to satisfy completion criteria, working in small
verifiable increments.

**Produces:** Working code committed to the branch in incremental commits.

**Anti-patterns:**
- Disabling lint, type checks, or test suites to make code pass
- Continuing past 3 failed attempts without documenting a blocker
```

**`hats/reviewer.md`:**
```markdown
**Focus:** Verify implementation satisfies completion criteria through
multi-stage review.

**Produces:** Structured review decision — APPROVED or REQUEST CHANGES.

**Anti-patterns:**
- Approving without running verification commands
- Trusting claims over evidence
```

## The requires/produces Pipeline

Stages can declare **inputs** (what they need from earlier stages) and produce **outputs** (artifacts in the stage's outputs directory). This creates a pipeline:

```
inception → discovery document
    ↓
design → design brief (reads discovery)
    ↓
product → behavioral spec, data contracts (reads discovery + design)
    ↓
development → code (reads spec + contracts)
    ↓
security → security review (reads spec + code)
```

Each stage's inputs reference specific outputs from prior stages. If a required input doesn't exist, the stage blocks until it's produced.

## Built-in Stages

### Software Studio Stages

| Stage | Hats | Review | Purpose |
|-------|------|--------|---------|
| **inception** | architect, decomposer | auto | Problem understanding, unit decomposition |
| **design** | designer, design-reviewer | ask | Visual/interaction design |
| **product** | product-owner, specification-writer | external, ask | Behavioral specs, acceptance criteria |
| **development** | planner, builder, reviewer | ask | Implementation with quality gates |
| **operations** | ops-engineer, sre | auto | Deployment, monitoring, runbooks |
| **security** | threat-modeler, red-team, blue-team, security-reviewer | external, ask | Threat modeling, vulnerability assessment |

### Ideation Studio Stages

| Stage | Hats | Review | Purpose |
|-------|------|--------|---------|
| **research** | researcher, analyst | auto | Gather context, explore prior art |
| **create** | creator, editor | ask | Generate the primary deliverable |
| **review** | critic, fact-checker | ask | Adversarial quality review |
| **deliver** | publisher | auto | Finalize and package |

## Completion Signals

Each `STAGE.md` ends with a **Completion Signal** section that defines when the stage is done. These are not just criteria checklists — they describe the conditions under which the stage can advance.

Example from inception:

> Discovery document exists with domain model and technical landscape. All units have specs with dependencies and verifiable completion criteria. Unit DAG is acyclic. Each unit is scoped to complete within a single bolt.

## Creating a Custom Stage

To add a custom stage to a studio:

1. Create the stage directory: `.haiku/studios/{studio}/stages/{stage}/`
2. Write `STAGE.md` with frontmatter
3. Create a `hats/` subdirectory with per-hat instruction files
4. Add the stage name to the studio's `stages` list in `STUDIO.md`

Example custom stage:

```yaml
---
name: compliance
description: Regulatory compliance verification
hats: [compliance-auditor, documentation-writer]
review: external
unit_types: [compliance]
inputs:
  - stage: development
    output: code
  - stage: security
    output: threat-model
---
```

With hat files in the stage's `hats/` directory:

**`hats/compliance-auditor.md`:**
```markdown
**Focus:** Verify implementation meets regulatory requirements...
```

**`hats/documentation-writer.md`:**
```markdown
**Focus:** Generate compliance documentation...
```

## Criteria Guidance

Each built-in stage includes a **Criteria Guidance** section with examples of good and bad completion criteria specific to that stage's domain. This helps teams write verifiable criteria during inception.

## Next Steps

- [Studios](/docs/studios/) — Named lifecycle templates
- [Core Concepts](/docs/concepts/) — Intents, units, bolts, and completion criteria
- [CLI Reference](/docs/cli-reference/) — Complete command reference
