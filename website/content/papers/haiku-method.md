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

H·AI·K·U ships with two-dozen-plus studios organized into three categories — engineering, go-to-market, and general purpose — covering work from application development through sales cycles to content creation, plus operational and back-office studios (HR, finance, legal, project management, vendor management, etc.). The catalog grows over time; the framework is structurally agnostic to studio count. The engineering category has four product-family studios (`appdev`, `libdev`, `gamedev`, `hwdev`) because the lifecycles differ at the stage level, not just the hat level: a library has no product or design phase, a game needs a prototype-validation gate and a dedicated polish stage, and hardware has requirements-driven compliance and a one-shot manufacturing gate.

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

**Hardware Development** (`hwdev`) covers hardware products — electronics, firmware, manufacturing. Unlike software, hardware has physical constraints, safety regulations, and a one-shot manufacturing gate. Requirements captures compliance upfront because it cannot be retrofitted. The design stage uses [tscircuit](https://tscircuit.com) as the EDA platform, so schematics and PCB layouts are authored as TypeScript/React code and reviewable in a pull request rather than locked inside a proprietary EDA binary.

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

Each studio defines its own behavioral roles. The application-development studio's inception stage uses a researcher and distiller; its development stage uses a planner, builder, and reviewer; its security stage uses a threat modeler, red team, blue team, and security reviewer. The library-development studio's inception folds in an api-architect because the API surface is the product. The game-development studio's prototype stage uses a prototype-engineer, game-designer, and playtester because prototype validation is gated on external player feedback. Despite these differences, every shipped studio runs on the same orchestration machinery.

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

3. **Review gate** — the checkpoint that must be satisfied before advancing. Four gate types exist, distinguished by *who decides* and *how the signal arrives*:

   - **auto** — the framework advances automatically when quality gates (tests, lint, typecheck) pass. No human or external approval is required; the harness is the sole arbiter.
   - **ask** — the framework opens a local review UI on the human's machine and blocks until the human approves or requests changes. The signal is immediate: the MCP response from the review UI tells the orchestrator whether to advance or loop back. This is the simplest interactive gate — everything happens locally.
   - **external** — the framework blocks until an *external review system* grants approval. The typical flow: the agent creates a pull request (or merge request, or sends work to another review channel), records the URL, and the stage enters a "blocked" state. Signal detection is two-tiered: the primary signal is branch merge detection — the orchestrator checks whether the stage branch (`haiku/{slug}/{stage}`) was merged back into the intent main branch (`haiku/{slug}/main`) using `git merge-base --is-ancestor` locally, falling back to checking for merged PRs via `gh`/`glab` (which handles squash merges). As a secondary signal, if a review URL was recorded, the orchestrator probes PR/MR approval status via CLI tools (`gh` checks `reviewDecision === "APPROVED"` or `state === "MERGED"`; `glab` checks `approved === true` or `state === "merged"`). The human cannot simply pick up and continue past an external gate by approving locally; doing so would defeat the purpose of requiring a third-party review. The gate remains blocked until the external system's signal is detected through either tier. In non-git environments (filesystem mode), external gates fall back to `ask` — there is no structural signal to enforce external review, so the framework degrades gracefully to local human approval rather than blocking indefinitely.
   - **await** — the framework blocks until an external *event* occurs that is entirely outside the review process. Unlike `external`, there is no review artifact to check — `await` represents situations where the ball is in someone else's court entirely: a customer needs to respond, a contract needs a countersignature, a hardware prototype needs to arrive, a third-party pipeline needs to finish. The orchestrator treats `await` like `external` mechanically (blocked state, signal detection on pickup using branch merge detection and URL-based CLI probing), but the semantic intent is different: `external` means "someone must review this work"; `await` means "something must happen in the world." For `await` gates where the expected resolution is a comms signal (e.g., a reply in a Slack thread), the user confirms via `/haiku:pickup` after the event occurs.

   Stages can specify **compound gates** as a list (e.g., `[external, ask]`). A compound gate presents *all* listed options to the human simultaneously. For `[external, ask]`, the review UI shows both an "Approve" button and a "Submit for External Review" button. This lets the human *choose* to bypass the external review process and approve locally — useful when the human decides, after seeing the work, that external review is unnecessary for this particular stage completion. Without the `ask` component, only the external submission path is available. The order in the list is semantic (primary intent first) but does not restrict which button the human clicks.

   Gates can also declare a *gate protocol* with timeout duration, timeout action (escalate, auto-advance, or block), and pre-conditions that must be true before the gate can pass.

4. **Inputs** — explicit dependencies on outputs from earlier stages. A development stage, for instance, declares that it requires the discovery document from inception, the design brief from design, and the behavioral spec from product. This creates a verifiable pipeline: each stage's preconditions are guaranteed by the stages that preceded it.

5. **Output definitions** — the artifacts the stage produces, each with a declared scope that determines how long they persist and who can access them.

### Pre-Stage Selection Chain

Before any stage runs, the framework drives a four-step elicitation chain that captures the orientation choices the agent must not be allowed to dictate:

1. **Studio selection** — the human picks which studio's lifecycle the intent will follow. The framework presents available studios via a structured picker.
2. **Mode selection** — the human picks the execution mode (continuous, discrete, discrete-hybrid, autopilot, or quick). Mode is engine-managed: the agent never writes `mode` directly to intent metadata, and any attempt to do so is rejected.
3. **Stage selection (quick mode only)** — for `quick` mode, the human picks the single stage the intent will run. Other modes inherit the studio's full stage list automatically.
4. **Intent review gate** — once studio + mode + (for quick) stage are set, the framework opens an `ask`-type review gate showing the minimal intent for human approval before any stage begins. Approval clears the gate and lets the workflow enter stage 0; requesting changes returns the intent to the elicitation chain.

This chain is structurally load-bearing. The failure mode it prevents: an agent inferring "the user said discrete inception" and dictating both `mode: discrete` + `stages: [inception]` on intent creation, which collapses the workflow into a single amputated stage with no recovery path. By making the orientation choices flow through engine elicitation, the framework guarantees the human picked them — not the agent.

Mode transitions mid-flight (continuous ↔ discrete ↔ discrete-hybrid ↔ autopilot) are allowed through a dedicated mode-change command; transitions into or out of `quick` are forbidden once a stage has started, because `quick` is single-stage by definition and either direction would amputate or grow the workflow.

### The Stage Loop

Each stage moves through five conceptual phases. In the framework's reference implementation these aren't stored as a `phase:` field — the workflow cursor derives the current position from on-disk state (units present, hats progressed, reviews and approvals signed) on every tick. The result is the same disciplined progression, but with no in-memory state to corrupt and no separate state file to drift from reality.

1. **Elaborate** — Resolve inputs from prior stages, checking freshness metadata for staleness. If the stage has no units yet, decompose the work into discrete units with completion criteria and a dependency graph. If an upstream output has a small gap (e.g., a missing screen in a design brief), the agent can run a *stage-scoped refinement* — a targeted side-trip that adds a single unit to the upstream stage, executes it through that stage's hats, and persists the updated output, all without resetting the current stage's progress. Full stage-backs are always human-initiated.
2. **Execute** — For each unit, the cursor walks the hat sequence one role at a time. Wave-ready units (no `started_at`, all `depends_on` satisfied) dispatch in parallel as one batch; in-flight units block forward motion until they terminate. Each hat runs in isolation, produces output for the next hat, and quality gates verify the result. The terminal hat advance triggers a per-unit merge into the stage branch.
3. **Review** — Once every unit's hat sequence completes, the cursor walks the review-role list in declared order. The engine-built `spec` reviewer fires first on every stage to verify that the completed units collectively delivered exactly what the intent scoped — no scope creep, no missed criteria, no cross-unit drift. The prompt is engine-owned (no per-studio mandate file, no opt-out). After spec is signed, every studio-declared review agent (correctness, security, performance, architecture, test-quality, etc.) runs and signs `reviews.<role>` on each unit. Agents from other stages included via `review-agents-include` are equal members of this list. The `user` role caps the list when the gate type is `ask`. Findings filed by any reviewer trigger fixes before the loop can advance.
4. **Approve** — Once reviews are signed, the cursor walks the approval-role list. The engine-built `quality_gates` role runs each unit's declared shell commands and signs `approvals.quality_gates` on success; failure auto-rejects to the producing hat for repair. After quality_gates, configured approval agents fire, and the human's `user` approval lands last for `ask`-style gates. The list is mode-shaped: autopilot trims to `[spec, quality_gates]`; continuous and discrete keep the full list.
5. **Merge** — When every approval is signed, the engine merges the stage branch into intent main. In discrete mode this is the external review gate: the framework opens a pull request and waits for the merge-back as the approval signal. In continuous mode it's a fast-forward.

**Fix loop.** When any reviewer files a feedback finding, the stage dispatches its `fix_hats` sequence directly against the finding. The feedback file *is* the scope; no new unit specification is synthesized. Every hat in the sequence reads the feedback body and the flagged artifact, acts within its mandate, and the terminal `feedback-assessor` hat independently verifies closure. Each finding gets a bounded retry budget before the framework escalates. The model eliminates the prior "telephone game" of feedback → synthesized unit → execute by addressing findings directly on the artifacts that produced them.

Review agents can declare an `applies_to:` scope (a list of file globs). An agent whose declared scope matches no artifact the stage produces skips itself automatically — for example, a web accessibility agent does not run on a backend-only stage whose outputs are API specs and CLI docs. Agents without `applies_to:` always run (the backward-compatible default).

A stage's retry budget is tight by design: agent-invoked rejection cycles are capped at two iterations. Beyond that, the framework escalates to the human rather than burn another execute wave — repeated rejections indicate a spec problem the reviewers should have caught up front, and the correct response is to fix the plan, not to keep building against a broken plan. Human-invoked revisits are uncapped.

**Scope routing.** A review agent in stage X can identify that a finding's root cause lives in stage Y — for example, a design reviewer noticing that an inception assumption was wrong. The reviewer files the finding; classification falls to the first hat in the receiving stage's `fix_hats:` chain (a classifier hat) which calls `haiku_feedback_set_targets` to record which unit (if any) the finding targets and which approval roles to invalidate on closure. If the finding actually belongs in a different stage's directory, the classifier (or the agent on a triage tick) calls `haiku_feedback_move` to relocate it. After relocation, routing flows by file location: a finding sitting in `stages/<earlier>/feedback/` automatically rewinds the cursor to that stage's fix loop, regardless of where it was filed. The directory IS the classification.

**Intent-completion review.** Studios define `review-agents/` and `fix-hats/` at the studio level (not per-stage). After every stage merges into intent main, the cursor walks the intent-scope approval list — `spec`, `continuity`, optional studio-declared reviewers, then `user`. Studio-level reviewers audit the whole intent: cross-stage consistency, naming alignment, studio-wide standards. Findings run through a studio-level fix loop using the same FB-as-unit mechanics as the per-stage loop. This catches seams that per-stage reviewers miss by construction. Cross-stage findings at this layer are surfaced to the human; the intent-completion layer doesn't auto-rewind stages. Enabled by default on every intent; opt out per intent with `intent_completion_review: false`. The finding rate per intent is a measurement surface — a downward trend indicates upstream specs and stage-level reviews are getting sharper.

Stages declare `fix_hats:` as an ordered list of hat names — typically the classifier producer followed by a `feedback-assessor`. The producer fixes; the assessor independently verifies closure. Fix-mode hats may live outside the main `hats:` rotation (so a feedback-assessor hat can exist purely to validate fixes without interfering with the execute loop).

Persistence is not a separate step — artifacts are committed to git automatically as they are produced during elaboration and execution. The cursor's hat advances and stage merges all commit through the persistence layer.

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

Quality gates are declared as structured, executable entries in the unit's frontmatter — each with a `name`, a shell `command`, and optionally a working `dir`. The framework runs each gate at advance_hat time; a non-zero exit blocks the advance. Prose-only gate descriptions belong in the unit body, not in the frontmatter, because the framework cannot enforce prose. Critically, gate commands must scope to the *full stage artifact directory* (the rule domain), not only to the files the unit declares in its `inputs:` list (the unit's read scope). When enforcement scope is narrower than rule scope, regressions accumulate on files no single unit audited — a pattern the adversarial reviewer catches and the pre-execution review catches earlier still.

