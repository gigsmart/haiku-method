---
intent: operations-phase
created: 2026-03-27
status: active
---

# Operations Phase: Comprehensive Domain Discovery

This document maps the complete surface area of the AI-DLC Operations Phase implementation. This is a LARGE change spanning nearly every part of the plugin. The discovery is organized by system area with current state, gaps, key files, and integration points.

---

## 1. Settings Schema & Configuration

### Current State

- **Location**: `plugin/schemas/settings.schema.json`
- **Config Loading**: `plugin/lib/config.sh` provides a 3-tier precedence system:
  1. Unit frontmatter (highest)
  2. Intent settings (`.ai-dlc/settings.yml`)
  3. Global settings (repo settings)
- **Supported Provider Categories**:
  - `spec`: Notion, Confluence, Google Docs
  - `ticketing`: Jira, Linear, GitHub Issues, GitLab Issues
  - `design`: Figma
  - `comms`: Slack, Teams, Discord
- **Quality Gates**: Already support custom test/lint/typecheck/build commands
- **Review Agents**: Already configured (security, performance, architecture, correctness, test_quality, etc.)
- **Model Profiles**: Already support per-hat model tier selection

### Gap: Operations-Specific Configuration

Missing from schema:
1. **`operations_config`** object (parallel to `providers`, `quality_gates`, `review_agents`)
   - Deployment strategy (blue-green, canary, rolling, manual)
   - Monitoring thresholds (alert levels, SLO targets)
   - Autonomous operation boundaries (what agents can do without approval)
   - Runbook location/provider
   - Observability provider (Datadog, New Relic, etc.) — currently only supports ticketing/spec/design/comms

2. **Operations-specific review agents** (not in current `review_agents` list):
   - `deployment_safety`: Backwards compatibility, feature flags, rollback plans
   - `observability_completeness`: Instrumentation coverage, metric/log/trace design

3. **Operations discipline** in disciplinary context:
   - Needed for unit frontmatter: `discipline: infrastructure|observability|operations`
   - Must route through ops-specific workflows

### Key Files

- `plugin/schemas/settings.schema.json` — Add `operations_config` definition
- `plugin/lib/config.sh` — Extend config loading for operations settings

### Integration Points

- Settings flow into builder/reviewer workflow selection
- Operations config gates unit execution in `/execute`
- Observability settings determine monitoring probe generation
- Deployment settings determine artifact production in builder

---

## 2. Elaboration System

### Current State

**Phase Overview** (from `plugin/skills/elaborate/SKILL.md`):
- Phase 0-0.5: Environment check, existing intent check, iteration detection
- Phase 1: Gather intent (what to build)
- Phase 2: Clarify requirements (Q&A exploration)
- Phase 2.25: Intent worktree & discovery initialization
- Phase 2.5: Domain discovery (via `elaborate-discover` subagent)
- Phase 3: Build domain model
- Phase 4: Define success criteria
- Phase 5: Decompose into units with `discipline` field
- Phase 5.95: Define iteration passes (design → product → dev)
- Phase 6: Finalize workflow
- Phase 6.5: Validate with user
- Phase 6.75: Sync to ticketing provider (if configured)

**Discipline Handling** (existing):
- Units have `discipline` field: frontend, backend, api, documentation, devops, design, etc.
- Per-discipline workflows can be specified: `workflow: design` for design units (auto-set)
- Elaboration drives unit decomposition by discipline boundaries

**Discovery Subagent** (`plugin/skills/elaborate-discover/SKILL.md`):
- Spawned during Phase 2.5 to autonomously explore domain
- Writes findings to `discovery.md` with standardized section headers:
  - `## API Schema: {name}`
  - `## Codebase Pattern: {area}`
  - `## Design Analysis: {file}`
  - `## External Research: {topic}`
  - `## Data Source: {name}`
  - `## Provider Context: {type}`
  - `## UI Mockup: {view}`
  - `## Architecture Decision: {topic}`
  - `## Technology Choice: {name}`
  - `## Reference Implementation: {name}`

### Gap: Operations Elaboration Guidance

Missing from elaboration:
1. **Operations discovery section** in domain model:
   - Deployment targets and environments
   - Monitoring/observability requirements
   - Operational runbooks and procedures
   - SLO/SLA definitions
   - Incident response procedures

2. **Ops-specific questions** in clarification phase (Phase 2):
   - How does this get deployed?
   - What monitoring is needed?
   - What are the SLOs?
   - Who operates it?
   - What runbooks exist?

3. **Ops unit decomposition** in Phase 5:
   - Infrastructure/IaC units (Terraform, CloudFormation)
   - Observability units (dashboards, alerts, probes)
   - Deployment automation units
   - Operations documentation units

