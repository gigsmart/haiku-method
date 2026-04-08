---
title: Core Concepts
description: Fundamental concepts of H·AI·K·U - completion criteria, backpressure, operating modes, and units
order: 5
---

Understanding these concepts is essential to using H·AI·K·U effectively. They form the foundation of the methodology.

## Intents and Units

### Intent

An **Intent** is a high-level statement of purpose - what you want to achieve. It encapsulates a business goal, feature, or technical outcome.

Every Intent includes:
- **Description** - What you're building and why
- **Completion Criteria** - Verifiable conditions that define success
- **Context** - Business background and constraints

```markdown
# Intent: Product Recommendation Engine

## Description
Build a recommendation engine that suggests complementary products
based on purchase history and browsing behavior.

## Business Context
- E-commerce platform with 50,000 products
- 1 million monthly active users
- Need real-time recommendations (<100ms)

## Completion Criteria
- [ ] API responds in <100ms p99
- [ ] Recommendations improve click-through by 10%+
- [ ] Works for new users (cold start handled)
```

### Unit

A **Unit** is a cohesive, self-contained work element derived from an Intent. Think of it as a focused piece of the larger goal.

**Characteristics:**
- Cohesive - user stories within are highly related
- Loosely coupled - minimal dependencies on other units
- Independently deployable - can go to production alone
- Clear boundaries - ownership and scope are unambiguous

```
add-recommendation-engine/
  intent.md
  unit-01-data-collection.md    # Capture user behavior
  unit-02-model.md              # Train ML model
  unit-03-api.md                # Real-time serving API
  unit-04-frontend.md           # Display recommendations
```

### Stage

A **Stage** is a typed phase within a studio's pipeline, each focused on a specific discipline. Stages organize work into focused phases -- each with its own set of hats -- enabling cross-functional iteration within a single intent.

**Stage Types (Software Studio):**

| Stage | Hats | Mode | Output |
|-------|------|------|--------|
| `design` | Designer, Design Reviewer | OHOTL | High-fidelity design artifacts |
| `product` | Product Owner, Specification Writer | HITL | Behavioral specs, acceptance criteria |
| `development` | Planner, Builder, Reviewer | AHOTL/HITL | Working code |

**How it works:**

1. Each stage runs independently through its hat sequence
2. The output of one stage becomes input to the next
3. Backward flow is expected -- development discovering a constraint feeds back to product; product finding a design gap feeds back to design

**Configuration:**

Stages are defined by the studio. The simplest studios (like the default software studio) use only the development stage. Multi-stage studios add design, product, or other discipline-specific stages when cross-functional iteration is needed.

Studios are selected during `/haiku:start` and their stages run automatically via `/haiku:resume`.

#### Stage Constraints

Each stage restricts which hats are available during its execution. Hats are defined as files in `stages/{stage}/hats/{hat}.md`, ensuring the right discipline is applied at the right time.

| Stage | Available Hats | Focus |
|-------|---------------|-------|
| `design` | Designer, Design Reviewer | Visual and UX work |
| `product` | Product Owner, Specification Writer | Behavioral specs |
| `development` | Planner, Builder, Reviewer | Implementation |

This prevents mismatches -- you won't accidentally run development hats during a design stage.

#### Stage-Backs

When a later stage discovers issues that require earlier-stage work, the intent iterates backward:

1. The active stage is set backward to the target stage (e.g., development to product, product to design)
2. New units are created alongside existing completed ones
3. Forward progression resumes after the stage-back is resolved

Stage-backs are triggered by reviewer recommendation or user decision. They represent normal cross-disciplinary iteration -- for example, a development stage discovering a technical constraint that invalidates a design assumption sends work back to the design stage for correction.

#### Customization

The stage system supports customization through the studio directory structure:

- **Augment built-in stages:** Create a `STAGE.md` in `.haiku/studios/{studio}/stages/{name}/` where `{name}` matches a built-in stage. Your instructions are appended to the built-in instructions under a "Project Augmentation" heading.
- **Define custom stages:** Create a new stage directory in `.haiku/studios/{studio}/stages/{name}/` with a name that doesn't match any built-in stage. The custom stage is used directly.

