---
status: completed
last_updated: 2026-03-28T08:23:20Z
depends_on: [unit-03-builder-ops]
branch: ai-dlc/operations-phase/04-reviewer-ops
discipline: backend
---

# unit-04-reviewer-ops

## Description

Expand the Reviewer hat to verify deployment artifacts, monitoring configuration, and operation scripts produced by the Builder. Add Deployment Safety and Observability Completeness as review agents that activate based on unit frontmatter. Extend the chain-of-verification pattern to include operational artifact validation.

## Domain Entities

- **Reviewer Hat** (`plugin/hats/reviewer.md`) — The hat definition for code review and verification
- **Reviewer Reference** (`plugin/hats/reviewer-reference.md`) — Detailed guidance for review agents
- **Review Agent** — A specialized subagent delegated by the Reviewer for domain-specific checks
- **Deployment Safety Agent** — Verifies deployment artifacts are safe, rollback-capable, zero-downtime
- **Observability Completeness Agent** — Verifies monitoring covers all critical paths, SLOs are sane
- **Infrastructure Correctness Agent** — Verifies IaC is valid, secure, follows best practices

## Technical Specification

### 1. Reviewer Hat Extension (`plugin/hats/reviewer.md`)

Extend the two-stage review with a third stage for operational artifacts:

**Existing stages (unchanged):**
- Stage 1: Spec Compliance — Does implementation satisfy criteria?
- Stage 2: Code Quality — Is code well-written, secure, performant?

**New stage:**
- Stage 3: **Operational Readiness** — Are deployment/monitoring/operations artifacts correct?
  - Only runs when unit has `deployment:`, `monitoring:`, or `operations:` blocks
  - Delegates to specialized agents based on which blocks are present

### 2. New Review Agents

**Deployment Safety Agent** (activates when unit has `deployment:` block):

Checks:
- Deployment artifact builds successfully (docker build, terraform plan, helm template)
- No secrets in deployment artifacts (no hardcoded credentials in Dockerfiles, manifests, IaC)
- Health check endpoint exists and responds correctly
- Graceful shutdown implemented (handles SIGTERM, drains connections)
- Rollback strategy documented (can the deployment be undone?)
- Resource limits defined (CPU/memory limits in k8s, concurrency in functions)
- Environment config externalized (no hardcoded URLs, ports, or environment-specific values)
- CI/CD pipeline updated to handle the new artifact
- Zero-downtime deployment possible (rolling update, blue-green, canary)

Scoring:
- High confidence (blocks): secrets in artifacts, no health check, no resource limits
- Medium confidence (warns): missing rollback docs, no graceful shutdown
- Low confidence (suggests): optimization opportunities, better resource sizing

**Observability Completeness Agent** (activates when unit has `monitoring:` block):

Checks:
- Every metric in `monitoring.metrics` is instrumented in code (import exists, emit call exists)
- Metric names follow conventions (OpenTelemetry naming, no typos, consistent labels)
- Dashboard definition references correct metric names (no dangling references)
- Alert rules reference correct metric names and thresholds make sense
- SLO definitions are achievable (target is realistic given the system design)
- SLO error budget burn rate alerts exist (not just threshold alerts)
- All critical code paths are instrumented (error handling, happy path, edge cases)
- KPIs are measurable from the instrumented metrics
- No orphaned metrics (metrics defined but never queried in dashboards/alerts)

Scoring:
- High confidence (blocks): missing instrumentation for defined metrics, broken dashboard references
- Medium confidence (warns): missing edge case instrumentation, overly aggressive SLO targets
- Low confidence (suggests): additional metrics, dashboard improvements

**Infrastructure Correctness Agent** (activates when unit has `discipline: infrastructure`):

Checks:
- IaC follows provider best practices (Terraform modules, resource naming, state management)
- Security groups/IAM roles follow least privilege
- No hardcoded values that should be variables
- State backend configured (for Terraform)
- Idempotent — running twice produces the same result
- Cost implications considered (resource sizing, reserved vs on-demand)