4. **Operational frontmatter fields** for units:
   - `deployment_artifact`: What gets deployed (container, function, etc.)
   - `monitoring_required`: List of required metrics/logs/traces
   - `runbook_file`: Path to operational runbook
   - `operations_discipline`: true/false flag

### Key Files

- `plugin/skills/elaborate/SKILL.md` — Phase 2 clarification and Phase 5 decomposition sections
- `plugin/skills/elaborate-discover/SKILL.md` — Discovery section headers
- `website/content/papers/ai-dlc-2026.md` — Lines 1116-1167 define operations phase conceptually

### Integration Points

- Elaboration feeds units with `discipline` into builder workflow selection
- Discovery findings become context for planner and builder
- Unit frontmatter `deployment_artifact` and `monitoring_required` gate operations phase execution
- Ops units must `depends_on` implementation units

---

## 3. Builder System

### Current State

**Builder Hat** (`plugin/hats/builder.md`):
- Implements code to satisfy completion criteria
- Uses backpressure (tests, lint, types) as feedback
- References **plan** from Planner hat
- References **completion criteria** from unit
- Handles blockers via **Node Repair Operator** (RETRY → DECOMPOSE → PRUNE → ESCALATE)
- Provider sync: can update ticket status, post to comms

**Builder Reference** (`plugin/hats/builder-reference.md`):
- Design implementation guidance (how to work with Figma/design mockups)
- Provider sync details (updating tickets, deviation rules)
- Auto-fix vs escalation decisions

**Quality Gates** in execution:
- Tests, lint, typecheck, build commands defined in settings
- Run after each increment
- Block progress if failing
- Can be custom-defined per project

**Provider Integration**:
- Design provider: Read mockups, implement to spec
- Spec provider: Reference API contracts, data schemas
- Ticketing: Auto-update ticket status (in progress → done)

### Gap: Deployment Artifact Production

Missing from builder:
1. **Deployment artifact generation**:
   - When `discipline: infrastructure`, builder produces:
     - Terraform files, CloudFormation templates, Helm charts, Dockerfiles, K8s manifests
     - These are artifacts, not "code" in traditional sense
     - Quality gates: `terraform plan`, `helm template`, `docker build`, manifest validation
   - Builder must package modules into deployment units (containers, functions, IaC)

2. **Deployment validation gates**:
   - New gate types: `terraform_plan`, `helm_template`, `docker_build`, `manifest_validate`
   - These replace traditional test/lint/typecheck for infrastructure units
   - Must pass before builder marks unit complete

3. **Artifact registry/output**:
   - Where do built artifacts go? (Container registry, Terraform Registry, Helm Repo)
   - Must track artifact locations for operations phase
   - Unit frontmatter: `artifact_location: "gcr.io/my-org/my-service:v1.0.0"`

4. **Observability instrumentation**:
   - Builder adds instrumentation based on `monitoring_required` field
   - Inserts metric collectors, log exporters, trace reporters
   - Quality gate: lint/test verifies instrumentation is wired
   - Must not be optional — completeness checked by reviewer

5. **Runbook generation**:
   - Builder generates runbooks for deployed systems
   - Runbooks include: incident response, troubleshooting, scaling procedures
   - These are authored as markdown templates, not code
   - Quality gate: review runbooks match actual system capabilities

### Key Files

- `plugin/hats/builder.md` — Steps 1-5 (review plan, implement, backpressure, document, handle blockers)
- `plugin/hats/builder-reference.md` — Design/provider details
- `plugin/schemas/settings.schema.json` — Quality gates definition (needs extension for deployment gates)

### Integration Points

- Builder receives plan from Planner
- Builder reads criteria and `deployment_artifact`, `monitoring_required` from unit
- Builder outputs to `artifact_location` field in unit frontmatter
- Builder commits progress to unit branch
- Reviewer receives built artifacts and observability instrumentation to verify
- Operations phase reads `artifact_location` and `runbook_file` to deploy and operate

---

## 4. Reviewer System

### Current State

**Reviewer Hat** (`plugin/hats/reviewer.md`):
- Two-stage review: Spec Compliance (does it meet criteria?) + Code Quality (is it well-written?)
- Stage 1 blocks approval if criteria not met
- Stage 2 findings are improvement suggestions
- Delegates to specialized review agents based on changed files and unit discipline:
  - Correctness, Security, Performance, Architecture, Test Quality, Code Quality
  - Accessibility, Responsive (for frontend)
  - Data Integrity, Schema Drift, Deployment Safety (optional)
- Uses **Chain-of-Verification** pattern: initial judgment → verify questions → answer with evidence → revise
- Provider sync: comments on tickets, updates ticket status

**Reviewer Reference** (`plugin/hats/reviewer-reference.md`):
- Anti-rationalization patterns
- Red flags (approving without tests, skipping criteria verification, etc.)
- Specialized review agent activation based on file patterns