To set the default studio for all new intents in a project, configure it in `.haiku/settings.yml`:

```yaml
# .haiku/settings.yml
default_studio: software
```

For deeper theory on how stages fit into the methodology, see the [Studios & Stages](/docs/studios/) documentation.

### Unit Dependencies (DAG)

Units can declare dependencies, forming a Directed Acyclic Graph:

```yaml
# unit-04-frontend.md frontmatter
---
status: pending
depends_on: [unit-02-model, unit-03-api]
---
```

This enables:
- **Fan-out**: Independent units execute in parallel
- **Fan-in**: Units wait for all dependencies before starting
- **Maximum parallelism**: Ready units start immediately

### Project Knowledge Layer

H·AI·K·U accumulates project intelligence in a **Knowledge Layer** -- structured artifacts in `.haiku/knowledge/` that persist across intents. Five artifact types capture what the project *is*:

| Artifact | What It Captures |
|----------|-----------------|
| **design** | Visual language, component patterns, design tokens |
| **architecture** | System structure, module boundaries, technology choices |
| **product** | Business rules, user personas, domain vocabulary |
| **conventions** | Coding standards, naming patterns, file organization |
| **domain** | Domain model, entity relationships, bounded contexts |

Knowledge artifacts are populated automatically during inception:
- **Brownfield projects:** A synthesis subagent scans the codebase and distills patterns into artifacts
- **Greenfield projects:** Scaffold artifacts are created, then seeded via the Design Direction picker

All four execution hats read relevant knowledge artifacts, so the fifth intent in a project benefits from everything learned during the first four.

### Design Direction

For greenfield or early-stage projects, inception includes a **Design Direction** phase where the team selects a visual archetype and tunes parameters. The available archetypes (Brutalist, Editorial, Dense/Utilitarian, Playful/Warm) and tunable parameters (density, border treatment, color temperature, typographic contrast) produce a **design blueprint** that:

- Seeds the `design` knowledge artifact for the project
- Guides wireframe generation during inception
- Provides design context to all hats during execution

This phase is skipped for established projects where design knowledge already exists.

## Completion Criteria

Completion Criteria are the most important concept in H·AI·K·U. They define success in measurable, verifiable terms.

### Why They Matter

```
Autonomy = f(Criteria Clarity)
```

- **Vague criteria** = Constant human oversight required
- **Clear criteria** = AI can self-verify and operate autonomously

### Good Criteria Are:

| Attribute | Bad Example | Good Example |
|-----------|-------------|--------------|
| **Specific** | "Make login work" | "Users can log in with email/password" |
| **Measurable** | "Be performant" | "API responds in <200ms p95" |
| **Atomic** | "Handle all edge cases" | "Returns 400 for missing fields" |
| **Verifiable** | "Code is clean" | "No ESLint errors or warnings" |

### Include Negative Cases

Don't just specify what should work - specify what should fail:

```markdown
## Completion Criteria

### Success Cases
- [ ] Valid credentials -> user logged in
- [ ] Remember me checked -> session persists 30 days

### Failure Cases
- [ ] Invalid password -> "Incorrect password" error
- [ ] Non-existent email -> "Account not found" error
- [ ] Empty fields -> validation errors shown
```

### Quality Gates

Quality gates are automated checks that the harness mechanically enforces — the agent **cannot stop** until all gates pass. They are defined in YAML frontmatter on the intent and each unit, auto-detected during inception, and enforced on every Stop/SubagentStop event via the `quality-gate.sh` hook.

```yaml
# intent.md or unit-*.md frontmatter
quality_gates:
  - name: tests
    command: bun test
  - name: typecheck
    command: tsc --noEmit
  - name: lint
    command: biome check
```

**Key properties:**

- **Harness-enforced** — The agent is mechanically blocked from stopping if any gate fails. This is not advisory; it is structural.
- **Auto-detected** — During inception, the discovery skill inspects repo tooling (`package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`) and proposes appropriate gates for confirmation.
- **Additive (ratchet)** — Gates are merged additively: unit gates add to intent gates. Builders can add gates but never remove them. The reviewer verifies gate integrity.
- **Scoped to building** — Only building hats (builder, implementer, refactorer) are enforced. Planner, reviewer, and designer hats skip enforcement silently.