Per-hat opt-in tightens this further. A hat may declare `run_quality_gates: true` in its frontmatter; when it does, gates run on *that* hat's advance — not just the last hat's — and a failure auto-rejects to the same hat with the bolt counter incremented. The agent does not choose between fix-and-retry and reject_hat; the framework decides. This makes "this hat produces verifiable artifacts" part of the hat's definition of done. The bolt cap (5 per unit) bounds retries; exhaustion escalates to a human, not another bolt.

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

### Drift Detection

Work-in-progress surfaces are not always modified exclusively through the agent. A product owner may drop a revised requirements document into the stage's knowledge directory. A designer may replace a mockup file between bolts. Without explicit acknowledgment, the agent's next tick would silently assume those files are unchanged — producing an assessment based on stale inputs.

The **drift sweep** closes this gap. Every tick, before the cursor advances on its mainline track, the framework runs a content-hash sweep over every signed witness on the active stage:

- **Spec witnesses** — when a reviewer signs `reviews.<role>` on a unit, the engine records the body's SHA-256. The sweep recomputes and compares.
- **Output witnesses** — when an approval signs `approvals.<role>`, the engine records a `witnesses: { <path>: <sha256> }` map covering each declared output. The sweep recomputes per file.
- **Discovery witnesses** — when a discovery agent signs `discovery.<agent>`, the engine records hashes for both the discovery output and the studio's mandate file.
- **Intent-scope witnesses** — `approvals` on intent.md carry the same body hash treatment.

