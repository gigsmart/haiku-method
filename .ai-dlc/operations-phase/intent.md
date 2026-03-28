---
workflow: default
git:
  change_strategy: intent
  auto_merge: true
  auto_squash: false
announcements: [changelog]
passes: []
active_pass: ""
iterates_on: ""
created: 2026-03-27
status: completed
epic: ""
---

# Full AI-DLC Operations Phase

## Problem

The AI-DLC 2026 paper defines a 9-step workflow (Inception steps 1-3, Construction steps 4-7, Operations steps 8-9), but the plugin only implements steps 1-4. Steps 5-9 — non-functional requirements, deployment architecture, IaC generation, deployment, and monitoring/incident management — are entirely missing. "Done" currently means "code works and tests pass." It should mean the feature is Functional, Deployable, Observable, and Operable.

The Builder produces code and tests but no deployment artifacts, monitoring config, or operational scripts. The Reviewer checks code quality but not deployment safety or observability completeness. Integration validates code but not cross-unit deployment compatibility. `/operate` exists but reads from a file (`operations.md`) that nothing in the workflow produces. The paper's Operations phase is defined conceptually but has zero implementation.

## Solution

Close the gap by implementing the full Operations phase:

1. **Stack config** — New `stack:` key in settings.yml describing the user's multi-provider infrastructure (Terraform for infra, Kubernetes for compute, Datadog for monitoring, etc.). All providers optional. Empty stack valid.

2. **Elaboration expansion** — Assess deployment/monitoring/operational surface per unit. Declare in unit frontmatter (`deployment:`, `monitoring:`, `operations:` blocks). Auto-create infrastructure/observability units when scope warrants.

3. **Four criteria categories** — Functional (does it work), Deployable (can it ship), Observable (can you see it), Operable (can you run it). Required categories vary by discipline.

4. **Builder expansion** — Produce deployment artifacts (IaC, Dockerfiles, pipeline config), monitoring config (dashboards, alerts, SLOs, KPIs), and operation scripts (self-contained, project-language, Anthropic SDK). New backpressure gates: DEPLOYABLE, OBSERVABLE, OPERATIONS_READY.

5. **Reviewer expansion** — Deployment Safety, Observability Completeness, and Infrastructure Correctness review agents. Chain-of-verification extended to operational artifacts.

6. **Integration expansion** — Cross-unit deployment compatibility, monitoring coverage, operation schedule/trigger conflicts, full-stack dry-run.

7. **CI/CD deploys** — Agent produces artifacts, pipeline deploys. Agent never runs terraform apply or kubectl apply directly.

8. **`/operate` rewrite** — Management interface: list, run ad-hoc, generate deployment manifests, show status, teardown. Per-file operations, each independently addressable.

9. **Documentation** — Update 2026 paper, add operations guide, stack config reference, operation file schema reference.

## Domain Model

### Entities
- **Stack Config** — Multi-provider infrastructure description (8 layers: infrastructure, compute, packaging, pipeline, secrets, monitoring, alerting, operations)
- **Completion Criteria Category** — Functional, Deployable, Observable, Operable. Required per discipline.
- **Deployment Artifact** — Dockerfile, IaC, Helm chart, k8s manifest, pipeline config
- **Operation** — Self-contained operational task (spec + script + deployment manifest). Types: scheduled, reactive, process, ad-hoc.
- **Monitoring Config** — Dashboard definitions, alert rules, SLO definitions. Provider-specific format.
- **KPI** — Business metric connecting technical work to business outcomes.

### Relationships
- Unit may have deployment/monitoring/operations blocks (declared during elaboration)
- Builder produces artifacts based on unit frontmatter + stack config
- Reviewer verifies via specialized agents (Deployment Safety, Observability Completeness, Infrastructure Correctness)
- Integration validates cross-unit compatibility
- CI/CD Pipeline deploys everything (agent produces, pipeline executes)
- `/operate` manages deployed operations

### Data Sources
- Plugin settings (`settings.yml` + schema) — stack config, quality gates, review agents
- Unit frontmatter — deployment, monitoring, operations blocks
- Existing provider system (`plugin/lib/config.sh`) — config loading patterns
- Paper (`website/content/papers/ai-dlc-2026.md` lines 1116-1167) — canonical Operations phase definition

## Success Criteria

### Plugin Implementation
- [ ] `stack:` config key exists in settings schema with multi-provider support (8 layers)
- [ ] Elaboration assesses deployment/monitoring/operational surface per unit
- [ ] Elaboration auto-creates infrastructure/observability units when scope warrants
- [ ] Completion criteria categories enforced by discipline during elaboration
- [ ] Builder produces deployment artifacts for infrastructure-discipline units
- [ ] Builder produces monitoring config for observability-discipline units
- [ ] Builder produces operation scripts in `.ai-dlc/{intent}/operations/`
- [ ] Builder produces deployment manifests for operations based on stack config
- [ ] New backpressure gates: DEPLOYABLE, OBSERVABLE, OPERATIONS_READY
- [ ] Reviewer has Deployment Safety and Observability Completeness as review agents
- [ ] Integration validates cross-unit deployment compatibility and monitoring coverage
- [ ] `/operate` rewritten as management interface with per-operation addressing
- [ ] `/operate {intent} {operation}` runs a specific operation

### Documentation
- [ ] 2026 paper Operations section updated to reflect implementation
- [ ] Website docs cover: operations guide, stack config reference, operation file schema
- [ ] Existing docs updated where they reference the current workflow

### Non-Functional
- [ ] Stack config with empty `stack: {}` gracefully skips all operations features
- [ ] All existing tests pass — no regressions
- [ ] New settings schema backward compatible with existing settings files

## Context

### Cross-Cutting Convention: Operation File Schema
All units must use the same operation file format:
- **Spec** (`.md`): YAML frontmatter (name, type, schedule/trigger, owner, runtime, inputs, outputs) + body (purpose, success criteria)
- **Script** (`.ts`/`.py`/`.sh`): Self-contained, env vars in, JSON stdout out, exit code for success/failure, `--dry-run` flag
- **Manifest** (`.deploy.yaml`/`.yml`): Deployment-target-specific wrapper generated from stack config

### Design Decisions Made During Elaboration
- Stack config is a new top-level `stack:` key, not under `providers:`
- Operation scripts match the project's language (not always TypeScript)
- Elaboration declares deployment/monitoring/operations in unit frontmatter (signal comes from elaboration, not builder)
- Infrastructure/observability units auto-created for large intents, folded for small ones
- Full manifest generation from stack config (not just schema)
- Criteria categories required per discipline (not all four for every unit)
- CI/CD deploys — agent never deploys directly
- Scope includes plugin + paper + website docs