## Backpressure

Backpressure is the principle that quality gates should **block** non-conforming work rather than just flag it.

### Prescription vs. Backpressure

**Prescription** (traditional): "First write the interface, then implement, then write tests, then integration tests..."

**Backpressure** (H·AI·K·U): "These conditions must be satisfied. Figure out how."

### How It Works

Instead of telling AI exactly what to do, define constraints:

- All tests must pass
- Type checks must succeed
- Linting must be clean
- Security scans must clear
- Coverage must exceed threshold

AI iterates until all constraints are satisfied.

### Benefits

- **Leverages AI fully** - AI applies its training without artificial constraints
- **Simpler prompts** - Success criteria are easier than step-by-step instructions
- **Measurable success** - Programmatic verification enables autonomy
- **Better iteration** - Each failure provides signal

### The Philosophy

> "Better to fail predictably than succeed unpredictably."

Each failure is data. Each iteration refines the approach. The skill shifts from directing AI step-by-step to writing criteria and tests that converge toward correct solutions.

## Operating Modes

H·AI·K·U distinguishes three levels of human involvement, chosen based on the nature of the work.

### HITL (Human-in-the-Loop)

Human validates each significant step before AI proceeds.

```
Human defines task
    ↓
AI proposes approach
    ↓
Human validates  ←──┐
    ↓               │
AI executes         │
    ↓               │
Human reviews ──────┘
```

**Use when:**
- Novel domains or first-time implementations
- Architectural decisions with long-term consequences
- High-risk operations (production data, security)
- Foundational decisions shaping later work

### OHOTL (Observed Human-on-the-Loop)

Human watches in real-time, can intervene, but doesn't block progress.

```
Human defines criteria
    ↓
AI works ←──────────┐
    ↓               │
Human observes      │
    ↓               │
Redirect? ──Yes─────┘
    │
    No
    ↓
Criteria met? ──No──→ (continue)
    │
    Yes
    ↓
Human reviews output
```

**Use when:**
- Creative and subjective work (UX, design, content)
- Training scenarios where observation has value
- Medium-risk changes benefiting from awareness
- Iterative refinement where taste guides direction

### AHOTL (Autonomous Human-on-the-Loop)

AI operates autonomously within boundaries until criteria are met.

```
Human defines criteria
    ↓
AI iterates autonomously ←──┐
    ↓                       │
Quality gates pass? ──No────┘
    │
    Yes
    ↓
Criteria met? ──No──────────┘
    │
    Yes
    ↓
Human reviews output
```

**Use when:**
- Well-defined tasks with clear acceptance criteria
- Programmatically verifiable work
- Batch operations (migrations, refactors)
- Mechanical transformations following patterns

### Comparison

| Aspect | HITL | OHOTL | AHOTL |
|--------|------|-------|-------|
| **Human Attention** | Continuous, blocking | Continuous, non-blocking | Periodic, on-demand |
| **Approval Model** | Before each step | Any time (interrupt) | At completion |
| **AI Autonomy** | Minimal | Moderate | Full within boundaries |
| **Best For** | Novel, high-risk | Creative, subjective | Mechanical, verifiable |

### The Google Maps Analogy

- **HITL**: You tell GPS each turn, it confirms, you approve
- **OHOTL**: GPS drives while you watch, you can redirect anytime
- **AHOTL**: You set destination, define acceptable routes, check when you arrive

## Execution Modes: Continuous vs Discrete

When creating an intent with `/haiku:start`, you select an execution mode that controls how stages advance.

### Continuous Mode

Continuous mode runs each stage in sequence, advancing automatically when review gates allow. When a gate passes (`auto`), the framework moves to the next stage without human intervention. When a gate requires approval (`ask`), external review (`external`), or an external event (`await`), the framework pauses at that gate, then continues through remaining stages once resolved.

This is the default. It suits initiatives where the human trusts the review gates to enforce quality at each stage boundary.

### Discrete Mode