### 3. Review Delegation Logic (`plugin/hats/reviewer.md`)

Update the delegation decision tree:

```
When to delegate to ops agents:
- Unit has `deployment:` block → spawn Deployment Safety agent
- Unit has `monitoring:` block → spawn Observability Completeness agent
- Unit has `discipline: infrastructure` → spawn Infrastructure Correctness agent
- Always delegate for: infrastructure or observability discipline units
- Skip delegation for: units with no ops frontmatter blocks
```

These agents run IN ADDITION to existing agents (security, performance, architecture, etc.), not instead of them.

### 4. Chain-of-Verification Extension

Extend the existing CoVe pattern for operational artifacts:

1. **Initial assessment**: Read deployment/monitoring/operations artifacts
2. **Generate verification questions**:
   - "Does the Dockerfile build successfully?" → Run `docker build`
   - "Do the k8s manifests validate?" → Run `kubectl apply --dry-run=client`
   - "Are all metrics in the dashboard?" → Compare metric names
   - "Does the operation script execute?" → Run with `--dry-run`
3. **Answer with evidence**: Execute verification commands, compare outputs
4. **Revise judgment**: If evidence differs from initial assessment, update findings

### 5. Reviewer Reference Extension (`plugin/hats/reviewer-reference.md`)

Add detailed specifications for each new review agent:

- Deployment Safety agent: what to check, how to verify, common failure patterns
- Observability Completeness agent: metric naming conventions, dashboard design principles, SLO math
- Infrastructure Correctness agent: IaC best practices per provider, security patterns

### 6. Review Agent Activation via Settings

The new agents respect the `review_agents` config in settings.yml:

```yaml
review_agents:
  deployment_safety: true      # default: false
  observability_completeness: true  # default: false
  infrastructure_correctness: true  # default: false
```

When `false`, the agent doesn't run even if the unit has relevant frontmatter. This lets teams opt-in gradually.

**However**, when a unit has `discipline: infrastructure` or `discipline: observability`, the corresponding agent activates regardless of settings — infrastructure units MUST have deployment safety review.

## Success Criteria

- [ ] Reviewer Stage 3 (Operational Readiness) runs when unit has ops frontmatter blocks
- [ ] Deployment Safety agent verifies: artifact builds, no secrets, health check, graceful shutdown, resource limits, pipeline updated
- [ ] Observability Completeness agent verifies: all metrics instrumented, dashboard references valid, alert rules reference correct metrics, SLOs achievable
- [ ] Infrastructure Correctness agent verifies: IaC follows best practices, least privilege, idempotent, state backend configured
- [ ] Chain-of-Verification extended: verification commands run for operational artifacts
- [ ] Review agents score findings by confidence (High blocks, Medium warns, Low suggests)
- [ ] Review agents respect settings.yml config (can be disabled per project)
- [ ] Infrastructure/observability discipline units always get their corresponding review agent regardless of settings
- [ ] Existing review behavior unchanged for units without ops frontmatter

## Risks

- **False positives**: Ops review agents may flag things incorrectly for unusual deployment patterns. Mitigation: confidence scoring, user can disable agents via settings.
- **Verification command failures**: Docker build or terraform plan may fail in CI-only environments. Mitigation: agent checks if commands are available before running, falls back to static analysis.

## Boundaries

Does NOT handle: schema (unit-01), elaboration (unit-02), builder artifact production (unit-03), integration validation (unit-05), operate (unit-06), docs (unit-07).

## Notes

- The Reviewer hat doc is already large. Keep ops-specific details in reviewer-reference.md, not in the main reviewer.md.
- Review agent prompts should be focused — each agent gets ONLY the artifacts relevant to its domain (deployment agent doesn't see monitoring config and vice versa).
- Consider: should the Reviewer block approval if no deployment artifacts exist but the unit has `deployment:` block? Yes — this is a hard gate. The Builder must produce them.
