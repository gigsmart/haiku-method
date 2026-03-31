---
title: Core Concepts
description: Fundamental concepts of AI-DLC - completion criteria, backpressure, operating modes, and units
order: 4
---

Understanding these concepts is essential to using AI-DLC effectively. They form the foundation of the methodology.

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

### Pass

A **Pass** is a typed iteration through the standard AI-DLC loop (elaborate → units → construct → review) focused on a specific discipline. Passes enable cross-functional handoffs within a single intent.

**Pass Types:**

| Pass | Participants | Mode | Output |
|------|-------------|------|--------|
| `design` | Design + Product | OHOTL | High-fidelity design artifacts |
| `product` | Product + Design | HITL | Behavioral specs, acceptance criteria |
| `dev` | Dev + Product + Design | AHOTL/HITL | Working code |

**How it works:**

1. Each pass runs the full AI-DLC loop independently
2. The output of one pass becomes input to the next
3. Backward flow is expected -- dev discovering a constraint feeds back to product; product finding a design gap feeds back to design

**Configuration:**

Passes are optional. Single-pass (dev only) is the default. Add passes to an intent when cross-functional iteration is needed:

```yaml
# intent.md frontmatter
---
passes: [design, product, dev]
active_pass: "design"
---
```

When all units in a pass complete, the intent transitions to the next pass automatically. Units belong to a specific pass via their `pass:` frontmatter field.

#### Workflow Constraints

Each pass restricts which workflows are available during its execution. If a workflow is requested that the active pass doesn't support, the pass's default workflow is used instead.

| Pass | Available Workflows | Default Workflow |
|------|---------------------|------------------|
| `design` | `design` | `design` |
| `product` | `default`, `bdd` | `default` |
| `dev` | `default`, `tdd`, `adversarial`, `bdd` | `default` |

This prevents mismatches -- you won't accidentally run TDD during a design pass.

#### Pass-Backs

When a later pass discovers issues that require earlier-pass work, the intent iterates backward:

1. `active_pass` is set backward to the target pass (e.g., dev to product, product to design)
2. New units are created alongside existing completed ones
3. Forward progression resumes after the pass-back is resolved

Pass-backs are triggered by reviewer recommendation or user decision. They represent normal cross-disciplinary iteration -- for example, a dev pass discovering a technical constraint that invalidates a design assumption sends work back to the design pass for correction.

#### Customization

The pass system supports two customization mechanisms:

- **Augment built-in passes:** Create `.ai-dlc/passes/{name}.md` where `{name}` matches a built-in pass (e.g., `design`, `product`, `dev`). Your instructions are appended to the built-in instructions under a "Project Augmentation" heading.
- **Define custom passes:** Create `.ai-dlc/passes/{name}.md` with a name that doesn't match any built-in pass. The custom pass is used directly.

To set default passes for all new intents in a project, configure `default_passes` in `.ai-dlc/settings.yml`:

```yaml
# .ai-dlc/settings.yml
default_passes: [design, product, dev]
```

For deeper theory on how passes fit into the methodology, see the [Iteration Through Passes](https://ai-dlc.dev/papers/ai-dlc-2026/#iteration-through-passes) section of the paper.

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

## Completion Criteria

Completion Criteria are the most important concept in AI-DLC. They define success in measurable, verifiable terms.

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

Quality gates are automated checks that the AI harness mechanically enforces — the agent **cannot stop** until all gates pass. They are defined in YAML frontmatter on the intent and each unit, auto-detected during elaboration, and enforced on every Stop/SubagentStop event via the `quality-gate.sh` hook.

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
- **Auto-detected** — During elaboration, the discovery skill inspects repo tooling (`package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`) and proposes appropriate gates for confirmation.
- **Additive (ratchet)** — Gates are merged additively: unit gates add to intent gates. Builders can add gates but never remove them. The reviewer verifies gate integrity.
- **Scoped to building** — Only building hats (builder, implementer, refactorer) are enforced. Planner, reviewer, and designer hats skip enforcement silently.


## Backpressure

Backpressure is the principle that quality gates should **block** non-conforming work rather than just flag it.

### Prescription vs. Backpressure

**Prescription** (traditional): "First write the interface, then implement, then write tests, then integration tests..."

**Backpressure** (AI-DLC): "These conditions must be satisfied. Figure out how."

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

AI-DLC distinguishes three levels of human involvement, chosen based on the nature of the work.

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

AI-DLC uses a two-tier state model:

### Committed Artifacts (`.ai-dlc/`)

Persisted across sessions, branches, and team members:

| File | Purpose |
|------|---------|
| `intent.md` | What we're building, overall criteria |
| `unit-*.md` | Individual units with their criteria |

### Ephemeral State (`han keep`)

Session-scoped, cleared on `/ai-dlc:reset`:

| Key | Purpose |
|-----|---------|
| `iteration.json` | Current hat, iteration count, status |
| `scratchpad.md` | Learnings and progress notes |
| `blockers.md` | Documented blockers |

### Recovery from Context Loss

If you `/clear` without the stop hook:

1. Committed artifacts (`.ai-dlc/`) are safe
2. Ephemeral state persists in `han keep`
3. Run `/ai-dlc:execute` to continue

## Iteration Through Passes

AI-DLC treats iteration as the natural state of product development. The same State → Work → Feedback → Learn → Adjust pattern applies at every level:

```
Product → Intent → Pass → Unit → Bolt
```

Each level contains the same loop. Passes make the cross-functional iteration explicit rather than ad-hoc.

### When to Use Passes

- **Single-pass (default):** Most dev work. Skip passes entirely -- just elaborate and construct.
- **Multi-pass:** When an intent needs design exploration, product specs, or other discipline-specific iteration before (or after) dev work.

### Backward Flow

Backward arrows between passes are expected, not failures:

```
Design Pass → Product Pass → Dev Pass
     ↑              ↑             │
     │              └─ constraint ─┘
     └──── design gap ─┘
```

When dev discovers a technical constraint that changes the product spec, the intent moves back to the product pass. When product finds a design gap, it moves back to the design pass. This is normal iteration.

For the full theoretical treatment of passes, see the [Iteration Through Passes](https://ai-dlc.dev/papers/ai-dlc-2026/#iteration-through-passes) section of the paper.

## Operations Phase

After construction and integration complete, many features require ongoing maintenance — scheduled jobs, reactive responses to production events, or periodic human reviews. The operations phase provides a structured way to define and manage these tasks using `/ai-dlc:operate`. Operations are defined as spec files alongside the code and tracked through the same state system as the rest of AI-DLC.

See the [Operations Guide](/docs/operations-guide/) for a full walkthrough.

## Next Steps

- **[Workflows](/docs/workflows/)** - Learn the four named workflows
- **[Hats](/docs/hats/)** - Understand each hat's responsibilities
- **[Example: Feature Implementation](/docs/example-feature/)** - See concepts in action
- **[Operations Guide](/docs/operations-guide/)** - Manage ongoing operational tasks
