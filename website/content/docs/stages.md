---
title: Stages
description: Stage-based model — each stage defines its own hats, review mode, and completion signals
order: 32
---

A **stage** is a phase of work within a studio's lifecycle. Each stage defines its own hats (roles), review mode, unit types, and input requirements. Stages are defined in `STAGE.md` files.

## How Stages Work

When `/haiku:resume` executes an intent, it progresses through stages in the order defined by the studio. Each stage runs a four-step cycle:

1. **Elaborate** — Break the stage's work into units with completion criteria and a dependency DAG. Check input freshness; if an upstream output has a gap, run a stage-scoped refinement (targeted side-trip to the upstream stage)
2. **Execute** — For each unit, run the bolt loop through the stage's hat sequence. Artifacts are committed to git automatically as they are produced.
3. **Adversarial review** — Spawn the stage's review agents (plus any included from other stages) to verify the work
4. **Gate** — Evaluate the review mode and advance, pause for approval, block for external review, or await an external event

## STAGE.md Schema

Every stage is defined by a `STAGE.md` file with YAML frontmatter, plus `hats/` and `review-agents/` directories:

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
review-agents-include:
  - stage: design
    agents: [consistency, accessibility]
  - stage: product
    agents: [completeness]
---
```

### Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Stage identifier |
| `description` | string | What this stage accomplishes |
| `hats` | list | Ordered sequence of hats (roles) for this stage |
| `review` | enum | Review mode: `auto`, `ask`, `external`, or `await` |
| `unit_types` | list | Which unit types this stage processes |
| `inputs` | list | Artifacts required from prior stages |
| `review-agents-include` | list | Review agents from other stages to include during adversarial review |
| `gate-protocol` | object | Timeout, escalation, and conditions for the review gate (optional) |

### Review Modes

| Mode | Behavior |
|------|----------|
| `auto` | Stage completes without human review if criteria pass |
| `ask` | Prompts the human to approve before advancing |
| `external` | Requires external review (e.g., PR approval) before advancing |
| `await` | Stage work is complete but blocks until an external event occurs (e.g., customer response, CI result, stakeholder decision) |

A stage can specify multiple review modes as a list (e.g., `[external, ask]`), meaning it uses external review first, with ask as fallback.

The `await` gate is distinct from `external` — `external` pushes work for review by another person; `await` blocks because the ball is in someone else's court entirely (a customer needs to respond, a third-party approval needs to come through, a pipeline needs to finish).

### Gate Protocol

Stages can define a `gate-protocol:` to control timeout and escalation behavior:

```yaml
gate-protocol:
  timeout: 48h              # duration before timeout action triggers
  timeout-action: escalate  # escalate | auto-advance | block
  escalation: comms         # provider category to notify on timeout
  conditions:               # pre-conditions to pass the gate
    - "no HIGH findings from review agents"
```

| Field | Type | Description |
|-------|------|-------------|
| `timeout` | duration | Time before timeout fires (`48h`, `7d`, `30m`) |
| `timeout-action` | enum | `escalate` (notify), `auto-advance` (skip), `block` (keep waiting) |
| `escalation` | string | Provider category to notify on timeout |
| `conditions` | list | Pre-conditions that must be true before the gate can pass |

The `/haiku:triggers` skill checks gate timeouts during each poll cycle.

### Stage-Scoped Refinement

During elaboration, if the agent discovers an upstream stage's output has a small gap (e.g., a missing screen in a design brief), it can run a **stage-scoped refinement** — a targeted side-trip to the upstream stage:

1. Create a single unit in the upstream stage for the missing output
2. Run that unit through the upstream stage's hat sequence
3. Persist the updated output
4. Return to the current stage with the gap filled

This does NOT reset the current stage's progress. It's a scoped side-trip, not a full stage-back. The agent can invoke this autonomously for small gaps. Full stage-backs (resetting `active_stage` to a prior stage) are always human-initiated.

Use `/haiku:refine stage:{upstream-stage}` to trigger this explicitly.

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
  review-agents/
    correctness.md
    security.md
    performance.md
    architecture.md
    test-quality.md
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

## Review Agents Within Stages

Review agents are specialized adversarial agents that run during a stage's adversarial review step (step 3). Each agent evaluates the stage's output against a specific mandate. They are defined as files in the stage's `review-agents/` directory.

### Example: Development Stage Review Agents

```
stages/development/
  STAGE.md
  hats/
    planner.md
    builder.md
    reviewer.md
  review-agents/
    correctness.md
    security.md
    performance.md
    architecture.md
    test-quality.md
```

Each review agent file follows this structure:

**`review-agents/security.md`:**
```yaml
---
name: security
stage: development
studio: software
---

**Mandate:** Identify security vulnerabilities introduced by the implementation.

**Check:**
- No injection vectors (SQL, command, XSS, template injection)
- Authentication and authorization checks are present on all protected paths
- Secrets are not hardcoded or logged
- Input validation occurs at system boundaries
```

### Cross-Stage Review Agents

Stages can include review agents from other stages via `review-agents-include`. This enables downstream stages to verify that upstream work was not violated:

```yaml
review-agents-include:
  - stage: design
    agents: [consistency, accessibility]
```

The included agents run alongside the stage's own review agents during adversarial review. For example, the development stage includes the design stage's consistency and accessibility agents to verify the implementation respects the design intent.

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

| Stage | Hats | Review Agents | Review | Purpose |
|-------|------|---------------|--------|---------|
| **inception** | researcher, elaborator | completeness, feasibility | auto | Problem understanding, unit elaboration |
| **design** | designer, design-reviewer | consistency, accessibility | ask | Visual/interaction design |
| **product** | product-owner, specification-writer | completeness, feasibility | external, ask | Behavioral specs, acceptance criteria |
| **development** | planner, builder, reviewer | correctness, security, performance, architecture, test-quality + design:consistency, design:accessibility, product:completeness | ask | Implementation with quality gates |
| **operations** | ops-engineer, sre | reliability, observability + development:security | auto | Deployment, monitoring, runbooks |
| **security** | threat-modeler, red-team, blue-team, security-reviewer | threat-coverage, mitigation-effectiveness + development:security, development:architecture, operations:reliability | external, ask | Threat modeling, vulnerability assessment |

### Ideation Studio Stages

| Stage | Hats | Review Agents | Review | Purpose |
|-------|------|---------------|--------|---------|
| **research** | researcher, analyst | thoroughness | auto | Gather context, explore prior art |
| **create** | creator, editor | quality, accuracy | ask | Generate the primary deliverable |
| **review** | critic, fact-checker | coherence | ask | Adversarial quality review |
| **deliver** | publisher | completeness | auto | Finalize and package |

## Completion Signals

Each `STAGE.md` ends with a **Completion Signal** section that defines when the stage is done. These are not just criteria checklists — they describe the conditions under which the stage can advance.

Example from inception:

> Discovery document exists with domain model and technical landscape. All units have specs with dependencies and verifiable completion criteria. Unit DAG is acyclic. Each unit is scoped to complete within a single bolt.

## Creating a Custom Stage

To add a custom stage to a studio:

1. Create the stage directory: `.haiku/studios/{studio}/stages/{stage}/`
2. Write `STAGE.md` with frontmatter
3. Create a `hats/` subdirectory with per-hat instruction files
4. Create a `review-agents/` subdirectory with per-agent review mandate files
5. Add the stage name to the studio's `stages` list in `STUDIO.md`
6. If this stage should verify upstream work, add entries to `review-agents-include`

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
