---
status: completed
last_updated: 2026-03-28T06:30:26Z
depends_on: [unit-01-stack-schema]
branch: ai-dlc/operations-phase/03-builder-ops
discipline: backend
---

# unit-03-builder-ops

## Description

Expand the Builder hat to produce deployment artifacts, monitoring configuration, and operation scripts. The Builder currently produces code + tests. After this unit, it also produces IaC manifests, Dockerfiles, pipeline config, dashboard definitions, alert rules, SLO definitions, and self-contained operation scripts with deployment manifests — all driven by the unit's frontmatter blocks and the stack config.

## Domain Entities

- **Builder Hat** (`plugin/hats/builder.md`) — The hat definition that tells the builder agent what to do
- **Deployment Artifact** — Dockerfile, Helm chart, Terraform module, k8s manifest, pipeline workflow
- **Monitoring Config** — Dashboard JSON (Grafana/Datadog), alert rules (PrometheusRule/Datadog monitor), SLO definitions
- **Operation Script** — Self-contained script in project language, uses Anthropic SDK for AI reasoning
- **Operation Spec** — Markdown file with frontmatter describing the operation (type, schedule, trigger, owner)
- **Operation Manifest** — Deployment wrapper for an operation (k8s CronJob YAML, GitHub Actions workflow, Dockerfile)
- **Stack Config** — Read from settings to determine which providers/formats to generate for (from unit-01)
- **Backpressure Gate** — Existing concept, extended with DEPLOYABLE, OBSERVABLE, OPERATIONS_READY

## Technical Specification

### 1. Builder Hat Extension (`plugin/hats/builder.md`)

Add new phases after existing implementation phases. The Builder's steps become:

**Existing phases (unchanged):**
1. Review plan and criteria
2. Implement code incrementally
3. Use backpressure as guidance (tests, lint, types)
4. Document progress
5. Handle blockers (Node Repair Operator)

**New phases (when unit has ops frontmatter):**
6. **Deployment artifacts** — When unit has `deployment:` block in frontmatter:
   - Read `deployment.type` to determine what to produce
   - Read stack config to determine provider/format
   - Produce artifacts based on deployment type:

   | deployment.type | Artifacts |
   |---|---|
   | `service` | Dockerfile, health check endpoint, graceful shutdown, k8s Deployment+Service (or per stack), pipeline update |
   | `function` | Handler wrapper, deployment config (Lambda/Cloud Functions), pipeline update |
   | `static` | Build config, CDN/hosting config, pipeline update |
   | `job` | Entry point, retry logic, k8s Job/CronJob (or per stack), pipeline update |
   | `library` | Package config only (no deployment artifacts) |
   | `none` | Skip |

   - Run deployment validation gate: `deploy_validate` from quality gates (e.g., `terraform validate`, `docker build --check`)
   - Ensure CI/CD pipeline config handles the new artifact (update `.github/workflows/` or equivalent)

7. **Monitoring configuration** — When unit has `monitoring:` block in frontmatter:
   - Instrument the code with metric emissions based on `monitoring.metrics` array
   - Provider-specific instrumentation based on stack config monitoring provider:
     - `prometheus` → prom-client / prometheus_client
     - `datadog` → dd-trace / datadog-metrics
     - `otel` → @opentelemetry/sdk (language-appropriate SDK)
     - `none` → console.log-based metrics (still structured, just not shipped)
   - Generate dashboard definitions based on stack config monitoring provider:
     - `grafana` → JSON dashboard files
     - `datadog` → Datadog dashboard JSON
     - `cloudwatch` → CloudWatch dashboard config
     - `none` → Skip dashboard generation
   - Generate alert rules based on `monitoring.slos`:
     - Error budget burn rate alerts
     - Threshold alerts for each SLO indicator
   - Place all monitoring config in a `monitoring/` directory at project root (or per stack config)
   - Run observable validation: verify metric imports exist, dashboard JSON is valid

8. **Operation scripts** — When unit has `operations:` block in frontmatter:
   - For each operation entry, produce TWO files in `.ai-dlc/{intent}/operations/`:

   **a. Operation spec** (`{operation-name}.md`):
   ```markdown
   ---
   name: rotate-oauth-secrets
   type: scheduled
   schedule: "0 0 1 */3 *"
   owner: agent
   runtime: node           # from stack config or project language
   inputs:
     - SECRETS_MANAGER_ARN
     - OAUTH_PROVIDER
   outputs:
     - rotated_secret_id
     - rotation_timestamp
   ---

   ## Purpose
   {description from unit frontmatter}

   ## Success Criteria
   - [ ] New secret generated and stored
   - [ ] Old secret remains valid for 24h overlap
   - [ ] All services updated to use new secret
   - [ ] Smoke test passes with new credentials
   ```

   **b. Operation script** (`{operation-name}.{ext}`):
   - Language determined by `stack.operations.runtime` or project language detection
   - Self-contained — all dependencies explicit, no imports from project source
   - Uses Anthropic SDK for AI reasoning ONLY when needed (anomaly analysis, incident triage)
   - Standard I/O contract: env vars in, JSON stdout out, exit code for success/failure
   - Example structure (TypeScript):
   ```typescript
   #!/usr/bin/env npx tsx
   import Anthropic from "@anthropic-ai/sdk";
   // Deterministic work first
   // AI reasoning only when needed
   // JSON output on stdout
   ```

   **c. Operation deployment manifest** (`{operation-name}.deploy.{ext}`):
   - Generated based on `stack.operations.scheduled` and `stack.operations.reactive`:
     - `kubernetes-cronjob` → k8s CronJob YAML
     - `kubernetes-deployment` → k8s Deployment + Service YAML
     - `github-actions` → GitHub Actions workflow YAML
     - `docker-compose` → docker-compose service definition
     - `none` → Skip manifest (user deploys manually)

   - Run operations validation: script executes with `--dry-run` flag, manifest validates