**Current Review Agent Activation**:
```
Data agents: *.migration.*, schema.*, seeds/
API agents: routes/, controllers/, openapi.*
Frontend agents: components/, styles/, *.css, *.tsx
Infra agents: Dockerfile, *.yml (CI), terraform/
```

### Gap: Operations-Specific Review Agents

Missing:
1. **Deployment Safety Agent**:
   - Reviews: Backwards compatibility, feature flags, rollback plans, state management
   - Checks: Can the deployment be rolled back? Are feature flags in place? Is it zero-downtime?
   - Activation: When unit has `deployment_artifact` field

2. **Observability Completeness Agent**:
   - Reviews: Metric/log/trace coverage, SLO alignment, dashboard completeness
   - Checks: Are all critical paths instrumented? Do metrics cover SLO targets? Are dashboards actionable?
   - Activation: When unit has `monitoring_required` field

3. **Runbook Quality Agent**:
   - Reviews: Runbook completeness, procedural clarity, incident response procedures
   - Checks: Can an on-call engineer follow the runbook? Are all failure modes covered?
   - Activation: When unit has `runbook_file` field

4. **Ops Unit Criteria Expansion**:
   - For infrastructure units, criteria must include:
     - Deployment validation (artifact builds/renders correctly)
     - Rollback procedure documented
     - Observability instrumentation verified
     - Runbook walkthrough complete
   - These are verifiable even if subjective

5. **Hard Gates for Deployment Units**:
   - Infrastructure units cannot be approved without:
     - Deployment artifact generated and tested (terraform plan succeeds, helm template renders)
     - Observability instrumentation code review passed
     - Runbook review passed

### Key Files

- `plugin/hats/reviewer.md` — Review delegation section, chain-of-verification pattern
- `plugin/hats/reviewer-reference.md` — Specialized agents section
- `plugin/schemas/settings.schema.json` — review_agents section (needs `deployment_safety`, `observability_completeness`)

### Integration Points

- Reviewer receives completed builder output
- Reviewer checks unit criteria, including `deployment_artifact`, `monitoring_required`, `runbook_file`
- Reviewer spawns ops agents based on unit discipline and deployment fields
- Operations phase reads reviewer's approval to enable deployment

---

## 5. Integration System

### Current State

**Integrate Skill** (`plugin/skills/integrate/SKILL.md`):
- Runs after all units complete and are merged
- Intent-level validation (all units work together)
- Verifies:
  - Merged state integrity (no conflicts)
  - Full backpressure suite passes (tests, lint, types)
  - Intent-level success criteria met
  - Cross-unit integration verified (units interact at boundaries)
  - No emergent issues from unit combination
- Decisions: ACCEPT or REJECT (specific units needing rework)

### Gap: Operations-Level Integration

Missing:
1. **Cross-unit deployment orchestration**:
   - Integration must verify units deploy in correct order
   - Dependency chain: infrastructure → services → observability
   - Check: Can all artifacts be deployed together without conflicts?

2. **Observability integration**:
   - All units' metrics/logs/traces must flow to same observability system
   - Integration must verify: no duplicate metric names, consistent tags, no log format mismatches
   - Check: Can observability dashboard consume all unit output?

3. **End-to-end operational flow**:
   - Integration must simulate operational scenario: deploy all units, run health checks, verify SLOs
   - Staging environment validation before declaring intent complete

4. **Runbook consolidation**:
   - Merge per-unit runbooks into intent-level runbook
   - Verify no conflicts or duplicate procedures

### Key Files

- `plugin/skills/integrate/SKILL.md` — Steps 1-6 (verify merge, backpressure, criteria, integration, emergent issues, decision)

### Integration Points

- Integrate runs after all units approved by reviewer
- Receives intent-level criteria from intent.md
- Verifies all unit artifacts (deployment, observability, runbooks) work together
- Gates `/advance` to operations phase

---

## 6. Execute System

### Current State

**Execute Skill** (`plugin/skills/execute/SKILL.md`):
- User-facing command: `/execute [intent-slug] [unit-name]`
- Fully autonomous execution loop (no user questions during execution)
- DAG-driven: respects `depends_on` edges between units
- Hat transitions: planner → builder → reviewer → integrate → complete
- Hard gates block transitions:
  - `PLAN_APPROVED`: Plan exists, covers all criteria
  - `TESTS_PASS`: Quality gates passing
  - `CRITERIA_MET`: Each criterion has PASS with evidence
- Worktree management: runs in `.ai-dlc/worktrees/{intent-slug}/`
- Remote tracking: ensures teammates can access intent branch
- Provider sync warning: checks if ticketing provider configured but tickets empty

