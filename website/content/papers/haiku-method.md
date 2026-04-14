---
title: "H·AI·K·U: Human + AI Knowledge Unification"
subtitle: "A Universal Framework for Structured Human-AI Collaboration"
description: "A methodology paper describing H·AI·K·U's four-phase lifecycle, studio-based domain adaptation, and the plugin implementation that enforces structured collaboration through backpressure, hat-based role separation, and persistence abstraction."
date: "2026-04-03"
authors: ["GigSmart"]
tags: ["methodology", "human-ai-collaboration", "haiku", "framework", "autonomous-agents"]
---

## Acknowledgments & Attribution

H·AI·K·U builds on foundational work in human-AI collaboration methodology, generalized from production experience across multiple domains.

### Foundational Work

**Raja SP, Amazon Web Services** — *AI-Driven Development Lifecycle (AI-DLC) Method Definition* (July 2025). The core concepts of Intent, Unit, Bolt, and the philosophy of reimagining methods rather than retrofitting AI into existing processes originate from this work. [16]

**GigSmart** — *AI-DLC 2026* (January 2026). The software development profile that served as the first complete implementation of H·AI·K·U principles, demonstrating backpressure-driven quality, human-on-the-loop workflows, and autonomous execution loops in production.

### Key Influences

**Geoffrey Huntley** — The Ralph Wiggum autonomous loop methodology and the principle of backpressure over prescription. [9]

**Steve Wilson (OWASP)** — Human-on-the-Loop governance frameworks and the articulation of supervision modes for AI systems. [10]

**paddo.dev** — Analysis of phase collapse in traditional workflows, the 19-agent trap, and the insight that sequential handoffs become friction rather than quality control in AI-driven environments. [7]

**HumanLayer** — 12 Factor Agents principles and the articulation of governance-as-code patterns for autonomous systems. [15]

---

## 1. The Problem

Unstructured AI collaboration fails in predictable ways. Whether the domain is software engineering, content creation, research, or operations, the same five failure modes recur when humans work with AI agents without a governing framework.

**Context evaporation.** AI agents operate within bounded sessions. When a session ends, everything the agent learned — domain constraints, design decisions, intermediate findings — disappears. The next session starts from zero. Work that spans multiple sessions degrades into repetition, contradiction, or drift.

**Unchecked error propagation.** Without structural enforcement, an error introduced early in a workflow compounds silently. A flawed assumption in analysis becomes a flawed specification becomes a flawed deliverable. By the time a human notices, the cost of correction has multiplied.

**Absent completion criteria.** "Done" is undefined. Agents produce output that appears sufficient but has never been verified against explicit, measurable standards. The human must either trust the output on faith or manually audit every artifact — defeating the purpose of AI assistance.

**Wrong supervision level.** Some work requires continuous human oversight. Some can run autonomously with periodic checkpoints. Some needs full human-in-the-loop collaboration. Without a mechanism to select and enforce the appropriate mode, teams either over-supervise (negating efficiency gains) or under-supervise (accepting uncontrolled risk).

**No learning loop.** The same mistakes recur across projects because there is no structured mechanism to capture what went wrong, why, and how to prevent it. Each initiative starts with the same blind spots as the last.

These are not theoretical concerns. They are the observable failure modes of ad-hoc AI collaboration at scale. H·AI·K·U addresses each one through structural constraints rather than behavioral suggestions — the framework enforces correctness rather than hoping for it.

---

## 2. The Four-Phase Lifecycle

All structured work, regardless of domain, follows a universal lifecycle of four phases:

```
Elaboration → Execution → Operation → Reflection
     ↑                                       |
     └─────────── Feed Forward ──────────────┘
```

These phases are not a process methodology to be adopted. They are an observation about how deliberate work proceeds when it succeeds. H·AI·K·U makes this structure explicit so that both human and AI participants share a common model of where they are, what comes next, and what "done" means.

### Elaboration

Elaboration answers *what* and *why* before any work begins. It decomposes a broad initiative into discrete, verifiable units of work — each with explicit completion criteria that can be checked mechanically or through structured review.

Three levels of planning occur during elaboration, each at a different granularity:

1. **Intent planning** defines the initiative's scope, goals, and success criteria. This is always a collaborative act between human and AI — the human provides direction and domain judgment; the AI provides decomposition, gap analysis, and structural rigor. The output is an *intent*: a named, versioned artifact that anchors all subsequent work.

2. **Unit planning** breaks the intent into discrete chunks scoped to a single stage. Each *unit* carries its own completion criteria — specific, verifiable conditions that determine whether the unit is done. Units form a directed acyclic graph based on their dependencies.

