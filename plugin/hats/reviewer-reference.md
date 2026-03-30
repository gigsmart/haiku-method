# Reviewer Reference

Companion to the Reviewer hat. Loaded on-demand for discipline checks and parallel review setup.

## Anti-Rationalization

| Excuse | Reality |
| --- | --- |
| "Looks good to me" | Every LGTM needs evidence. What specifically did you verify? |
| "The tests pass so it's fine" | Passing tests prove what's tested, not what's missing. |
| "These are minor issues" | Minor issues compound. Document them all. |
| "We can fix this in the next bolt" | The next bolt inherits this bolt's debt. Fix now. |
| "The implementation is different but equivalent" | Different means untested. Verify equivalence. |
| "I trust the builder's judgment" | Trust but verify. Read the code, don't just scan it. |
| "The code looks clean, approve it" | Clean code that does not satisfy the Completion Criteria is still wrong. Verify each criterion. |
| "I'll note the issue but approve anyway" | If the issue is blocking, request changes. Approving with known problems is not reviewing. |
| "I read the code, that's enough" | Reading is not verifying. Run commands and check output programmatically. |
| "The wireframes are too different" | Fidelity level adjusts tolerance. Low-fidelity compares structure, not pixels. |
| "Visual comparison is subjective" | Structured categories with defined severities. High-severity issues are objective structural mismatches. |
| "Screenshots didn't capture correctly" | Infrastructure failure = review failure. Fix capture, don't skip the gate. |
| "The visual differences are minor" | Minor is a severity judgment. Document findings, score them, let the severity guide the verdict. |

## Red Flags

- Approving without running tests
- Skipping criteria verification
- Not checking edge cases
- Rubber-stamping because "it looks right"

**All of these mean: STOP and verify each criterion with evidence before deciding.**

## Specialized Review Agents

Beyond the core 5 perspectives (Security, Performance, Architecture, Correctness, Test Quality), these specialized agents can be spawned for domain-specific reviews:

| Agent | Focus | When to Use |
|-------|-------|-------------|
| **Data Integrity** | Schema consistency, migration safety, referential integrity | Database schema changes, data migrations |
| **Schema Drift** | Unrelated schema changes, accidental migrations | Any PR touching database files |
| **Deployment Safety** | Artifact builds, no secrets, health check, graceful shutdown, resource limits, pipeline | Unit has `deployment:` block, or `discipline: infrastructure` |
| **Observability Completeness** | Metrics instrumented, dashboards valid, alert rules correct, SLOs achievable | Unit has `monitoring:` block, or `discipline: observability` |
| **Infrastructure Correctness** | IaC best practices, least privilege, idempotent, state backend | Unit has `deployment:` block with IaC, or `discipline: infrastructure` |
| **Accessibility** | WCAG compliance, keyboard nav, screen reader support | UI component changes |
| **Concurrency** | Race conditions, deadlocks, transaction isolation | Multi-threaded or async code |
| **API Contract** | Breaking changes, versioning, backwards compatibility | Public API modifications |
| **Design System** | Token usage, component conventions, visual consistency | Frontend component changes |
| **Visual Fidelity** | AI vision comparison of built output vs design reference. Load `comparison-context.json` from `.ai-dlc/{intent}/screenshots/{unit}/` (prepared by the advance skill during builder-to-reviewer transition). | Units where `detect-visual-gate.sh` returns true (frontend/design discipline, design_ref/wireframe fields, UI file changes, UI terms in spec) |

### Activation

Specialized agents activate based on changed file patterns:

```bash
# Data agents: *.migration.*, schema.*, seeds/
# API agents: routes/, controllers/, openapi.*
# Frontend agents: components/, styles/, *.css, *.tsx
# Infra agents: Dockerfile, *.yml (CI), terraform/, *.tf
# Ops agents: see "Operational Review Agents" section below
```

Add to the parallel review fan-out when file patterns match.

---

## Operational Review Agents (Stage 3)

These agents run during Stage 3: Operational Readiness. They verify that deployment artifacts, monitoring configuration, and infrastructure code produced by the Builder are production-ready.

### Settings Interaction

Ops review agents respect `review_agents` config in `settings.yml`:

```yaml
review_agents:
  deployment_safety: true       # default: false
  observability_completeness: true  # default: false
  infrastructure_correctness: true  # default: false
```

**Force-activation override:** The following discipline-based rules ALWAYS apply, regardless of settings:
- `discipline: infrastructure` → **Deployment Safety** + **Infrastructure Correctness** always active
- `discipline: observability` → **Observability Completeness** + **Deployment Safety** always active

Settings can only disable these agents for units where they would activate based on frontmatter blocks alone (not discipline).

### Deployment Safety Agent

**Purpose:** Verify that deployment artifacts are production-ready, secure, and correctly wired into the CI/CD pipeline.

**Activates when:**
- Unit has `deployment:` frontmatter block, OR
- Unit `discipline: infrastructure` (force-activated), OR
- `review_agents.deployment_safety: true` in settings AND changed files match infra patterns

**Checks:**

| # | Check | Verification Command | Confidence if Failed |
|---|-------|---------------------|---------------------|
| 1 | Artifact builds successfully | `docker build --check .` or platform equivalent | **High** — blocks |
| 2 | No secrets in artifacts | `grep -rn 'password\|secret\|api_key\|token' Dockerfile *.yml` + check `.dockerignore` includes `.env` | **High** — blocks |
| 3 | Health check endpoint exists | Read Dockerfile for `HEALTHCHECK`, verify endpoint responds in code | **High** — blocks (for `deployment.type: service`) |
| 4 | Graceful shutdown handler | Search for SIGTERM/SIGINT handlers in entrypoint code | **Medium** — warns |
| 5 | Resource limits defined | Check k8s manifests for `resources.limits` and `resources.requests`, or equivalent | **Medium** — warns |
| 6 | CI/CD pipeline updated | Verify pipeline config references new artifacts (build, push, deploy steps) | **High** — blocks |
| 7 | Rollback strategy documented | Check for rollback steps in deployment config or ops docs | **Low** — suggests |
| 8 | Environment config externalized | No hardcoded hostnames, ports, or credentials in application code | **Medium** — warns |
| 9 | Zero-downtime capability | Rolling update strategy configured, readiness probe present | **Medium** — warns |

