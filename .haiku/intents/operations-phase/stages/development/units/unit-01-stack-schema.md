---
name: unit-01-stack-schema
type: backend
status: completed
inputs: ["knowledge/DISCOVERY.md"]
depends_on: []
bolt: 0
hat: ""
started_at: 2026-03-28T06:11:46Z
completed_at: 2026-03-28T06:11:46Z
---


# unit-01-stack-schema

## Description

Define the `stack:` configuration schema and extend the settings system to support multi-provider infrastructure descriptions. This is the foundation unit — every other unit reads from this schema to know what deployment, monitoring, and operations providers the user has configured.

## Domain Entities

- **Stack Config** — New top-level key in `.ai-dlc/settings.yml` describing the user's deployment infrastructure
- **Stack Layer** — One of: infrastructure, compute, packaging, pipeline, secrets, monitoring, alerting, operations
- **Provider Entry** — A configured provider within a layer (e.g., `provider: terraform` under `infrastructure`)
- **Completion Criteria Category** — The four categories (Functional, Deployable, Observable, Operable) and their discipline mappings
- **Quality Gate** — Existing concept extended with deployment-specific gates (terraform_plan, helm_template, docker_build, manifest_validate)

## Technical Specification

### 1. Settings Schema Extension (`plugin/schemas/settings.schema.json`)

Add `stack` definition alongside existing `git`, `providers`, `quality_gates`:

```yaml
stack:
  infrastructure:
    - provider: terraform    # terraform | cloudformation | pulumi | none
      scope: networking, databases, storage, iam
      state_backend: s3
  compute:
    - provider: kubernetes   # kubernetes | ecs | lambda | docker-compose | none
      managed_by: terraform  # or standalone
      registry: ghcr.io/org
  packaging:
    - provider: helm         # helm | kustomize | raw-manifests | none
      charts_dir: deploy/charts/
  pipeline:
    - provider: github-actions  # github-actions | gitlab-ci | jenkins | circleci | none
      workflows_dir: .github/workflows/
  secrets:
    - provider: vault        # vault | aws-sm | gcp-sm | env | none
  monitoring:
    - provider: datadog      # prometheus | datadog | cloudwatch | newrelic | otel | none
      dashboards: true
      alerts: true
      slos: true
  alerting:
    - provider: pagerduty    # pagerduty | opsgenie | datadog | prometheus-alertmanager | none
      routing: by-service-owner
  operations:
    runtime: node            # node | python | go | shell — language for operation scripts
    scheduled: kubernetes-cronjob    # how scheduled ops deploy
    reactive: kubernetes-deployment  # how reactive ops deploy
```

Each layer is an array (supporting multiple providers per layer — e.g., Terraform for infra AND Kubernetes for compute within Terraform). All layers are optional. An empty `stack: {}` means "I handle deployment myself."

### 2. New Review Agents (`plugin/schemas/settings.schema.json`)

Add to `review_agents`:
- `deployment_safety`: boolean, default false — activates for units with deployment surface
- `observability_completeness`: boolean, default false — activates for units with monitoring requirements
- `infrastructure_correctness`: boolean, default false — activates for infrastructure-discipline units

### 3. New Quality Gates (`plugin/schemas/settings.schema.json`)

Extend `quality_gates` with deployment-specific gates:
- `deploy_validate`: command for validating deployment artifacts (e.g., `terraform validate && terraform plan -detailed-exitcode`)
- `container_build`: command for building containers (e.g., `docker build -t test .`)
- `manifest_validate`: command for validating k8s manifests (e.g., `kubectl apply --dry-run=client -f k8s/`)

### 4. Config Loading Extension (`plugin/lib/config.sh`)

Extend the existing config loading functions to:
- Load `stack` config from settings.yml
- Export stack config as environment variables for hooks and subagents
- Provide helper functions: `get_stack_layer()`, `has_stack_provider()`, `get_operations_runtime()`
- Maintain the existing 3-tier precedence: unit frontmatter > intent settings > global settings

### 5. Discipline-to-Criteria Category Mapping

Define which completion criteria categories are required per discipline:

| Discipline | Functional | Deployable | Observable | Operable |
|---|---|---|---|---|
| backend (service) | Required | Required | Required | Required |
| backend (library) | Required | - | - | - |
| frontend | Required | Required | Optional | Optional |
| api | Required | Required | Required | Optional |
| infrastructure | - | Required | Required | Required |
| observability | - | - | Required | Required |
| design | Required | - | - | - |
| documentation | Required | - | - | - |
| devops | - | Required | - | Required |

This mapping is used by elaboration to enforce the right criteria categories per unit.

## Success Criteria

- [x] `stack:` key defined in settings schema with all 8 layers, each supporting array of provider entries
- [x] Schema validates: empty stack, single-provider stack, multi-provider stack (e.g., terraform + kubernetes)
- [x] New review agents (`deployment_safety`, `observability_completeness`, `infrastructure_correctness`) added to schema with defaults
- [x] New quality gates (`deploy_validate`, `container_build`, `manifest_validate`) added to schema
- [x] Config loading functions extended: `get_stack_layer()`, `has_stack_provider()`, `get_operations_runtime()` work correctly
- [x] Discipline-to-criteria-category mapping defined and accessible to elaboration
- [x] Existing settings files validate against updated schema without changes (backward compatible)

## Risks

- **Schema complexity**: Stack config has many layers and providers. Risk of over-engineering. Mitigation: all layers are optional, empty `stack: {}` is valid.
- **Breaking existing settings**: Schema changes must not invalidate existing `.ai-dlc/settings.yml` files. Mitigation: all new fields are optional with sensible defaults.

## Boundaries

This unit does NOT handle:
- Elaboration changes (unit-02)
- Builder behavior changes (unit-03)
- Reviewer behavior changes (unit-04)
- Integration changes (unit-05)
- Operate skill rewrite (unit-06)
- Documentation (unit-07)

It only defines the schema and config loading — the foundation other units build on.

## Notes

- Follow the existing pattern in `settings.schema.json` for provider definitions (see `ticketingProviderEntry`, `designProviderEntry`)
- The `operations.runtime` field determines what language Builder uses for operation scripts. It should be detectable from the project if not configured (check package.json, setup.py, go.mod, etc.)
- Consider whether stack config should support per-intent overrides (intent-level settings.yml) — the existing 3-tier precedence pattern already handles this