3. **Bolt planning** is tactical. Before each execution cycle (a *bolt*), the agent plans what the next behavioral role needs to accomplish within the current unit. This level is AI-driven — the human has already set direction at the intent and unit levels.

The elaboration phase is the primary defense against the "absent completion criteria" failure mode. No unit enters execution without explicit, verifiable criteria.

### Execution

Execution does the work. For each unit, the agent cycles through a defined sequence of behavioral roles — each role constrained to a specific concern. A typical cycle might move from planning to building to adversarial review. This cycle is a *bolt*: one complete pass through the role sequence for a unit.

The structural separation of roles is deliberate. The role that builds an artifact never reviews its own output. A separate review role evaluates the work against the unit's completion criteria, applying verification rather than trust. This adversarial structure is the primary defense against unchecked error propagation.

Quality gates enforce standards at each cycle. Completion criteria are checked mechanically where possible (tests, linters, type systems) and through structured review where mechanical checking is insufficient. A unit cannot advance until its criteria are satisfied. This enforcement is performed by the framework harness, not by the agent — the agent cannot override, weaken, or skip a quality gate.

When execution stalls, a structured repair sequence applies: retry the operation (for transient failures), decompose the problem into smaller subtasks, try an alternative approach, or escalate to a human. This sequence is fixed — agents cannot skip levels or invent novel recovery strategies.

### Operation

Operation manages what was delivered. This phase covers ongoing maintenance, monitoring, incident response, and the steady-state work that follows initial delivery. Not all initiatives have a meaningful operation phase (a research report, once delivered, may not require operational management), but the lifecycle accounts for it structurally so that the transition from delivery to ongoing stewardship is explicit rather than accidental.

### Reflection

Reflection captures what happened and why. Learnings from execution — what worked, what failed, what assumptions proved wrong — are structured and preserved so they can inform future elaboration. This is the feed-forward loop: reflection output becomes elaboration input for the next initiative.

The cycle is continuous. Reflection does not merely close an initiative; it seeds the next one. This is the structural defense against the "no learning loop" failure mode — learnings are artifacts, not memories.

---

## 3. Studios: Domain Templates

The four-phase lifecycle is universal, but *how* each phase manifests depends on the domain. A security audit and a content creation project both elaborate, execute, operate, and reflect — but their stages, roles, quality standards, and delivery mechanisms differ fundamentally.

**Studios** are named lifecycle templates that map the four phases to domain-specific implementations. A studio defines three things: the ordered sequence of *stages* the work passes through, the *persistence mechanism* used to track and version artifacts, and the *delivery mechanism* used to ship completed work.

### Built-in Studios

H·AI·K·U ships with fifteen studios organized into three categories — engineering, go-to-market, and general purpose — covering work from application development through sales cycles to content creation. The engineering category has four product-family studios (`appdev`, `libdev`, `gamedev`, `hwdev`) because the lifecycles differ at the stage level, not just the hat level: a library has no product or design phase, a game needs a prototype-validation gate and a dedicated polish stage, and hardware has requirements-driven compliance and a one-shot manufacturing gate.

Every studio has three kinds of identifier — a canonical `name` (shown in browse views), a short `slug` (for CLI input), and optional `aliases` (for backward compatibility after renames). The loader resolves any of them to the same studio.

#### Engineering Studios

**Application Development** (`appdev`, aliased from `software`) is the default for user-facing application work — web, mobile, desktop, and services. Full development lifecycle from problem understanding through security review.

| Property | Value |
|---|---|
| Stages | inception → product → design → development → security → operations |
| Persistence | git (branches, worktrees) |
| Delivery | pull request |

**Library Development** (`libdev`) covers libraries, SDKs, and CLI tools. Differs from application development: no product or design phases — inception directly covers discovery AND API surface, and release publishes rather than deploys.

| Property | Value |
|---|---|
| Stages | inception → development → security → release |
| Persistence | git |
| Delivery | registry publish |

**Game Development** (`gamedev`) covers games. Concept absorbs discovery, prototype is a gated fun-validation stage before production commits resources, and polish is its own dedicated stage because game feel needs iteration time application work does not.

| Property | Value |
|---|---|
| Stages | concept → prototype → production → polish → release |
| Persistence | git |
| Delivery | storefront submission (platform cert) |

**Hardware Development** (`hwdev`) covers hardware products — electronics, firmware, manufacturing. Unlike software, hardware has physical constraints, safety regulations, and a one-shot manufacturing gate. Requirements captures compliance upfront because it cannot be retrofitted.