**Workflow Definitions** (`plugin/workflows.yml`):
- `default`: planner → builder → reviewer
- `adversarial`: planner → builder → red-team → blue-team → reviewer
- `design`: planner → designer → reviewer
- `hypothesis`: observer → hypothesizer → experimenter → analyst
- `tdd`: test-writer → implementer → refactorer → reviewer

**Backpressure Enforcement**:
- Quality gates configured in settings
- Run after builder changes
- Block reviewer if failing
- Customizable per project

### Gap: Operations Gate & Phase Transition

Missing:
1. **New hard gate: `OPERATIONS_READY`**
   - Between `CRITERIA_MET` (reviewer approves) and integration
   - Check: All units have `artifact_location`, `monitoring_required` satisfied, `runbook_file` written
   - Blocks integration until ops prerequisites met

2. **New hat transition point: `integrate` → `operations-plan`**
   - Currently: integrate accepts/rejects, then intent is complete
   - Must add: integration accepts → `/advance` → operations planning phase
   - Operations phase produces `operations.md` with deployment and monitoring tasks

3. **New workflow: `default-with-ops`**
   - Sequence: planner → builder → reviewer → integrate → operations-plan → operations
   - Or: allow per-unit `operations: true` flag in frontmatter to gate ops phase participation

4. **Unit status tracking for operations**:
   - New statuses: `deployable` (artifact ready), `observable` (instrumentation complete), `operations_ready` (runbook complete)
   - Workflow must track these, not just `completed`

5. **Execution loop must handle operations units**:
   - Infrastructure units must build before deployment units
   - Observability units must build before monitoring probe deployment
   - Operations units have different completion criteria (procedures documented, not code tested)

### Key Files

- `plugin/skills/execute/SKILL.md` — Step 0 (context, hard gates), Step 1 (load state)
- `plugin/workflows.yml` — Workflow definitions (needs `default-with-ops` variant)

### Integration Points

- Execute uses integration output to confirm ready for operations
- Executes operations units (infrastructure, observability, deployment automation)
- Tracks `DEPLOYABLE` and `OBSERVABLE` gates before allowing operations phase
- Transitions to `/operate` when intent complete

---

## 7. Operate System

### Current State

**Operate Skill** (`plugin/skills/operate/SKILL.md`):
- User-facing command: `/operate [intent-slug]`
- Reads `operations.md` (not yet produced by builder/reviewer)
- Parses:
  - Frontmatter: intent, created, status (active|paused|complete)
  - Recurring tasks: scheduled operations with owner (agent|human)
  - Reactive tasks: triggered by conditions, owner (agent|human)
  - Manual tasks: human-owned with checklists and frequency
- Executes agent-owned tasks (runs commands, scripts)
- Provides guidance/checklists for human tasks
- Tracks operational status in `operation-status.json`
- Can trigger re-elaboration if operational findings suggest changes

**Operations Concepts** (from paper, lines 1116-1167):
- Deployment: AI packages modules → staging test → human approval → production deploy with rollback
- Observability: AI analyzes metrics/logs/traces, detects anomalies
- Autonomous Operations Boundaries:
  - Allowed: scale horizontally, restart unhealthy pods, rollback on error rate spike
  - Requires approval: scale vertically, database migration, security changes, deletions

### Gap: Complete Operations Phase Implementation

Missing:
1. **Operations.md Production** (NEW):
   - When does it get created? Builder should produce during infrastructure units
   - What sections does it contain?
   - How is it validated by reviewer?

2. **Deployment Tasks** (missing):
   - Staging deployment automation
   - Health check procedures
   - Production promotion procedures
   - Rollback procedures
   - All as agent-owned tasks with shell commands

3. **Observability Tasks** (missing):
   - Metrics collection verification
   - Dashboard setup
   - Alert definition
   - SLO validation
   - As recurring tasks (verify metrics flowing) and reactive (respond to alerts)

4. **Monitoring & Anomaly Response**:
   - Autonomous anomaly detection and response (scale, restart, rollback)
   - Human escalation for novel situations
   - Clear boundaries in autonomous_actions YAML

5. **Runbook Integration**:
   - Operations.md references runbooks from units
   - Runbooks are executable (can be followed by ops agents or humans)

6. **Operations State Management**:
   - Separate from build state (iteration.json)
   - Track: deployments, incidents, operational metrics
   - Resume after context reset

### Key Files

- `plugin/skills/operate/SKILL.md` — Steps 0-8 (load state, parse plan, display, execute agent tasks, guide human tasks, track status, re-elaborate, summarize)

### Integration Points

- Operate reads operations.md produced by builder
- Executes tasks via agent commands (terraform apply, helm deploy, etc.)
- Calls `/elaborate` if operational findings require changes
- Tracks state in operation-status.json (separate from build state)
- Feeds metrics/logs back to monitoring/alerting system