### 2. New Backpressure Gates

Add to the Builder's backpressure check cycle:

- **DEPLOYABLE** — Checked when unit has `deployment:` block:
  - Deployment artifact exists and builds/validates successfully
  - Pipeline config updated to handle new artifact
  - Health check endpoint responds (for services)

- **OBSERVABLE** — Checked when unit has `monitoring:` block:
  - Metric instrumentation code exists (imports, emit calls)
  - Dashboard definition files exist and are valid JSON/YAML
  - Alert rules exist and reference correct metric names

- **OPERATIONS_READY** — Checked when unit has `operations:` block:
  - Operation spec files exist for each operation entry
  - Operation scripts exist and pass `--dry-run`
  - Deployment manifests exist (when stack config specifies a target)

These gates run alongside existing gates (tests, lint, types). All must pass before the Builder can mark the unit complete.

### 3. Builder Reference Extension (`plugin/hats/builder-reference.md`)

Add new reference sections:

- **Infrastructure Implementation**: How to write Terraform modules, Helm charts, k8s manifests. Provider-specific patterns.
- **Monitoring Instrumentation**: How to add metrics, create dashboards, define alerts per provider.
- **Operation Script Patterns**: How to write self-contained operation scripts. Anthropic SDK usage patterns. Standard I/O contract.
- **Deployment Manifest Templates**: Reference templates for each operation deployment target.

## Success Criteria

- [ ] Builder produces Dockerfile when `deployment.type: service` and stack has compute provider
- [ ] Builder produces IaC (terraform/helm/k8s) matching configured stack infrastructure/compute/packaging providers
- [ ] Builder updates CI/CD pipeline config when new deployable artifacts are introduced
- [ ] Builder instruments code with metrics matching `monitoring.metrics` array and configured monitoring provider
- [ ] Builder generates dashboard definitions matching configured monitoring provider format
- [ ] Builder generates alert rules based on `monitoring.slos`
- [ ] Builder produces operation spec + script + deployment manifest for each `operations:` entry
- [ ] Operation scripts are self-contained, use project language, follow standard I/O contract
- [ ] DEPLOYABLE gate passes: artifacts build/validate successfully
- [ ] OBSERVABLE gate passes: instrumentation exists, dashboards valid, alerts valid
- [ ] OPERATIONS_READY gate passes: specs exist, scripts pass dry-run, manifests validate
- [ ] Existing Builder behavior unchanged when unit has no deployment/monitoring/operations blocks

## Risks

- **Builder scope creep**: The Builder now produces many artifact types. Risk of confusion between feature code and operational artifacts. Mitigation: clear phase separation (existing code first, then deployment, then monitoring, then operations). Each phase has its own validation.
- **Provider-specific code generation**: Generating correct Terraform/Helm/k8s for every provider is complex. Mitigation: start with the most common patterns (Dockerfile, basic k8s manifests, GitHub Actions). Advanced providers (Terraform modules, Helm charts) can be added incrementally.
- **Operation script quality**: Generated scripts must actually work. Mitigation: dry-run validation gate, standard I/O contract, test in CI.

## Boundaries

This unit does NOT handle:
- Schema/config (unit-01)
- Elaboration (unit-02)
- Reviewer verification of artifacts (unit-04)
- Integration cross-unit validation (unit-05)
- Operate management interface (unit-06)
- Documentation (unit-07)

It only changes the Builder hat — defining HOW deployment/monitoring/operations artifacts are produced.

## Notes

- The Builder should check for existing deployment artifacts before creating new ones. If a Dockerfile already exists, don't overwrite it — extend or modify it.
- Operation scripts should have a `--dry-run` flag that validates without side effects. The OPERATIONS_READY gate uses this.
- For monitoring instrumentation, prefer OpenTelemetry when the stack config monitoring provider is `otel` — it's vendor-neutral and the most portable.
- The Builder hat doc is a large file. Consider whether the ops-specific phases should be in a separate section or integrated into the existing phase list. The existing design pattern (builder-reference.md for details, builder.md for core instructions) suggests putting the detailed provider-specific guidance in builder-reference.md and keeping builder.md focused on the phase list.