| Property | Value |
|---|---|
| Stages | inception → requirements → design → firmware → validation → manufacturing |
| Persistence | git |
| Delivery | manufacturing ramp |

**Data Pipeline** covers ETL pipelines, data warehouses, and analytics workflows.

| Property | Value |
|---|---|
| Stages | discovery → extraction → transformation → validation → deployment |
| Persistence | git |
| Delivery | pull request |

**Migration** handles system and data migrations — platform transitions, version upgrades, and data moves.

| Property | Value |
|---|---|
| Stages | assessment → mapping → migrate → validation → cutover |
| Persistence | git |
| Delivery | pull request |

**Incident Response** is optimized for fast response with structured follow-through.

| Property | Value |
|---|---|
| Stages | triage → investigate → mitigate → resolve → postmortem |
| Persistence | git |
| Delivery | pull request |

**Compliance** covers regulatory audits, certifications (SOC2, HIPAA, GDPR, ISO 27001), and policy management.

| Property | Value |
|---|---|
| Stages | scope → assess → remediate → document → certify |
| Persistence | git |
| Delivery | pull request |

**Security Assessment** provides a structured offensive security lifecycle for penetration testing and vulnerability analysis.

| Property | Value |
|---|---|
| Stages | reconnaissance → enumeration → exploitation → post-exploitation → reporting |
| Persistence | git |
| Delivery | pull request |

#### Go-to-Market Studios

**Sales** manages deals from prospect research through close and handoff.

| Property | Value |
|---|---|
| Stages | research → qualification → proposal → negotiation → close |
| Persistence | filesystem |
| Delivery | local |

**Marketing** covers campaign and content marketing from audience research through launch and measurement.

| Property | Value |
|---|---|
| Stages | research → strategy → content → launch → measure |
| Persistence | filesystem |
| Delivery | local |

**Customer Success** manages the customer lifecycle from onboarding through renewal.

| Property | Value |
|---|---|
| Stages | onboarding → adoption → health-check → expansion → renewal |
| Persistence | filesystem |
| Delivery | local |

**Product Strategy** defines what to build and why — from discovery through stakeholder alignment.

| Property | Value |
|---|---|
| Stages | discovery → user-research → prioritization → roadmap → stakeholder-review |
| Persistence | filesystem |
| Delivery | local |

#### General Purpose Studios

**Ideation** is the default for creative, analytical, or exploratory work that does not fit a specialized domain.

| Property | Value |
|---|---|
| Stages | research → create → review → deliver |
| Persistence | filesystem (local snapshots) |
| Delivery | local |

**Documentation** covers technical documentation — API docs, guides, runbooks, and knowledge bases.

| Property | Value |
|---|---|
| Stages | audit → outline → draft → review → publish |
| Persistence | git |
| Delivery | pull request |

Each studio defines its own behavioral roles. The application-development studio's inception stage uses a researcher and elaborator; its development stage uses a planner, builder, and reviewer; its security stage uses a threat modeler, red team, blue team, and security reviewer. The library-development studio's inception folds in an api-architect because the API surface is the product. The game-development studio's prototype stage uses a prototype-engineer, game-designer, and playtester because prototype validation is gated on external player feedback. Despite these differences, all fifteen studios run on the same orchestration machinery.

### Custom Studios

Teams can define custom studios by creating a `STUDIO.md` file with stage definitions. The framework provides the orchestration machinery; the studio provides the domain knowledge. Studios are resolved with project-level override: a `.haiku/studios/{name}/STUDIO.md` in the project directory takes precedence over the built-in definition, allowing teams to customize stage sequences, hat roles, and review gates for their specific needs without forking the framework.

This is the structural answer to the "no domain awareness" failure mode. Security teams are not forced into development sprints. Marketing teams are not forced through code review gates. Each domain defines its own stages, its own behavioral roles, and its own quality checkpoints — while the four-phase lifecycle and the enforcement machinery remain universal.

---

## 4. Stages: The Implementation Layer

A studio's lifecycle is a sequence of stages. Each stage is a self-contained execution environment with its own behavioral roles, quality standards, and a review gate that controls advancement. The application-development studio declares six stages — inception, product, design, development, security, operations — while the library-development studio declares four (inception, development, security, release) because libraries have no product or design phase, and the ideation studio declares just four: research, create, review, deliver. Stages execute sequentially within a studio; each must complete before the next begins.

### What a Stage Defines

A stage declares five things:

1. **Hats** — the ordered sequence of behavioral roles the agent assumes during execution. Each hat is a distinct persona with a defined focus, expected output, required inputs, and explicit anti-patterns. Role separation is structural, not advisory: the builder and reviewer are different hats with different instructions and no shared context.