---

## 8. Workflows & Hat Routing

### Current State

**Workflows** (`plugin/workflows.yml`):
- 5 predefined workflows, each a sequence of hats
- Auto-routing rule: units with `discipline: design` automatically get `workflow: design`
- Per-unit workflow override via frontmatter: `workflow: {name}`
- Workflow selection happens during elaboration (Phase 6)

### Gap: Operations Workflow Routing

Missing:
1. **New workflows**:
   - `default-with-ops`: planner → builder → reviewer → integrate → operations-plan → operate
   - `infrastructure`: planner → builder → reviewer (with infrastructure review agents)
   - `observability`: planner → builder → reviewer (with observability agents)

2. **Auto-routing for operations units**:
   - `discipline: infrastructure` → `workflow: infrastructure`
   - `discipline: observability` → `workflow: observability`
   - `discipline: operations` → special handling (no "build" phase, just documentation)

3. **Workflow configuration in settings**:
   - Ability to set default workflow per intent
   - Ability to override per-unit based on discipline
   - Ability to chain workflows (design → dev → ops)

### Key Files

- `plugin/workflows.yml` — Add new workflow definitions
- `plugin/skills/elaborate/SKILL.md` — Phase 5 auto-routing logic

### Integration Points

- Elaboration (Phase 5) assigns workflow to each unit
- Execute looks up workflow for each unit, determines hat sequence
- Each hat receives workflow context via subagent hook

---

## 9. Hooks System

### Current State

**Hooks Registry** (`plugin/.claude-plugin/hooks.json`):
- PreToolUse hooks: EnterPlanMode, Task/Skill, Write/Edit
- PostToolUse hooks: context monitor
- Each hook is a bash command with timeout

**Subagent Context Hook** (`plugin/hooks/subagent-context.sh`):
- Injects role-scoped context into subagent prompts
- Reads from `han keep` (git-first storage)
- Handles both main branch and intent branch state
- Role-scoped context (review, build, plan, full) reduces token usage

**Context Sections Injected**:
- Iteration and hat info
- Provider configuration
- Intent and criteria
- Discovery headers (brief)
- Unit context

### Gap: Operations Context Injection

Missing:
1. **Operations state loading**:
   - Subagent hook must load `operation-status.json` when in operations phase
   - Inject current task, last run status, metrics

2. **Deployment artifact context**:
   - When builder is in infrastructure unit, inject artifact registry/location templates
   - When operations phase, inject all unit artifacts for deployment

3. **Observability context**:
   - When builder is in observability unit, inject monitoring tool details
   - When operations phase, inject all unit instrumentation for alert setup

4. **Operations-specific role scoping**:
   - `context_scope: "operations"` (new)
   - Skip build details, include operations procedures, runbooks, SLOs

### Key Files

- `plugin/.claude-plugin/hooks.json` — Hook registry
- `plugin/hooks/subagent-context.sh` — Context injection logic

### Integration Points

- Hooks fire when subagents spawn (Skill tool)
- Inject context from intent branch state
- Operations subagents need special context scope

---

## 10. Documentation & Website

### Current State

**Paper** (`website/content/papers/ai-dlc-2026.md`):
- Comprehensive 2026 AI-DLC methodology
- Lines 1116-1167 define Operations Phase conceptually:
  - Deployment: AI packages modules → staging → human approval → production
  - Observability: Metrics/logs/traces analysis, anomaly detection
  - Autonomous Operations: Defined boundaries for what agents can do autonomously
  - Example YAML of autonomous_actions

**Documentation Structure** (`website/content/docs/`):
- guide-developer.md, guide-ai.md, concepts.md, workflows.md
- Covers: elaboration, unit decomposition, discipline, completion criteria
- Missing: operations phase documentation

### Gap: Operations Documentation

Missing:
1. **Operations guide** (`guide-operations.md`):
   - How to define operational requirements during elaboration
   - How to write runbooks that agents can execute
   - How to set autonomous operation boundaries
   - How to monitor production systems

2. **Deployment artifact spec** (`artifacts.md`):
   - Container/function/IaC artifact formats
   - How to register artifacts
   - How to track artifact versions

3. **Observability spec** (`observability.md`):
   - Metrics, logs, traces design
   - SLO/SLA definition
   - Dashboard design principles

4. **Runbook template** (`runbook-template.md`):
   - Structure for executable runbooks
   - Procedure documentation
   - Error handling patterns

5. **Operational checklist** (`checklist-operations-setup.md`):
   - What to configure before operations phase
   - What to verify before production
   - Handoff checklist to ops team

### Key Files

- `website/content/papers/ai-dlc-2026.md` — Conceptual operations phase definition
- `website/content/docs/` — Documentation directory (add operations guides)

### Integration Points