Any mismatch surfaces as a `drift_detected` action with one or more drift events listing the unit, role, file, and (in git mode) the commits that touched the path since signing. The agent files a feedback finding for each substantive event, which routes through the normal fix-loop. Once the FB is filed, the source ref is dedup'd so the same drift event doesn't re-emit on every tick until the FB closes.

The sweep is hash-based, not state.json-based. Hashes live in the witness records on each unit's frontmatter — there is no separate baseline manifest. This collapses an entire class of "the baseline drifted from the truth" bugs: the witness IS the baseline, and signing IS the act of recording it. Body-only hashing for markdown decouples agent-authored prose from engine FM bookkeeping (advance_hat appends to `iterations[]` without tripping spec drift on its own previously-signed reviews).

The sweep can be disabled project-wide by setting `drift_detection: false` in `.haiku/settings.yml`. This is a kill-switch — the gate becomes a complete no-op. Disabling is appropriate for projects where all surface changes are always agent-initiated.

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

H·AI·K·U supports five execution modes, selected at intent creation. Mode is engine-managed: the framework rejects any attempt by an agent to write `mode` directly to intent metadata, so the human's choice always flows through real elicitation.

### Continuous Mode

Continuous mode runs each stage in sequence, advancing automatically when review gates allow. Every stage runs its own full cycle — elaborate, execute, adversarial review, gate — with its own hats, review agents, inputs, and outputs. When a review gate passes (`auto`), the framework advances to the next stage without human intervention. When a gate requires approval (`ask`) or external review (`external`), the framework pauses at that gate, then continues through remaining stages once resolved.

