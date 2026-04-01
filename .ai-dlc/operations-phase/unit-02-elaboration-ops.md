---
status: completed
last_updated: 2026-03-28T06:26:09Z
depends_on: [unit-01-stack-schema]
branch: ai-dlc/operations-phase/02-elaboration-ops
discipline: backend
---

# unit-02-elaboration-ops

## Description

Expand the elaboration skill to assess deployment, monitoring, and operational surface for each unit. This includes new clarification questions during Phase 2, operations-aware discovery during Phase 2.5, new frontmatter blocks for units (`deployment:`, `monitoring:`, `operations:`), auto-creation of infrastructure/observability units when scope warrants it, and enforcement of criteria categories by discipline.

## Domain Entities

- **Unit Frontmatter** — Extended with `deployment:`, `monitoring:`, `operations:` blocks
- **Criteria Categories** — Functional, Deployable, Observable, Operable — enforced per discipline using mapping from unit-01
- **Infrastructure Unit** — A unit with `discipline: infrastructure` that produces IaC, pipeline config, container build config
- **Observability Unit** — A unit with `discipline: observability` that produces dashboards, alerts, SLOs
- **Stack Config** — Read from settings to inform what providers are available (from unit-01)

## Technical Specification

### 1. Phase 2 Clarification: Operations Questions (`plugin/skills/elaborate/SKILL.md`)

After existing clarification questions, add operations-focused questions when the intent involves deployable services (not libraries/documentation):

```json
{
  "questions": [
    {
      "question": "How does this get deployed?",
      "header": "Deployment",
      "options": [
        {"label": "Existing service", "description": "Adds to an already-deployed service — no new deployment infra needed"},
        {"label": "New service", "description": "This is a new deployable service that needs its own container/function/IaC"},
        {"label": "Library/package", "description": "This is consumed as a dependency — no deployment"},
        {"label": "Static assets", "description": "Built and deployed as static files (CDN, S3, etc.)"}
      ]
    },
    {
      "question": "What monitoring is needed?",
      "header": "Monitoring",
      "options": [
        {"label": "Standard metrics", "description": "Latency, error rate, throughput — the basics"},
        {"label": "Custom business KPIs", "description": "Business metrics specific to this feature (conversion rate, DAU, etc.)"},
        {"label": "Full observability", "description": "Metrics + logs + traces + dashboards + alerts + SLOs"},
        {"label": "None needed", "description": "This doesn't need monitoring (library, docs, internal tool)"}
      ]
    }
  ]
}
```

Skip these questions when:
- All units are `discipline: design` or `discipline: documentation`
- The intent is pure refactoring with no deployment surface change
- Stack config is empty (`stack: {}`)

### 2. Phase 2.5 Discovery: Operations Context (`plugin/skills/elaborate/subskills/discover/SKILL.md`)

Add new discovery section headers for the discovery subagent to populate:

- `## Deployment Architecture: {service}` — How the service is currently deployed, what infrastructure exists
- `## Monitoring Setup: {service}` — What monitoring already exists, what metrics are emitted
- `## Operational Procedures: {area}` — Existing runbooks, on-call rotation, incident response
- `## CI/CD Pipeline: {service}` — Current pipeline configuration, deployment steps

The discovery subagent should explore these when:
- The project has Dockerfile, docker-compose.yml, k8s/, terraform/, helm/ directories
- The project has monitoring config (prometheus.yml, datadog.yaml, grafana/ dashboards)
- The project has CI/CD config (.github/workflows/, .gitlab-ci.yml, Jenkinsfile)

### 3. Phase 5 Decomposition: Operations Unit Creation (`plugin/skills/elaborate/SKILL.md`)

After decomposing feature units, assess whether the intent needs infrastructure/observability units:

**Auto-create infrastructure unit when:**
- Any feature unit answered "New service" for deployment
- The intent introduces a new deployable artifact that doesn't exist yet
- Stack config has infrastructure/compute providers configured

**Auto-create observability unit when:**
- Any feature unit answered "Full observability" or "Custom business KPIs"
- The intent introduces new metrics, SLOs, or KPIs
- Stack config has monitoring provider configured

**Fold into feature units when:**
- Only 1-2 feature units exist (small intent)
- The deployment surface is minimal (adding to existing service)
- No new infrastructure is needed

**DAG dependencies for auto-created units:**
- Feature units have no deployment dependency
- Infrastructure unit `depends_on` all feature units
- Observability unit `depends_on` infrastructure unit (if it exists) or all feature units

### 4. Unit Frontmatter: Operations Blocks