2. **Review agents** — specialized adversarial agents that run during the stage's review phase. Each review agent is defined as a file within the stage's `review-agents/` directory, with a mandate and checklist scoped to the stage's domain. A development stage might define correctness, security, performance, architecture, and test-quality agents. A compliance stage might define thoroughness and accuracy agents. Stages can also *include* review agents from other stages via `review-agents-include`, enabling cross-stage verification — for example, the development stage can include the design stage's consistency and accessibility agents to verify that the implementation respects the design intent.

3. **Review gate** — the checkpoint that must be satisfied before advancing. Four gate types exist: *auto* (the framework advances when quality gates pass), *ask* (the framework pauses for human approval), *external* (the framework blocks until an external review — such as a pull request approval — resolves), and *await* (the framework blocks until an external event occurs — such as a customer response, a CI pipeline result, or a stakeholder decision — that is outside the agent's control). Gates may vary by operating context: a stage can require external review under normal operation while allowing human-approval-only during autonomous runs. Gates can also declare a *gate protocol* with timeout duration, timeout action (escalate, auto-advance, or block), and pre-conditions that must be true before the gate can pass.

4. **Inputs** — explicit dependencies on outputs from earlier stages. A development stage, for instance, declares that it requires the discovery document from inception, the design brief from design, and the behavioral spec from product. This creates a verifiable pipeline: each stage's preconditions are guaranteed by the stages that preceded it.

5. **Output definitions** — the artifacts the stage produces, each with a declared scope that determines how long they persist and who can access them.

### The Stage Loop

Each stage executes through a fixed four-step loop:

1. **Elaborate** — Resolve inputs from prior stages, checking freshness metadata for staleness. If the stage has no units yet, decompose the work into discrete units with completion criteria and a dependency graph. If an upstream output has a small gap (e.g., a missing screen in a design brief), the agent can run a *stage-scoped refinement* — a targeted side-trip that adds a single unit to the upstream stage, executes it through that stage's hats, and persists the updated output, all without resetting the current stage's progress. Full stage-backs (resetting `active_stage` to a prior stage) are always human-initiated.
2. **Execute** — For each unit in dependency order, run the bolt loop: cycle through the hat sequence. Each hat runs in isolation, produces output for the next hat, and quality gates verify the result.
3. **Adversarial review** — Spawn the stage's review agents in parallel. Each agent evaluates the stage's work against its specific mandate (correctness, security, accessibility, etc.). Agents from other stages included via `review-agents-include` run alongside the stage's own agents. High-severity findings trigger targeted fixes before the stage can proceed.
4. **Gate** — Evaluate the review gate and either advance, pause for approval, block for external review, or await an external event.

Persistence is not a separate step — artifacts are committed to git automatically as they are produced during elaboration and execution. Each MCP state transition (stage start, unit completion, etc.) auto-commits to the persistence layer.

This loop is enforced by the framework harness. Agents operate within it but cannot alter it. The human's control is expressed through review gates and mode selection, not through micro-management of the loop itself.

### Hat Isolation

Each hat executes in a fresh context. The planner's reasoning does not leak into the builder. The builder's assumptions do not influence the reviewer. This isolation is adversarial by design: the reviewer evaluates work without inheriting the builder's mental model of why it should be correct.

Hats are customizable at two levels. A team can *override* a hat entirely, replacing the default behavior for their domain. Or a team can *augment* a hat, appending project-specific constraints (house style, tooling conventions, domain rules) to the default instructions without replacing them. The distinction matters: override is for fundamental divergence; augmentation is for additive context.

### Output Scoping

Stages produce artifacts at four scopes:

- **Project** — persists across intents. An architecture document, for instance, accumulates decisions from every feature. A project-scoped output from one intent is available to stages in future intents.
- **Intent** — scoped to a single initiative. A discovery document captures the problem space for one feature and feeds downstream stages within that feature.
- **Stage** — working context that lives and dies with the stage. Intermediate artifacts that no downstream stage needs.
- **Repository** — written directly to the project source tree. Code, configuration, and other deliverables that belong in the codebase itself.

Stages declare what they consume and produce, creating typed contracts across the lifecycle. A stage author defines the scope; the framework handles placement and resolution.

---

## 5. Units and Bolts: The Work

### Units

A **unit** is a discrete piece of work with explicit dependencies and verifiable completion criteria. Units are the atomic work items within a stage — each one small enough to complete in a single iteration cycle, specific enough to verify mechanically where possible.

Units within a stage form a **directed acyclic graph**. Dependencies are explicit: a unit cannot begin until all its predecessors have completed. This creates a natural execution order — a wavefront of ready work that advances as units complete.

Unit types vary by stage. A development stage accepts backend, frontend, and fullstack units. A security stage accepts security and backend units. Type constraints ensure that units match their stage's competence.

### Completion Criteria

Completion criteria are the primary quality mechanism. They serve two audiences: the building agent (which works toward satisfying them) and the reviewing agent (which verifies they are actually met).

Good criteria are specific and verifiable:

- "All API endpoints return correct status codes for success (200/201), validation errors (400), auth failures (401/403), and not-found (404)"
- "Test coverage is at least 80% for new code, with unit tests for business logic and integration tests for API boundaries"
- "Research brief covers at least 3 competing approaches with pros/cons for each"

Bad criteria are vague and subjective:

- "API works correctly"
- "Tests are written"
- "Research is thorough"

The distinction matters because criteria that can be checked by running a command (test suites, linters, type checkers) become **quality gates** — automated checks that run when the agent attempts to finish. Criteria that require judgment (argument quality, design coherence) are verified through adversarial review by subsequent hats.

### Backpressure

Quality gates create **backpressure**: the framework pushes back against premature completion. When the building agent signals that it is done, the harness intercepts and runs verification. If gates fail, the agent cannot stop — it must address the failure.

This is a critical design choice. Quality enforcement is structural, not behavioral. The agent does not choose to run tests; the harness runs them automatically. The agent cannot override, weaken, or skip a gate. An agent that writes code failing its tests cannot declare the unit done. It must either fix the failure or, after exhausting repair strategies, escalate by documenting a blocker for human intervention.

The repair escalation is itself structured: retry the operation (for transient failures), decompose into smaller subtasks, try an alternative approach, or escalate to a human. This sequence is fixed — agents cannot skip levels, ensuring that persistently failing work surfaces to a human rather than cycling indefinitely.

### Bolts

A **bolt** is one complete cycle through the stage's hat sequence for a single unit. If completion criteria are not met after a bolt, another bolt runs — the iteration counter increments and the hat sequence repeats from the beginning.

The hat sequence varies by stage, reflecting the domain's natural workflow:

- **development:** planner → builder → reviewer
- **research:** researcher → analyst
- **security:** threat-modeler → red-team → blue-team → security-reviewer
- **create:** creator → editor

Each hat in the sequence produces structured output that flows to the next. The planner produces a tactical plan; the builder consumes it. The builder produces code; the reviewer evaluates it. The red team finds vulnerabilities; the blue team remediates them.

Bolts are the mechanism by which work converges on quality. Bolt 1 is the initial attempt. Bolt 2 incorporates review findings. Each subsequent bolt narrows the gap between current state and completion criteria. There is no hard limit on bolt count, but the escalation pattern ensures convergence or human intervention.

---

## 6. Persistence

H·AI·K·U separates work progression from work storage. The stages, units, and bolts described above define *how work advances*. The persistence layer defines *how work is recorded* — and the two are independent.

### The Abstraction

The orchestration loop calls a uniform persistence interface: create a workspace, save work, request a review, deliver the result, clean up afterward. The implementation behind this interface varies by studio.

This separation is deliberate. The same four-step stage loop that drives software development through git branches and pull requests also drives content creation through local filesystem snapshots. The orchestration code is identical; only the storage backend differs.

### Adapters

Two persistence backends ship with H·AI·K·U:

**Git persistence** (used by the application-development studio and most engineering studios) maps the lifecycle onto git's collaboration model. Each intent gets its own branch and isolated worktree. Saves are commits. Delivery is a single pull request per intent targeting the mainline. Units are internal iterations within the intent branch — they do not produce separate PRs.

**Filesystem persistence** (used by the ideation studio) provides versioned storage without version control infrastructure. Saves create timestamped snapshots. Reviews produce local review documents. Delivery moves the workspace to a delivered state. There is no remote to synchronize with — the work is local by design.

### Why This Matters

The persistence abstraction is what makes studios truly domain-independent. A studio author chooses the storage model appropriate to their domain — git for collaborative code, local files for creative work, a cloud service for distributed teams — and the orchestration machinery adapts without modification. Adding a new persistence backend requires implementing the interface contract; it does not require changing any stage, hat, or orchestration logic.

---

## 7. Modes of Operation

H·AI·K·U supports two execution modes, selected at intent creation.

### Continuous Mode

Continuous mode runs each stage in sequence, advancing automatically when review gates allow. Every stage runs its own full cycle — elaborate, execute, adversarial review, gate — with its own hats, review agents, inputs, and outputs. When a review gate passes (`auto`), the framework advances to the next stage without human intervention. When a gate requires approval (`ask`) or external review (`external`), the framework pauses at that gate, then continues through remaining stages once resolved.

This is the default. It suits initiatives where the human trusts the review gates to enforce quality at each stage boundary.

### Discrete Mode

Discrete mode runs the same stage loop but always stops after each stage completes, regardless of the review gate setting. The human explicitly advances through stages by invoking the next run.

This suits larger initiatives, cross-team work, and situations where each stage needs explicit human review before the next begins — for example, when a product stage's outputs must be approved by a different stakeholder than the development stage's outputs.

### Planning Levels

Both modes share three planning levels:

1. **Intent planning** — Always collaborative. Human and AI define what will be built and why.
2. **Unit planning** — Always collaborative. Human and AI define success criteria per unit during the plan phase.
3. **Bolt planning** — AI-driven. The planner hat decides the tactical implementation approach for each iteration cycle.

The first two levels are collaborative because they define scope and success criteria — decisions that require human judgment. The third is AI-driven because it concerns implementation tactics within already-agreed boundaries.

---

## 8. The Reference Implementation

The concepts described above are implemented as a Claude Code plugin with two user-facing commands and a hook system that enforces the methodology's structural constraints.

### Two Commands

**`/haiku:start`** creates an intent — gathering a description, detecting the appropriate studio, selecting continuous or discrete mode, and setting up the workspace and persistence backend.

**`/haiku:pickup`** advances the intent through its next stage — resolving the current state, loading the stage definition, and executing the five-phase stage loop.

### Enforcement Through Hooks

The plugin's most consequential design decision is that quality enforcement is structural, not behavioral. Rather than instructing the agent to "run tests before finishing," the plugin intercepts the agent's attempt to stop and runs tests automatically. The agent cannot choose to skip this step.

This principle — enforcement through hooks rather than instructions — applies throughout:

- **Quality gates** intercept stop signals and block premature completion when verification fails.
- **Iteration enforcement** checks the unit DAG when a session ends: if work remains, the agent is redirected to continue; if all units are complete, the intent is reconciled.
- **Context injection** reconstructs the full execution state on every session start — which intent is active, which stage is current, which hat should execute, what the unit status is — defeating context evaporation without relying on conversation history.
- **Context budgeting** monitors token usage and warns at critical thresholds, preventing context exhaustion mid-task.
- **Workflow guards** warn when code is edited outside the methodology's hat structure, catching accidental work outside the quality enforcement boundary.

### Configuration

Projects configure H·AI·K·U through a settings file that controls quality gate commands (test, lint, typecheck, build), provider integrations, unit elaboration granularity, and per-hat model selection. Review agents are defined per-stage within studio definitions, not as global configuration — each stage prescribes the adversarial perspectives relevant to its domain.

Providers are bidirectional translation layers, not simple API connectors. Six provider categories exist: ticketing (Jira, Linear, GitHub Issues), spec (Notion, Confluence, Google Docs), design (Figma, Canva, Pencil), comms (Slack, Teams, Discord), CRM (Salesforce, HubSpot), and knowledge (wiki platforms for cross-studio context sharing). Each provider has inbound instructions (how to read provider data and distill it into H·AI·K·U artifacts), outbound instructions (how to translate H·AI·K·U state into the provider's format), and sync behavior (how to discover events and maintain consistency).

The translation is mediated by the AI agent, not by rigid schema mapping. A CRM deal record does not contain H·AI·K·U frontmatter — the agent reads the CRM's native fields and produces H·AI·K·U artifacts. A reflection summary does not get pushed as markdown — the agent translates it into whatever format the knowledge provider's audience expects. This semantic translation is what makes providers work across domains where the external tool's data model bears no resemblance to H·AI·K·U's internal representation.

Providers also serve as the coordination layer for cross-studio work. Because H·AI·K·U is a local CLI tool — not a server — it cannot maintain always-on triggers or shared state. Instead, the provider is the durable layer: a CRM deal closing is visible to any session that polls the CRM. A knowledge article written by the sales studio is readable by the customer success studio via the knowledge provider. Cross-studio data flows through providers, not through shared filesystems.

Configuration follows a three-level precedence: intent-level overrides take priority over project-level settings, which take priority over built-in defaults.

---

## 9. Beyond Software

H·AI·K·U's universal core — the four-phase lifecycle, the stage loop, hat-based role separation, and quality enforcement — is domain-agnostic. Studios map this core to specific domains.

### Fifteen Studios in Practice

The plugin ships with fifteen studios across three categories that demonstrate the framework's range.

The **engineering studios** fall into two groups. The product-family studios (`appdev`, `libdev`, `gamedev`, `hwdev`) cover distinct product types where the lifecycle itself differs — application development has product and design phases, library development does not (inception folds in the API surface), game development has a prototype-validation gate and a dedicated polish stage, and hardware development has compliance-driven requirements and a one-shot manufacturing gate. The domain-engineering studios (`data-pipeline`, `migration`, `incident-response`, `compliance`, `security-assessment`) cover specialized engineering work. All use git persistence with pull-request delivery (except hardware, which delivers into manufacturing). Quality gates run test suites, linters, type checkers, and build commands where applicable.

The **go-to-market studios** (sales, marketing, customer-success, product-strategy) use filesystem persistence with local delivery. Their stages reflect business workflows — the sales studio moves from research through close; the customer-success studio moves from onboarding through renewal. Quality enforcement relies on adversarial review rather than machine-verifiable gates.

The **general-purpose studios** (ideation, documentation) serve creative, analytical, and documentation work. The ideation studio uses filesystem persistence; the documentation studio uses git persistence with pull-request delivery.

All fifteen studios run on the same orchestration machinery. The same stage loop function drives inception in the application-development studio, concept in the game-development studio, triage in the incident-response studio, and research in the ideation studio. The same gate resolution function handles every domain. The same context injection hook loads context for any studio's hats.

### What Changes Across Domains

- **Stage names and sequences.** Software needs inception before development; ideation needs research before creation. The ordering reflects domain-specific dependencies.
- **Hat roles and behavioral instructions.** A software researcher and a research analyst have entirely different focus areas, anti-patterns, and output expectations — but both are markdown files resolved by the same hat-loading machinery.
- **Persistence type.** Software work benefits from git branching and pull requests. Creative work may only need local files.
- **Output definitions and scopes.** A software stage might produce code scoped to the repository. An ideation stage might produce a research brief scoped to the intent's knowledge directory.
- **Review gate strictness.** Security stages may require external review. Creative stages may use auto-advance.
- **Quality gate commands.** Software gates run `npm test` or `cargo check`. Other domains may have no machine-verifiable gates, relying entirely on adversarial review.

### What Stays the Same

- The four-phase cycle (elaboration → execution → operation → reflection).
- The stage loop (elaborate → execute → adversarial review → gate).
- Hat-based role separation with fresh agent context per hat.
- Completion criteria as the primary progress measure.
- Input/output contracts between stages.
- DAG-based unit ordering within stages.
- The hook system for backpressure and context injection.

### Creating a Custom Studio

A new domain requires no changes to the orchestration code:

1. Create `STUDIO.md` with the stage list and persistence configuration.
2. Create `STAGE.md` for each stage, defining hats, review gate type, input sources, unit type constraints, and `review-agents-include` for cross-stage verification.
3. Create `hats/{hat}.md` for each hat within each stage, specifying focus, output expectations, input references, and anti-patterns.
4. Create `review-agents/{agent}.md` for each adversarial review agent within each stage, specifying the agent's mandate and verification checklist.
5. Optionally create `outputs/{output}.md` for each stage output, defining scope, format, and content guidance.
6. Place the studio in `.haiku/studios/{name}/` for project-specific use, or contribute it to the plugin for general availability.

---

## 10. Conclusion

H·AI·K·U replaces ad-hoc AI prompting with disciplined lifecycle management. The framework's contribution is the separation of what is universal from what is domain-specific.

The universal layer provides: a four-phase lifecycle that maps to any initiative; a stage loop that enforces quality through hat-based role separation and adversarial review; backpressure mechanisms that constrain the AI through hooks rather than relying on agent compliance; and persistence abstractions that decouple work storage from orchestration logic.

The domain-specific layer provides: studios that define stage sequences appropriate to the domain; hats that carry behavioral instructions tuned to specific roles; quality gates that run domain-appropriate verification; and output definitions that scope deliverables correctly.

The plugin implementation demonstrates that this separation works in practice. The same orchestration machinery drives fifteen studios — from a six-stage application-development lifecycle with git persistence and pull-request delivery, to a four-stage library-development lifecycle that publishes to package registries, to a five-stage game-development lifecycle with a prototype-validation gate, to a six-stage hardware-development lifecycle with compliance-driven requirements and a one-shot manufacturing gate, to a five-stage sales cycle with filesystem persistence, to a five-stage security assessment with git-backed reporting. Adding a new domain requires defining stages and hats, not modifying orchestration code.

The framework is intentionally extensible through studios rather than through core modifications. The orchestration layer is stable; the studio layer is where domain expertise accumulates.

---

## Glossary

| Term | Definition |
|---|---|
| **Backpressure** | Quality enforcement via hooks that block the agent from proceeding until standards are met, rather than relying on agent compliance. |
| **Bolt** | One cycle through a stage's hat sequence for a unit. If completion criteria are not met, another bolt runs. Tracked as `iteration` in state. |
| **Completion Criteria** | Verifiable conditions that define when a unit is done. Expressed as checkboxes in unit markdown. Quality gates enforce machine-verifiable criteria; adversarial review enforces the rest. |
| **DAG** | Directed acyclic graph ordering units within a stage by their dependencies. |
| **Hat** | A behavioral role scoped to a stage. Each hat runs in a fresh agent context with instructions loaded from `stages/{stage}/hats/{hat}.md`. |
| **Intent** | The top-level initiative being pursued. Contains units organized by stages. Stored at `.haiku/intents/{slug}/intent.md`. |
| **Persistence Adapter** | Backend that handles how work is stored and delivered. Implementations: git (branches, commits, pull requests) and filesystem (local directories). |
| **Quality Gate** | A machine-verifiable check (test, lint, typecheck, build) enforced by the Stop hook. Blocks the agent from stopping until gates pass. |
| **Review Agent** | A specialized adversarial agent that evaluates stage output against a specific mandate (e.g., correctness, security, accessibility). Defined per-stage in `review-agents/{name}.md`. Stages can include review agents from other stages via `review-agents-include`. |
| **Review Gate** | A checkpoint between stages. Types: `auto` (proceed), `ask` (require human approval), `external` (require external review), `await` (block until an external event occurs). |
| **Stage** | A lifecycle phase within a studio. Contains hat definitions, review gate, input/output contracts, and unit type constraints. |
| **Studio** | A named lifecycle template mapping the four-phase model to domain-specific stages. Defines stage order, persistence type, and delivery mechanism. |
| **Unit** | A discrete piece of work within an intent, scoped to a single stage. Has verifiable completion criteria and dependency relationships forming a DAG. |

---

## References

1. **Google DORA Team.** *Accelerate State of DevOps Report 2025: The State of AI-Assisted Software Development.* Google, 2025. https://dora.dev/research/2025/dora-report/

2. **Veracode.** *2025 GenAI Code Security Report.* Veracode, 2025. https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/

3. **Anthropic.** *Measuring AI Agent Autonomy in Practice.* Anthropic Research, 2026. https://www.anthropic.com/research/measuring-agent-autonomy

4. **Red Hat.** *The Uncomfortable Truth About Vibe Coding.* Red Hat Developer, February 2026. https://developers.redhat.com/articles/2026/02/17/uncomfortable-truth-about-vibe-coding

5. **Anthropic.** *Model Context Protocol Specification.* 2025. https://modelcontextprotocol.io/specification/2025-11-25

6. **Google.** *A2A: A New Era of Agent Interoperability.* Google Developers Blog, April 2025. https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/

7. **paddo.dev.** *The 19-Agent Trap.* January 2026.

8. **Anthropic.** *Effective Context Engineering for AI Agents.* Anthropic Engineering Blog, 2025. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

9. **Geoffrey Huntley.** *Ralph Wiggum Software Development Technique.* 2025. https://ghuntley.com/ralph/

10. **Steve Wilson.** *Human-on-the-Loop: The New AI Control Model That Actually Works.* The New Stack, August 2025.

11. **GitHub.** *Spec-Driven Development with AI: Get Started with a New Open-Source Toolkit.* GitHub Blog, September 2025. https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/

12. **European Parliament.** *Regulation (EU) 2024/1689 — The AI Act.* Official Journal of the European Union, 2024.

13. **NIST.** *AI Risk Management Framework (AI RMF 1.0).* National Institute of Standards and Technology, 2023. https://www.nist.gov/itl/ai-risk-management-framework

14. **OWASP.** *Top 10 for Agentic Applications 2026.* OWASP GenAI, December 2025. https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/

15. **HumanLayer.** *12 Factor Agents.* 2025.

16. **Raja SP.** *AI-Driven Development Lifecycle (AI-DLC) Method Definition.* Amazon Web Services, July 2025. https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/

17. **Anthropic.** *2026 Agentic Coding Trends Report.* Anthropic, 2026. https://resources.anthropic.com/2026-agentic-coding-trends-report

---

*H·AI·K·U is an open methodology maintained by GigSmart. Contributions and adaptations are welcome.*