This is the default. It suits initiatives where the human trusts the review gates to enforce quality at each stage boundary.

### Discrete Mode

Discrete mode runs the same stage loop but always stops after each stage completes, regardless of the review gate setting. The human explicitly advances through stages by invoking the next run. Each stage advancement is an external review gate — the framework opens a pull request, the merge-back is the approval signal — so each stage's outputs can be reviewed by the right stakeholder before the next begins.

This suits larger initiatives, cross-team work, and situations where each stage needs explicit human review before the next begins — for example, when a product stage's outputs must be approved by a different stakeholder than the development stage's outputs.

### Discrete-Hybrid Mode

Discrete-hybrid groups consecutive stages into review buckets — stages with similar gate semantics consolidate into a single external review while still running independently. Useful when the studio has many small stages that don't each warrant a separate review cycle but the team still wants explicit checkpoints at boundaries that matter.

### Autopilot Mode

Autopilot trims the review and approval surface to the engine-built witnesses only — `spec` review on each unit, `quality_gates` on each unit's outputs, and intent-scope `spec` + `continuity` at the end. No studio-declared review agents fire, no human gate interrupts the loop, and `merge_stage` auto-fires once `quality_gates` is signed. Suited to well-bounded work where the engine's invariants are sufficient and the human is willing to delegate the entire run.

### Quick Mode

Quick mode is single-stage by definition — the human picks one stage from the studio's list at intent creation, the framework runs only that stage, and there is no `advance_stage` step. Once `quick` is set, the mode cannot transition into or out of it (doing so would amputate or grow the workflow). Quick is ideal for small targeted tasks that map onto exactly one stage's competence.

### Planning Levels

All modes share three planning levels:

1. **Intent planning** — Always collaborative. Human and AI define what will be built and why.
2. **Unit planning** — Always collaborative. Human and AI define success criteria per unit during the plan phase.
3. **Bolt planning** — AI-driven. The planner hat decides the tactical implementation approach for each iteration cycle.

The first two levels are collaborative because they define scope and success criteria — decisions that require human judgment. The third is AI-driven because it concerns implementation tactics within already-agreed boundaries.

Collaboration is measured by **decisions**, not turns. Each collaborative stage maintains a `decision_log` of architectural choices: who picked, between what options, and why. A stage cannot advance until at least one decision is recorded — either user-resolved (the user picked between options the agent presented) or autonomous-acknowledged (the agent chose from clear conventions and surfaced the choice for veto-style approval, with the user accepting). When a stage has no architectural decisions in scope (purely conventional work following an established template), the agent honestly declares that and proceeds. This converts the metric from "frequency of engagement" to "moments where human knowledge actually shaped the plan" — operationalizing the *Knowledge Unification* in H·AI·K·U.