When a unit has deployment/monitoring/operations surface, the elaboration skill writes these blocks into the unit frontmatter:

```yaml
deployment:
  type: service           # service | library | static | function | job | none
  runtime: node           # inferred from codebase or stack config
  exposes:
    - port: 3001
      protocol: http
  dependencies:
    - postgres
    - redis

monitoring:
  metrics:
    - name: auth_login_success_total
      type: counter
      description: Successful login attempts
    - name: auth_login_latency_seconds
      type: histogram
      description: Login endpoint latency
  slos:
    - name: login-availability
      target: 99.9%
      window: 30d
      indicator: success_rate
    - name: login-latency
      target: p99 < 500ms
      window: 30d
  kpis:
    - name: daily-active-authenticated-users
      description: Users who successfully logged in today
      business_owner: product

operations:
  - type: scheduled
    name: rotate-secrets
    schedule: "0 0 1 */3 *"
    description: Rotate OAuth client secrets
  - type: reactive
    name: token-refresh-failure
    trigger: error_rate > 5%
    description: Flush token cache and restart service
  - type: process
    name: quarterly-access-review
    owner: human
    description: Review users with elevated OAuth scopes
```

These blocks are optional — only present when the unit has operational surface. A library unit or documentation unit would have none.

### 5. Criteria Category Enforcement

During Phase 4 (success criteria), use the discipline-to-category mapping from unit-01 to guide the user:

- Present the required categories for the unit's discipline
- Auto-suggest criteria templates per category:
  - **Deployable**: "Container builds successfully", "IaC validates", "Health check responds", "Pipeline config exists"
  - **Observable**: "Metrics instrumented for {X}", "Dashboard definition committed", "Alert rules committed", "SLOs defined"
  - **Operable**: "Operation scripts tested", "Runbook documented", "Graceful shutdown handles in-flight requests"
- Allow the user to skip non-required categories but warn if skipping recommended ones

### 6. Workflow Auto-Routing

Add auto-routing rules for new disciplines (alongside existing `discipline: design` → `workflow: design`):

- `discipline: infrastructure` → use `default` workflow (planner → builder → reviewer) with infrastructure-specific review agents
- `discipline: observability` → use `default` workflow with observability-specific review agents

No new workflow definitions needed — the existing `default` workflow handles these. The difference is in which review agents activate (controlled by unit discipline and frontmatter).

## Success Criteria

- [ ] Phase 2 asks deployment and monitoring questions when appropriate (skips for libraries/docs/design)
- [ ] Discovery subagent explores deployment architecture, monitoring setup, CI/CD pipeline, operational procedures
- [ ] Phase 5 auto-creates infrastructure unit when intent introduces new deployable services
- [ ] Phase 5 auto-creates observability unit when intent requires new monitoring
- [ ] Phase 5 folds ops concerns into feature units for small intents (1-2 units)
- [ ] Unit frontmatter supports `deployment:`, `monitoring:`, `operations:` blocks
- [ ] Phase 4 enforces criteria categories by discipline (Functional required for all, Deployable/Observable/Operable per mapping)
- [ ] Auto-routing works for infrastructure and observability disciplines
- [ ] Existing elaboration flow is unchanged for intents without deployment surface

## Risks

- **Over-questioning**: Too many operations questions for simple intents. Mitigation: skip when stack config is empty or intent has no deployment surface.
- **Unit bloat**: Auto-creating too many infra/observability units. Mitigation: scope-based auto-decision, fold for small intents.
- **Frontmatter complexity**: Operations blocks make unit files large. Mitigation: blocks are optional, only present when relevant.

## Boundaries

This unit does NOT handle:
- Schema/config changes (unit-01)
- Builder behavior for producing artifacts (unit-03)
- Reviewer behavior for verifying artifacts (unit-04)
- Integration validation (unit-05)
- Operate skill rewrite (unit-06)
- Documentation (unit-07)

It only changes the elaboration skill and elaborate-discover skill — defining WHAT needs to be built, not HOW to build it.

## Notes

- The `deployment.type` field is critical — it tells the Builder what kind of artifacts to produce. Make sure the elaboration skill infers this correctly from the user's answers.
- The `monitoring.metrics` array should use OpenTelemetry naming conventions where possible (dot-separated, lowercase).
- The `operations` array in frontmatter is a preview — the actual operation files (spec + script) are produced by the Builder in unit-03.
- Consider: should the elaboration skill read existing Dockerfile/k8s manifests to pre-populate the deployment block? This would make it smarter for established projects.