Discrete mode runs the same stage loop but always stops after each stage completes, regardless of the review gate setting. The human explicitly advances through stages by invoking `/haiku:resume` again.

This suits larger initiatives, cross-team work, and situations where each stage needs explicit human review before the next begins — for example, when a product stage's outputs must be approved by a different stakeholder than the development stage's outputs.

### How They Differ

Both modes execute the same four-step stage loop (elaborate, execute, adversarial review, gate). The difference is post-gate behavior:

| Aspect | Continuous | Discrete |
|--------|-----------|----------|
| **After `auto` gate passes** | Advance to next stage | Stop; wait for `/haiku:resume` |
| **After `ask` gate** | Pause for approval, then advance | Pause for approval, then stop |
| **After `external` gate** | Block until resolved, then advance | Block until resolved, then stop |
| **After `await` gate** | Block until event, then advance | Block until event, then stop |
| **Best for** | Trusted pipelines, small intents | Large intents, multi-stakeholder review |

## Bolts

A **Bolt** is a single iteration cycle - one focused work session bounded by context resets (`/clear`).

### Why "Bolt"?

The term emphasizes intense focus and high-velocity delivery. Bolts are measured in hours, not weeks.

### The Bolt Cycle

1. Load context from committed artifacts
2. Execute work through hat transitions
3. Iterate until quality gates pass or blocked
4. Save state (commit artifacts, update ephemeral state)
5. Clear context if needed
6. Repeat

### Bolt Boundaries

A Bolt naturally ends when:
- Context window gets heavy (prompting `/clear`)
- A unit is completed
- Work is blocked and needs human input
- The session times out

## State Management

H·AI·K·U tracks state at three levels — intent, stage, and unit — using frontmatter fields and JSON state files. MCP tools (`haiku_intent_*`, `haiku_stage_*`, `haiku_unit_*`) are the primary interface for reading and writing state.

### Intent State

Stored as frontmatter fields in `intent.md`:

| Field | Purpose |
|------|---------|
| `started_at` | When the intent began |
| `completed_at` | When the intent finished |
| `status` | Current intent status (active, completed, blocked) |

### Stage State

Stored in `stages/{stage}/state.json` within the intent directory:

| Field | Purpose |
|------|---------|
| `phase` | Current phase within the stage (elaborate, execute, review, gate) |
| `started_at` | When the stage began |
| `completed_at` | When the stage finished |
| `gate_entered_at` | When the review gate was reached |
| `gate_outcome` | Result of gate evaluation (passed, waiting, blocked) |

### Unit State

Stored as frontmatter fields in `unit-*.md`:

| Field | Purpose |
|------|---------|
| `bolt` | Current bolt (iteration) number |
| `hat` | Current hat within the bolt's hat sequence |
| `status` | Unit status (pending, active, completed, blocked) |
| `started_at` | When the unit began |
| `completed_at` | When the unit finished |

### Supporting Files

| File | Purpose |
|------|---------|
| `scratchpad.md` | Learnings and progress notes |
| `blockers.md` | Documented blockers |

### Recovery from Context Loss

If you `/clear` without the stop hook:

1. Committed artifacts (`.haiku/`) are safe — intent, stage, and unit state are persisted to disk
2. MCP tools reconstruct full execution context on session start
3. Run `/haiku:resume` to continue

## Iteration Through Stages

H·AI·K·U treats iteration as the natural state of product development. The same State -> Work -> Feedback -> Learn -> Adjust pattern applies at every level:

```
Product → Intent → Stage → Unit → Bolt
```

Each level contains the same loop. Stages make the cross-functional iteration explicit rather than ad-hoc.

### When to Use Stages

- **Single-stage (default):** Most dev work. Use a simple studio with only the development stage -- just create the intent and execute.
- **Multi-stage:** When an intent needs design exploration, product specs, or other discipline-specific iteration before (or after) dev work. Select a studio with multiple stages.

### Backward Flow

Backward arrows between stages are expected, not failures:

```
Design Stage → Product Stage → Dev Stage
     ↑              ↑             │
     │              └─ constraint ─┘
     └──── design gap ─┘
```