---

## 8. The Reference Implementation

The concepts described above are implemented as a Claude Code plugin with a small set of user-facing commands, a single workflow-driving MCP tool, and a hook system that enforces the methodology's structural constraints.

### Commands and the Workflow Tool

User-facing commands are intentionally thin — they're entry points, not logic. The workflow-driving primitive is one MCP tool, `haiku_run_next`, which the agent calls every time it needs the next instruction.

- **`/haiku:start`** creates an intent — gathering a description, detecting the appropriate studio, eliciting the mode, and setting up the workspace and persistence backend.
- **`/haiku:pickup`** resumes an active intent — calling `haiku_run_next` to derive the cursor position and surface the next action.
- **`/haiku:autopilot`** runs an intent end-to-end on autopilot — same workflow, trimmed review/approval surface, no human gates.
- **`/haiku:quick`** runs a single-stage intent for small targeted work.
- **`/haiku:revisit`**, **`/haiku:change-mode`**, **`/haiku:reflect`**, and a handful of operational commands (dashboard, capacity, archive, etc.) round out the surface.

The agent's contract is: receive an action from `haiku_run_next`, do what it says, call `haiku_run_next` again — unless the action is terminal. Forward motion has exactly one verb. The cursor model that drives those tick decisions is documented in `plugin/studios/ARCHITECTURE.md` §5.

### Enforcement Through Hooks

The plugin's most consequential design decision is that quality enforcement is structural, not behavioral. Rather than instructing the agent to "run tests before finishing," the plugin intercepts the agent's attempt to stop and runs tests automatically. The agent cannot choose to skip this step.

This principle — enforcement through hooks rather than instructions — applies throughout:

- **Quality gates** intercept stop signals and block premature completion when verification fails.
- **Iteration enforcement** checks the unit DAG when a session ends: if work remains, the agent is redirected to continue; if all units are complete, the intent is reconciled.
- **Context injection** reconstructs the full execution state on every session start — which intent is active, which stage is current, which hat should execute, what the unit status is — defeating context evaporation without relying on conversation history.
- **Context budgeting** monitors token usage and warns at critical thresholds, preventing context exhaustion mid-task.
- **Workflow-managed file boundary** blocks generic Read/Write/Edit on units, feedback files, and intent metadata at the PreToolUse hook. Agents must use the corresponding MCP tools (`haiku_unit_read`, `haiku_unit_write`, `haiku_feedback_read`, `haiku_feedback_write`, etc.), which validate frontmatter, enforce the forward-only lifecycle, and run the schema gates on every input. This makes "the agent edited the wrong file by hand" a structurally impossible outcome rather than a behavioral request.

### Configuration

Projects configure H·AI·K·U through a settings file that controls quality gate commands (test, lint, typecheck, build), provider integrations, unit elaboration granularity, and per-hat model selection. Review agents are defined per-stage within studio definitions, not as global configuration — each stage prescribes the adversarial perspectives relevant to its domain.