- Developers read guides to understand how to elaborate ops units
- Builders reference templates when producing artifacts
- Operations engineers use docs to understand runbook execution

---

## 11. Existing Disciplines

### Current State

**Discipline Concept**:
- Units have `discipline` field: frontend, backend, api, documentation, devops, design, etc.
- Used to:
  - Select review agents: `frontend` → accessibility + responsive agents
  - Select workflow: `design` → design workflow (planner → designer → reviewer)
  - Apply discipline-mapped labels in ticketing provider

**Discipline Handling in Elaborate**:
- Phase 5 decomposition rule: "Units MUST NOT span domains. A unit has exactly one discipline."
- If feature needs both backend and frontend, those are TWO units
- Frontend unit depends_on backend unit

**Discipline Handling in Reviewer**:
- Review agent selection based on `discipline` field and file patterns
- Frontend units get accessibility + responsive agents
- Infra units get deployment safety agents

### Gap: Operations Disciplines

Missing:
1. **New discipline types**:
   - `infrastructure`: Terraform, CloudFormation, Helm, K8s manifests
   - `observability`: Metrics, logs, traces, dashboards, alerts
   - `deployment`: CI/CD automation, promotion procedures
   - `runbooks`: Operational procedures, incident response docs
   - `operations`: (catch-all for ops work that's not code)

2. **Discipline-specific workflows**:
   - `infrastructure` → planner → builder (with terraform/helm gates) → reviewer (with deployment safety agent)
   - `observability` → planner → builder (with observability agent) → reviewer (with observability completeness agent)
   - `runbooks` → planner → writer (documentation focused) → reviewer

3. **Discipline-specific quality gates**:
   - Infrastructure: `terraform plan`, `helm template`, `docker build`, manifest validation
   - Observability: no tests, but verification that instrumentation is wired
   - Runbooks: automated checklist validation, syntax checking

4. **Discipline-specific review agents**:
   - Already: Deployment Safety, Observability Completeness
   - Need: Infrastructure Correctness, Observability Design

### Key Files

- `plugin/skills/elaborate/SKILL.md` — Phase 5 decomposition rule section
- `plugin/hats/reviewer.md` — Review agent selection section
- `plugin/schemas/settings.schema.json` — Review agents config (add `deployment_safety`, `observability_completeness`)

### Integration Points

- Elaboration assigns disciplines to units
- Execute uses discipline to select workflows
- Reviewer uses discipline to select review agents
- Builder uses discipline to select quality gates

---

## 12. Architecture Summary

### Current System Flow

```
User: /elaborate
  → Elaboration Phase (clarify, discover, decompose)
  → Create intent/ and unit/ files with criteria
User: /execute
  → Execute Loop (fully autonomous)
  → Per-unit workflow: planner → builder → reviewer
  → Integration: verify units work together
  → Intent complete, output summary
```

### New Operations Phase Flow (to implement)

```
User: /elaborate
  → Include operations clarification (deployment, monitoring, SLOs)
  → Elaborate operations units (infrastructure, observability)
  → Create operations-specific criteria (artifact exists, instrumentation complete)
User: /execute
  → Execute loop includes infrastructure/observability units
  → Builder produces: deployment artifacts, instrumentation code, runbooks
  → Reviewer verifies: artifacts valid, instrumentation complete, runbooks executable
  → Integration: verify all units deploy/monitor together
  → Operations gate: DEPLOYABLE, OBSERVABLE, OPERATIONS_READY
User: /operate
  → Load operations.md (produced by builder from infrastructure units)
  → Execute deployment tasks (terraform apply, helm deploy, health checks)
  → Setup monitoring (alerts, dashboards, probes)
  → Execute recurring/reactive tasks (health checks, anomaly response)
  → Track operational status
```

### Key Architectural Changes

1. **Builder Output Expansion**:
   - Currently: code (in source files) + tests + documentation
   - New: + deployment artifacts + observability instrumentation + runbooks

2. **Reviewer Scope Expansion**:
   - Currently: code quality + correctness + tests
   - New: + deployment safety + observability completeness + runbook quality

3. **Unit Metadata Expansion**:
   - Currently: `status`, `depends_on`, `discipline`, `workflow`
   - New: + `deployment_artifact`, `artifact_location`, `monitoring_required`, `runbook_file`, `operations_discipline`

4. **Execution Phases**:
   - Currently: planner → builder → reviewer → integrate → complete
   - New: + operations-plan (new phase to write operations.md) + operations (new phase to execute deployment/monitoring)

5. **Hard Gates**:
   - Currently: PLAN_APPROVED, TESTS_PASS, CRITERIA_MET
   - New: + DEPLOYABLE (artifacts exist), OBSERVABLE (instrumentation verified), OPERATIONS_READY (runbooks complete)

---

## 13. Cross-System Integration Points

### Settings Schema → Builder

- Quality gates loaded by builder to determine test/lint/typecheck/build commands
- Operations config loaded to determine deployment strategy
- Review agents config loaded for reviewer delegation

### Elaboration → Execute

- Units with `discipline: infrastructure` get infrastructure workflow
- Units with `deployment_artifact` trigger DEPLOYABLE gate
- Units with `monitoring_required` trigger OBSERVABLE gate
- Completion criteria include deployment/observability requirements

### Builder → Reviewer

- Builder commits deployment artifacts, instrumentation code, runbooks
- Reviewer verifies artifacts (terraform plan, helm template, docker build)
- Reviewer verifies instrumentation is wired (imports, exports, metrics flowing)
- Reviewer verifies runbooks are executable (procedures are clear, no TODOs)

### Reviewer → Integration

- Reviewer outputs approval/rejection with artifact status
- Integration verifies: all artifacts deployable together, observability complete end-to-end, runbooks cover all units

### Integration → Operations

- Integration approves intent as operations-ready
- Operations.md produced by builder during infrastructure units
- Operations phase reads and executes operations.md
- Operations phase updates operation-status.json

### Hooks → All Phases

- Subagent context hook injects: intent, criteria, discovery headers, unit context, providers
- New: operations context (status, deployments, metrics, procedures)
- Role-scoped: review agents get less context, ops agents get full context

### Providers → All Phases

- Spec provider: requirements docs read during elaboration
- Ticketing provider: epic/tickets created during elaboration, updated during build/review
- Design provider: mockups read during build, verified during review
- Comms provider: summaries posted during build/review/ops
- **New**: Observability provider (Datadog, New Relic): metrics/logs read during ops phase

---

## 14. File-by-File Modification Inventory

### Schema & Config (3 files)
1. `plugin/schemas/settings.schema.json` — Add `operations_config`, extend `review_agents`
2. `plugin/lib/config.sh` — Extend config loading for operations
3. `plugin/workflows.yml` — Add `default-with-ops`, `infrastructure`, `observability` workflows

### Elaboration (3 files)
4. `plugin/skills/elaborate/SKILL.md` — Phase 2 ops questions, Phase 5 ops decomposition
5. `plugin/skills/elaborate-discover/SKILL.md` — Add ops discovery section headers
6. (New file) `plugin/skills/elaborate-operations/SKILL.md` — Operations-specific elaboration guidance

### Builder (3 files)
7. `plugin/hats/builder.md` — New section: handling deployment artifacts, instrumentation, runbooks
8. `plugin/hats/builder-reference.md` — New section: infrastructure deployment, observability instrumentation
9. (New file) `plugin/hats/operations-planner.md` — New hat for operations planning phase

### Reviewer (3 files)
10. `plugin/hats/reviewer.md` — Extend review delegation for ops agents (deployment_safety, observability_completeness)
11. `plugin/hats/reviewer-reference.md` — Add specs for ops review agents
12. (New file) `plugin/hats/operations-reviewer.md` — Specialized review for operations units

### Integration (1 file)
13. `plugin/skills/integrate/SKILL.md` — Add cross-unit deployment/observability verification

### Execution (3 files)
14. `plugin/skills/execute/SKILL.md` — Add DEPLOYABLE, OBSERVABLE, OPERATIONS_READY gates
15. (New file) `plugin/skills/operations-plan/SKILL.md` — New skill to write operations.md
16. (New file) `plugin/skills/operate/SKILL.md` — Already exists, extend to handle all task types

### Hooks (1 file)
17. `plugin/hooks/subagent-context.sh` — Add operations context loading and injection

### Documentation (6 files)
18. `website/content/docs/guide-operations.md` — New guide for ops elaboration/execution
19. `website/content/docs/artifacts.md` — New guide for deployment artifacts
20. `website/content/docs/observability.md` — New guide for observability design
21. `website/public/templates/runbook-template.md` — New runbook template
22. `website/public/templates/operations-template.md` — New operations.md template
23. `website/content/docs/checklist-operations-setup.md` — New operations setup checklist

### Templates (2 files)
24. `website/public/templates/unit-template.md` — Extend for deployment_artifact, monitoring_required, runbook_file fields
25. (Already exists) `website/public/templates/settings-template.yml` — Extend for operations_config

---

## 15. Risk Assessment & Dependencies

### High-Risk Areas

1. **Hard Gates (DEPLOYABLE, OBSERVABLE)**:
   - Must be verifiable programmatically
   - If too strict: units can't complete
   - If too loose: bad artifacts reach operations phase
   - **Risk Mitigation**: Define clear acceptance criteria (terraform plan succeeds, import exists, runbook has no TODOs)

2. **Autonomous Operations Boundaries**:
   - Must be safe (no unreviewed deletions)
   - Must be useful (agents can actually fix common issues)
   - **Risk Mitigation**: Start conservative (only scale, restart, rollback), expand based on operational data

3. **Infrastructure Unit Dependencies**:
   - Deployment order matters (database before API, infrastructure before deployment)
   - **Risk Mitigation**: Strong depends_on discipline during elaboration, integration verification

### Medium-Risk Areas

1. **Observability Instrumentation**:
   - Must be testable (can verify code generates metrics)
   - Cannot assume production environment exists
   - **Risk Mitigation**: Mock metrics/logs in tests, verify imports/exports in code

2. **Runbook Quality**:
   - Must be executable by non-expert (on-call engineer)
   - Must handle failure cases
   - **Risk Mitigation**: Review by operations team before production, test runbooks in staging

3. **Provider Integration for Operations**:
   - Observability provider is new (not yet in config)
   - Must support Datadog, New Relic, etc.
   - **Risk Mitigation**: Start with print/log-based operations, add provider integration later

### Low-Risk Areas

1. **Workflow routing** — Can be added incrementally, defaults safely
2. **Review agent delegation** — Doesn't block existing reviews, adds new checks
3. **Documentation** — Can be written post-implementation, guides use

### Critical Dependencies

1. **Elaboration must define operations requirements** → Builder can implement correctly
2. **Builder must produce artifacts/instrumentation/runbooks** → Reviewer can verify them
3. **Reviewer must verify operations artifacts** → Integration can validate
4. **Integration must pass → Operations phase can execute safely**

---

## 16. Open Questions & Decisions Needed

### Definition Questions

1. **What constitutes a "Deployment Artifact"?**
   - Container image? Terraform module? Helm chart? All of the above?
   - How is it versioned?
   - Where is it registered? (Container registry, Terraform registry, artifact store?)

2. **What does "Operations-Ready" mean?**
   - All infrastructure units complete?
   - All observability units complete?
   - All runbooks written?
   - All passed integration tests?

3. **How are Operations Units defined?**
   - Are they actual units in the DAG, or metadata on deployment units?
   - Can they have completion criteria? (e.g., "runbook has no TODOs")

### Scope Questions

4. **Is operations.md produced per-unit or per-intent?**
   - Current design: per-intent (one operations.md for whole intent)
   - Per-unit would be more granular but harder to coordinate

5. **What's the scope of autonomous operations?**
   - Just deployment/health checks?
   - Include auto-scaling, restarts, rollbacks?
   - Include alerting, dashboard setup?
   - Include incident response automation?

6. **How deep is observability instrumentation?**
   - Just basic metrics (latency, errors)?
   - Full distributed tracing?
   - Business metrics and KPIs?

### Tool/Provider Questions

7. **Which observability providers to support in v1?**
   - Start with generic (print metrics, logs)?
   - Or direct integration (Datadog, New Relic)?

8. **How does deployment automation work?**
   - Shell commands (terraform apply, helm deploy)?
   - Agent directly calls deployment APIs?
   - Agent writes deployment plans for human approval?

9. **Are runbooks human-readable or machine-executable?**
   - Current design: both (markdown procedures that agents follow)
   - Alternative: YAML-based runbook specification language

### Integration Questions

10. **How do operations units depend on implementation units?**
    - Implicit (infrastructure depends_on all other units)?
    - Explicit (each unit lists dependencies)?

11. **What triggers the transition from execution to operations?**
    - Intent complete + integration passes?
    - User invokes `/operate`?
    - Automatic?

---

## Summary

The Operations Phase is a LARGE change touching:
- **Settings schema** (new `operations_config` object)
- **Elaboration** (new ops clarification questions, ops unit types)
- **Builder** (new artifact/instrumentation/runbook production)
- **Reviewer** (new ops-specific review agents, artifact verification)
- **Integration** (new cross-unit deployment/observability checks)
- **Execute** (new DEPLOYABLE/OBSERVABLE gates, operations workflow)
- **Operate** (new operations.md execution)
- **Documentation** (6 new/updated guides and templates)

**Total files to modify: ~25 files** (in current estimate)

**Key architectural patterns** that must be maintained:
1. Backpressure gates (DEPLOYABLE, OBSERVABLE, OPERATIONS_READY)
2. Hard gates block transitions (infrastructure artifact must exist before deploying)
3. Review delegation (specialized review agents for ops concerns)
4. Autonomous operation boundaries (clear what agents can do)
5. Provider integration (ticketing, spec, design, comms, and NEW: observability)
6. Discipline-based routing (infrastructure → infrastructure workflow)

**Integration is the critical success factor**: all units (infrastructure, code, observability) must work together in deployment/monitoring. Integration verification is where we validate that.

