---
status: completed
last_updated: 2026-03-28T08:54:14Z
depends_on: [unit-02-elaboration-ops, unit-03-builder-ops, unit-04-reviewer-ops, unit-05-integration-ops, unit-06-operate-rewrite]
branch: ai-dlc/operations-phase/07-docs-paper
discipline: documentation
---

# unit-07-docs-paper

## Description

Update the 2026 paper's Operations section, website documentation, and any existing docs that reference the current workflow to reflect the complete Operations phase implementation. This unit runs last because it documents what was built in units 01-06.

## Technical Specification

### 1. Paper Update (`website/content/papers/ai-dlc-2026.md`)

Update the Operations Phase section (lines ~1116-1167) to reflect the implementation:

**Current paper content:**
- Conceptual deployment description (AI packages → staging → human approval → production)
- Observability overview (metrics, logs, traces)
- Autonomous operations boundaries YAML example
- Brief anomaly response description

**Updated paper content should include:**
- Stack config concept (multi-provider infrastructure description)
- Deployment artifacts as Builder output (alongside code and tests)
- Four completion criteria categories: Functional, Deployable, Observable, Operable
- Operation scripts as self-contained, deployment-agnostic programs
- CI/CD deploys — agent produces artifacts, pipeline deploys
- Monitoring as code: dashboards, alerts, SLOs committed to repo
- KPIs connecting technical work to business outcomes
- `/operate` as management interface
- Updated workflow diagram showing operations integration
- Updated autonomous_actions YAML example reflecting actual implementation

Also update:
- The workflow diagram (lines ~1170-1190) to show the full 10-step flow with operations
- The "Example Scenario" section (lines ~1300+) to include operations phase steps
- Any references to "the workflow currently ends after Construction" or similar

### 2. Website Documentation (`website/content/docs/`)

**New pages:**

a. **Operations Guide** (`guide-operations.md`):
   - What the operations phase is and when it kicks in
   - How to configure `stack:` in settings.yml
   - How to define operational requirements during elaboration
   - How the Builder produces deployment/monitoring/operations artifacts
   - How the Reviewer verifies them
   - How to use `/operate` to manage operations
   - Example walkthrough: from elaboration through deployed operations

b. **Stack Config Reference** (`reference-stack-config.md`):
   - Every stack layer and its providers
   - Configuration examples for common stacks:
     - Simple: docker-compose + GitHub Actions
     - Medium: Kubernetes + Helm + GitHub Actions + Prometheus
     - Complex: Terraform + Kubernetes + Helm + Datadog + PagerDuty
   - How to configure per-intent and per-unit overrides

c. **Operation File Schema** (`reference-operations.md`):
   - Operation spec format (frontmatter + body)
   - Operation script contract (env vars in, JSON out, exit code)
   - Operation types: scheduled, reactive, process, ad-hoc
   - Deployment manifest formats per target
   - Examples for each type

**Updated pages:**

d. Update **concepts.md** — Add operations concepts (stack config, criteria categories, operational surface)

e. Update **workflows.md** — Show how infrastructure/observability disciplines integrate into the workflow

f. Update **guide-developer.md** — Add sections on:
   - How to elaborate units with operational requirements
   - How to review deployment artifacts
   - How to use `/operate` commands

### 3. Existing Doc Updates

Scan all docs for references to the current workflow that imply it ends at integration/PR:
- Any reference to "intent complete" should note that operations may follow
- Any reference to completion criteria should mention the four categories
- Any workflow diagrams should show the operations step

## Success Criteria

- [ ] Paper Operations section (lines 1116-1167) updated with implementation details
- [ ] Paper workflow diagram includes operations step
- [ ] Paper example scenario includes operations phase
- [ ] Operations guide page exists with full walkthrough
- [ ] Stack config reference page exists with examples for simple/medium/complex stacks
- [ ] Operation file schema reference exists with format docs and examples
- [ ] Existing docs updated to reference operations where relevant
- [ ] No doc references imply the workflow ends at integration/PR without mentioning operations

## Risks

- **Paper tone**: The paper is academic/methodological. Implementation details must be presented as methodology, not as plugin documentation. Mitigation: keep paper high-level, put implementation details in website docs.
- **Scope creep**: Documentation could expand endlessly. Mitigation: focus on what a user needs to get started — config, elaboration, and /operate. Advanced topics can come later.

## Boundaries

Does NOT handle: any code/schema changes. Only documentation.

## Notes

- The paper uses Mermaid diagrams. Update them in the same format.
- Website uses Next.js 15 App Router with static export. Check the content structure before adding new pages.
- Keep a changelog entry for the Operations phase implementation — this is a significant feature.