Providers are bidirectional translation layers, not simple API connectors. Six provider categories exist: ticketing (Jira, Linear, GitHub Issues), spec (Notion, Confluence, Google Docs), design (Figma, Canva, Pencil), comms (Slack, Teams, Discord), CRM (Salesforce, HubSpot), and knowledge (wiki platforms for cross-studio context sharing). Each provider has inbound instructions (how to read provider data and distill it into H·AI·K·U artifacts), outbound instructions (how to translate H·AI·K·U state into the provider's format), and sync behavior (how to discover events and maintain consistency).

The translation is mediated by the AI agent, not by rigid schema mapping. A CRM deal record does not contain H·AI·K·U frontmatter — the agent reads the CRM's native fields and produces H·AI·K·U artifacts. A reflection summary does not get pushed as markdown — the agent translates it into whatever format the knowledge provider's audience expects. This semantic translation is what makes providers work across domains where the external tool's data model bears no resemblance to H·AI·K·U's internal representation.

Providers also serve as the coordination layer for cross-studio work. Because H·AI·K·U is a local CLI tool — not a server — it cannot maintain always-on triggers or shared state. Instead, the provider is the durable layer: a CRM deal closing is visible to any session that polls the CRM. A knowledge article written by the sales studio is readable by the customer success studio via the knowledge provider. Cross-studio data flows through providers, not through shared filesystems.

Configuration follows a three-level precedence: intent-level overrides take priority over project-level settings, which take priority over built-in defaults.

---

## 9. Beyond Software

H·AI·K·U's universal core — the four-phase lifecycle, the stage loop, hat-based role separation, and quality enforcement — is domain-agnostic. Studios map this core to specific domains.

### Studios in Practice

The plugin ships studios across three broad categories that demonstrate the framework's range. The catalog is open-ended — new studios get added as new domains map onto the lifecycle.

The **engineering studios** fall into two groups. The product-family studios (`appdev`, `libdev`, `gamedev`, `hwdev`) cover distinct product types where the lifecycle itself differs — application development has product and design phases, library development does not (inception folds in the API surface), game development has a prototype-validation gate and a dedicated polish stage, and hardware development has compliance-driven requirements and a one-shot manufacturing gate. The domain-engineering studios (`data-pipeline`, `migration`, `incident-response`, `compliance`, `security-assessment`, `quality-assurance`) cover specialized engineering work. All use git persistence with pull-request delivery (except hardware, which delivers into manufacturing). Quality gates run test suites, linters, type checkers, and build commands where applicable.

The **go-to-market studios** (sales, marketing, customer-success, product-strategy, dev-evangelism) use filesystem persistence with local delivery. Their stages reflect business workflows — the sales studio moves from research through close; the customer-success studio moves from onboarding through renewal. Quality enforcement relies on adversarial review rather than machine-verifiable gates.

The **general-purpose and back-office studios** (ideation, documentation, training, hr, finance, legal, project-management, vendor-management, executive-strategy) serve creative, analytical, documentation, and operational work. Persistence and delivery follow the studio's natural collaboration pattern.

Every shipped studio runs on the same orchestration machinery. The same cursor walks every studio's stages; the same hat-dispatch function drives inception in the application-development studio, concept in the game-development studio, triage in the incident-response studio, and research in the ideation studio. The same gate resolution function handles every domain.

### What Changes Across Domains

- **Stage names and sequences.** Software needs inception before development; ideation needs research before creation. The ordering reflects domain-specific dependencies.
- **Hat roles and behavioral instructions.** A software researcher and a research analyst have entirely different focus areas, anti-patterns, and output expectations — but both are markdown files resolved by the same hat-loading machinery.
- **Persistence type.** Software work benefits from git branching and pull requests. Creative work may only need local files.
- **Output definitions and scopes.** A software stage might produce code scoped to the repository. An ideation stage might produce a research brief scoped to the intent's knowledge directory.
- **Review gate strictness.** Security stages may require external review. Creative stages may use auto-advance.
- **Quality gate commands.** Software gates run `npm test` or `cargo check`. Other domains may have no machine-verifiable gates, relying entirely on adversarial review.

### What Stays the Same

- The four-phase cycle (elaboration → execution → operation → reflection).
- The stage loop (elaborate → execute → review → approve → merge).
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
5. Optionally create `phases/ELABORATION.md` and `phases/EXECUTION.md` within a stage to override default phase behavior — for example, stage-specific criteria guidance, elaboration step modifications, or execution focus instructions.
6. Optionally create `outputs/{output}.md` for each stage output, defining scope, format, and content guidance.
7. Place the studio in `.haiku/studios/{name}/` for project-specific use, or contribute it to the plugin for general availability.

---

## 10. Conclusion

H·AI·K·U replaces ad-hoc AI prompting with disciplined lifecycle management. The framework's contribution is the separation of what is universal from what is domain-specific.

The universal layer provides: a four-phase lifecycle that maps to any initiative; a stage loop that enforces quality through hat-based role separation and adversarial review; backpressure mechanisms that constrain the AI through hooks rather than relying on agent compliance; and persistence abstractions that decouple work storage from orchestration logic.

The domain-specific layer provides: studios that define stage sequences appropriate to the domain; hats that carry behavioral instructions tuned to specific roles; quality gates that run domain-appropriate verification; and output definitions that scope deliverables correctly.

The plugin implementation demonstrates that this separation works in practice. The same orchestration machinery drives every shipped studio — from a six-stage application-development lifecycle with git persistence and pull-request delivery, to a four-stage library-development lifecycle that publishes to package registries, to a five-stage game-development lifecycle with a prototype-validation gate, to a six-stage hardware-development lifecycle with compliance-driven requirements and a one-shot manufacturing gate, to a five-stage sales cycle with filesystem persistence, to a five-stage security assessment with git-backed reporting. Adding a new domain requires defining stages and hats, not modifying orchestration code.

The framework is intentionally extensible through studios rather than through core modifications. The orchestration layer is stable; the studio layer is where domain expertise accumulates.

---

## Glossary

| Term | Definition |
|---|---|
| **Backpressure** | Quality enforcement via hooks that block the agent from proceeding until standards are met, rather than relying on agent compliance. |
| **Bolt** | One cycle through a stage's hat sequence for a unit. If completion criteria are not met, another bolt runs. Derived from the unit's `iterations[]` history on its frontmatter — the workflow cursor reads the last entry to decide which hat is next. |
| **Workflow Cursor** | The pure-TypeScript decision function that drives every `haiku_run_next` call. Reads on-disk frontmatter (intent.md, every unit.md, every feedback.md) plus studio config and returns one next action — `start_unit_hat`, `dispatch_review`, `merge_stage`, etc. No LLM in the workflow-position decision; no in-memory state across ticks. Walks three tracks in priority order: drift sweep, open feedback, intent track. Implementation in `packages/haiku/src/orchestrator/workflow/cursor.ts`; semantics documented in `plugin/studios/ARCHITECTURE.md` §5. |
| **Completion Criteria** | Verifiable conditions that define when a unit is done. Expressed as checkboxes in unit markdown. Quality gates enforce machine-verifiable criteria; adversarial review enforces the rest. |
| **DAG** | Directed acyclic graph ordering units within a stage by their dependencies. |
| **Feedback-Assessor** | A terminal fix-hat that independently verifies whether a prior fix resolves the named feedback. Cannot self-certify — the producer hat that made the fix is a different hat — which is the whole point of the isolation. Decides closure, keeps the finding open, or rejects as invalid. Defined as `hats/feedback-assessor.md` in any stage that opts into `fix_hats`. |
| **Fix Hats** | Ordered subset of a stage's hats, declared as `fix_hats:` in STAGE.md, dispatched directly against an open feedback finding instead of synthesizing a new unit. Eliminates the rework drift of feedback → unit → execute. The feedback body *is* the scope. Typically `[<producer>, feedback-assessor]`. |
| **Fix Loop** | Mechanism that dispatches a stage's `fix_hats` against each pending feedback finding (one at a time), with a three-bolt cap per finding before escalation. Same mechanics exist at the studio level for intent-completion review. |
| **Hat** | A behavioral role scoped to a stage. Each hat runs in a fresh agent context with instructions loaded from `stages/{stage}/hats/{hat}.md`. |
| **Intent** | The top-level initiative being pursued. Contains units organized by stages. Stored at `.haiku/intents/{slug}/intent.md`. |
| **Intent-Completion Review** | Studio-level adversarial review that runs once, after every stage's gate passes, before the intent is marked complete. Agents live at `plugin/studios/{studio}/review-agents/` (not per-stage). Findings log at intent scope and run through a studio-level fix loop via `plugin/studios/{studio}/fix-hats/`. Catches cross-stage inconsistencies that per-stage reviewers miss by construction. Cross-stage findings are always surfaced to the human; the layer explicitly forbids auto-revisiting stages. Enabled by default; opt out per intent with `intent_completion_review: false`. The finding rate per intent is the measurement surface: if it trends down over time, stage-level specs and reviews have gotten sharper upstream. |
| **Persistence Adapter** | Backend that handles how work is stored and delivered. Implementations: git (branches, commits, pull requests) and filesystem (local directories). |
| **Spec Review** | The engine-built `spec` reviewer that runs first in every stage's review track. Universal hard gate: every intent has a spec, every stage produces something the intent scoped, so the gate fires on every stage with no per-studio mandate file and no opt-out. It verifies that the completed units collectively delivered exactly what the intent scoped — no scope creep, no missed criteria, no cross-unit drift. Findings filed by spec routing through the fix loop unblock the rest of the review track (configured agents and the human gate). |
| **Quality Gate** | A machine-verifiable check (test, lint, typecheck, build, grep) enforced at advance_hat time. Declared as an executable `{name, command, dir?}` entry in unit frontmatter; commands must scope to the full stage artifact directory, not only the unit's declared inputs. Blocks the hat from advancing until the gate returns exit 0. |
| **Review Agent** | A specialized adversarial agent that evaluates stage output against a specific mandate (e.g., correctness, security, accessibility). Defined per-stage in `review-agents/{name}.md`. Agents can declare `applies_to:` (a list of file globs) to scope themselves to matching output kinds — e.g. a web accessibility agent only runs when the stage produces HTML/TSX/JSX. Stages can include review agents from other stages via `review-agents-include`. |
| **Review Gate** | A checkpoint between stages that controls advancement. Types: `auto` (advance when quality gates pass — no human involved), `ask` (open local review UI for human approval — signal is the MCP response), `external` (block until an external review system like GitHub/GitLab approves — signal detected primarily by branch merge detection, with URL-based CLI probing as fallback), `await` (block until an external event outside the review process occurs — e.g., customer response, contract signature). Compound gates like `[external, ask]` let the human choose between paths. |
| **Feedback Classification** | The first hat in a stage's `fix_hats:` chain reads each newly-filed FB body and calls `haiku_feedback_set_targets` to record which unit (if any) the finding targets and which approval roles to invalidate on closure. Targets are immutable once set. Cross-stage misfilings get relocated via `haiku_feedback_move` (which renumbers the FB and moves any sidecar attachment); after that, routing flows purely by file location — a finding sitting in `stages/<earlier>/feedback/` rewinds the cursor to that stage's fix loop on the next tick. The directory IS the classification — no `upstream_stage` hint needed. |
| **Stage** | A lifecycle phase within a studio. Contains hat definitions, review gate, input/output contracts, and unit type constraints. |
| **Studio** | A named lifecycle template mapping the four-phase model to domain-specific stages. Defines stage order, persistence type, and delivery mechanism. |
| **Unit** | A discrete piece of work within an intent, scoped to a single stage. Has verifiable completion criteria and dependency relationships forming a DAG. |
| **FB-as-Unit** | The fix-loop's structural rule: a feedback finding (FB) IS the unit-of-work for the fix-loop hats. Fixers populate the FB body with diagnosis (root cause, proposed action, references) via `haiku_feedback_write`; flagged units stay read-only via `haiku_unit_read`. The fix-loop hat chain progresses via `haiku_feedback_advance_hat` (mirror of the unit equivalent); the workflow engine auto-closes the FB when the last hat advances and applies `targets.invalidates` to the targeted unit's approvals — the cursor's next tick re-runs whatever roles got invalidated. Implementation contract in `plugin/studios/ARCHITECTURE.md` §6. |
| **Frontmatter-is-workflow-engine-only** | Architectural rule: frontmatter on workflow-managed files (units, feedback, intent) is reserved for the workflow engine. Agents may write FM when authoring (the elaborator drafts a unit's `inputs:`) but MUST NOT *interpret* FM for any mechanical purpose. DAG validity, schema, cross-references, lifecycle, and the workflow cursor's read-only signals (`iterations[]`, `started_at`, `approvals.*`, `reviews.*`, `discovery.*`) are workflow-engine responsibilities, validated at write time inside the MCP tools. Reviewer hats and verifier hats validate body content only. The `haiku_unit_read` and `haiku_feedback_read` MCP tools enforce this by returning `{title, body}` only — no FM exposed. Implementation contract in `plugin/studios/ARCHITECTURE.md` §1.1. |
| **Forward-only Lifecycle** | Architectural rule: units (and FBs) move only `pending → active → completed`. There are no reverse transitions — no unwind, no reset. Once a unit is active or completed, downstream work has been informed by it; mutating it would silently invalidate that work. Stage revisits create new pending units that build on completed work; they never modify completed units. The MCP tools enforce this at write time (`haiku_unit_write` accepts only pending; `haiku_unit_set` blocks non-workflow engine field writes on active/completed; `haiku_unit_delete` is pending-only). Implementation contract in `plugin/studios/ARCHITECTURE.md` §1.3. |
| **Plan-Do-Verify** | Hat-sequence pattern: every stage's `hats:` list MUST be at least three roles forming a plan → do → verify chain. Hat-to-hat handoff must be a meaningful baton (the rally-race test). Hat names MUST be distinct from the lifecycle's phase names (`elaborate`, `execute`, `review`, `gate`/`approve`, `merge`) so cursor traces and prompts stay unambiguous. Adversarial loops (red-team / blue-team / etc.) MAY follow the triplet but never precede. Implementation contract in `plugin/studios/ARCHITECTURE.md` §3. |

---

## Implementation Contract Reference

The methodology described in this paper is implemented in the H·AI·K·U plugin under `plugin/`. The canonical structural reference for studio/stage/unit/hat/feedback boundaries — including the boundary rules, lifecycle, hat patterns, and FB-as-unit fix-loop semantics summarized in the glossary above — lives at:

**`plugin/studios/ARCHITECTURE.md`**

This document supersedes any conflicting implementation guidance. It is the source of truth for how the plugin enforces the methodology — the abstract concepts in this paper map to the concrete rules and MCP tool contracts there. When extending or modifying the plugin, read ARCHITECTURE.md first.

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