**Confidence scoring:**
- **High** (checks 1, 2, 3, 6): Deterministic — verifiable by running a command or reading config. Failure blocks approval.
- **Medium** (checks 4, 5, 8, 9): Likely correct but context-dependent. Warns in review.
- **Low** (check 7): Best practice suggestion. Noted but does not block.

**CoVe verification pattern:**
1. Read the `deployment:` block to determine artifact type
2. For each check, form initial assessment from code reading
3. Run the verification command listed in the table
4. Compare command output to expected result
5. Revise assessment if evidence contradicts initial judgment

### Observability Completeness Agent

**Purpose:** Verify that monitoring instrumentation, dashboards, and alert rules are correct and complete.

**Activates when:**
- Unit has `monitoring:` frontmatter block, OR
- Unit `discipline: observability` (force-activated), OR
- `review_agents.observability_completeness: true` in settings AND changed files match monitoring patterns

**Checks:**

| # | Check | Verification Command | Confidence if Failed |
|---|-------|---------------------|---------------------|
| 1 | All metrics from `monitoring.metrics` are instrumented | `grep -rn '{metric_name}' src/` for each declared metric | **High** — blocks |
| 2 | Dashboard references valid metrics | Cross-reference metric names in dashboard JSON/YAML with instrumented metric names in code | **High** — blocks |
| 3 | Alert rules reference correct metrics | Cross-reference metric names in alert rules with instrumented metric names | **High** — blocks |
| 4 | SLOs are achievable | Verify SLO thresholds in `monitoring.slos` have corresponding metrics and alert rules | **Medium** — warns |
| 5 | No orphaned metrics | Check that every instrumented metric is referenced in at least one dashboard or alert | **Low** — suggests |
| 6 | Dashboard JSON/YAML is valid | Parse dashboard files for syntax validity | **High** — blocks |
| 7 | Alert routing configured | Verify alert rules have notification targets matching `get_stack_layer "alerting"` | **Medium** — warns |
| 8 | Metric naming conventions | Check metrics follow project naming pattern (e.g., `{service}_{subsystem}_{name}_{unit}`) | **Low** — suggests |

**Confidence scoring:**
- **High** (checks 1, 2, 3, 6): Deterministic — metric names either match or don't, JSON either parses or doesn't. Failure blocks approval.
- **Medium** (checks 4, 7): Context-dependent — SLO achievability depends on production load patterns. Warns in review.
- **Low** (checks 5, 8): Best practice. Noted but does not block.

**CoVe verification pattern:**
1. Read the `monitoring:` block to extract declared metrics and SLOs
2. For each metric, grep the source code for instrumentation calls
3. Parse dashboard files and extract referenced metric names
4. Compare the two sets — any declared metric not found in code is a High finding
5. Parse alert rule files and verify metric references match instrumented names

### Infrastructure Correctness Agent

**Purpose:** Verify that Infrastructure-as-Code follows best practices, enforces least privilege, is idempotent, and has proper state management.

**Activates when:**
- Unit has `deployment:` frontmatter block with IaC artifacts (Terraform, CloudFormation, Pulumi, etc.), OR
- Unit `discipline: infrastructure` (force-activated), OR
- `review_agents.infrastructure_correctness: true` in settings AND changed files match IaC patterns (`*.tf`, `*.tfvars`, `cloudformation/*.yml`, `pulumi/`)

**Checks:**

| # | Check | Verification Command | Confidence if Failed |
|---|-------|---------------------|---------------------|
| 1 | IaC validates | `terraform validate` or equivalent for the IaC tool in use | **High** — blocks |
| 2 | Least privilege enforced | Check IAM policies for `*` actions or `Resource: "*"`, verify scoped permissions | **High** — blocks |
| 3 | Idempotent on re-apply | `terraform plan` on existing state shows no unintended changes (or reason documented) | **Medium** — warns |
| 4 | State backend configured | Verify remote state backend (S3, GCS, Azure Blob, etc.) — no local-only state for shared infra | **High** — blocks |
| 5 | No hardcoded secrets in IaC | `grep -rn 'password\|secret\|access_key' *.tf *.yml` | **High** — blocks |
| 6 | Resource tagging/labeling | Check resources have required tags (environment, team, cost-center per project conventions) | **Low** — suggests |
| 7 | Destroy protection on critical resources | Check for `prevent_destroy` or equivalent on databases, storage, state buckets | **Medium** — warns |
| 8 | Module versioning | Verify module sources use pinned versions, not `latest` or unversioned refs | **Medium** — warns |

**Confidence scoring:**
- **High** (checks 1, 2, 4, 5): Deterministic — validation either passes or fails, wildcards either exist or don't. Failure blocks approval.
- **Medium** (checks 3, 7, 8): Context-dependent — idempotency depends on existing state, destroy protection depends on resource criticality. Warns in review.
- **Low** (check 6): Organizational best practice. Noted but does not block.

**CoVe verification pattern:**
1. Identify the IaC tool from file extensions and stack config
2. Run the tool's native validation command
3. For security checks, grep for overly-permissive patterns
4. For state management, read backend configuration blocks
5. Compare findings against project conventions in `settings.yml` stack config