When dev discovers a technical constraint that changes the product spec, the intent moves back to the product stage. When product finds a design gap, it moves back to the design stage. This is normal iteration.

For the full theoretical treatment of stages, see the [Studios & Stages](/docs/studios/) documentation.

## Design Providers

H·AI·K·U supports six design providers that connect your workflow to external design tools: **Canva**, **Figma**, **OpenPencil**, **Pencil**, **Penpot**, and **Excalidraw**. Providers are detected automatically from available MCP tools or configured explicitly in `.haiku/settings.yml`.

Each provider has different capabilities — some support components and prototyping (Figma, Penpot), others offer AI-powered design generation (Canva, OpenPencil, Pencil), and all support reading, writing, and exporting designs. During elaboration, the design provider pulls relevant mockups and component specs. During execution, builders reference design specs and reviewers cross-check implementations.

Design references use provider-specific URI schemes (e.g., `figma://file-key#node=1:42`) stored in unit frontmatter, enabling automatic resolution during execution.

See the [Design Providers Guide](/docs/guide-design-providers/) for setup instructions, capability details, and configuration for each provider.

## Intent Templates

Studios ship with parameterized intent templates in `studios/{name}/templates/`. Templates provide pre-filled units with `{{ parameter }}` substitution, so common patterns can be instantiated without manual elaboration.

Use `/haiku:start --template <name> --param key=value` to create an intent from a template. For example:

```
/haiku:start --template new-feature --param feature_name="User Profiles" --param api_prefix="/api/v2"
```

Ten templates ship across seven studios:

| Template | Studio | Purpose |
|----------|--------|---------|
| `new-feature` | software | Standard feature with inception through security |
| `bugfix` | software | Bug investigation and fix with regression tests |
| `refactor` | software | Code restructuring with safety checks |
| `new-prospect` | sales | New prospect research and qualification |
| `new-customer-onboarding` | customer-success | Customer onboarding workflow |
| `quarterly-evidence-collection` | compliance | Periodic compliance evidence gathering |
| `production-incident` | incident-response | Incident response from triage to postmortem |
| `product-launch` | marketing | Product launch campaign from research to measurement |
| `api-documentation` | documentation | API documentation from audit to publish |

Templates define units with completion criteria, dependencies, and stage assignments. Parameters are substituted at instantiation time, producing a fully elaborated intent ready for `/haiku:resume`.

## Operations Phase

After construction and integration complete, many features require ongoing maintenance — scheduled jobs, reactive responses to production events, or periodic human reviews. The operations phase provides a structured way to define and manage these tasks using `/haiku:operate`. Operations are defined as spec files alongside the code and tracked through the same state system as the rest of H·AI·K·U.

### Studio Operation Templates

Studios prescribe operation templates in `studios/{name}/operations/`. When you run `/haiku:operate`, it reads the current studio's templates to offer domain-appropriate operations. For example, the software studio provides deployment, monitoring, and rollback operations; the incident-response studio provides communication and escalation operations.

Thirty-eight operation templates ship across twelve studios. Teams can add project-specific operations in `.haiku/studios/{name}/operations/` using the same override mechanism as stages and hats.

### Studio Reflection Dimensions

Studios prescribe reflection dimensions in `studios/{name}/reflections/`. When you run `/haiku:reflect`, it reads the current studio's dimensions to structure the post-mortem analysis along axes relevant to the domain. The software studio reflects on code quality, test coverage, and architecture decisions; the sales studio reflects on deal velocity, objection handling, and pipeline accuracy.

Twenty-six reflection dimensions ship across twelve studios. Custom dimensions follow the same project-level override pattern.

See the [Operations Guide](/docs/operations-guide/) for a full walkthrough.

## Next Steps

- **[Studios & Stages](/docs/studios/)** - Learn about studios and their stage pipelines
- **[The Hat System](/docs/hats/)** - Understand each hat's responsibilities within stages
- **[CLI Reference](/docs/cli-reference/)** - Full command reference
- **[Example: Feature Implementation](/docs/example-feature/)** - See concepts in action
- **[Operations Guide](/docs/operations-guide/)** - Manage ongoing operational tasks
