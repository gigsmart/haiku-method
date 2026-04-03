---
title: Stack Configuration Reference
description: Reference for .ai-dlc/settings.yml stack layers — infrastructure, compute, packaging, pipeline, secrets, monitoring, alerting, and operations
order: 8
---

The stack configuration describes your project's infrastructure in `.ai-dlc/settings.yml` under the `stack:` key. AI-DLC uses this configuration to generate deployment manifests, validate operations, and tailor advice to your environment.

All layers are optional. An empty stack (`stack: {}`) is valid — AI-DLC will infer what it can from project files.

## Layer Reference

### Infrastructure

Defines how infrastructure is provisioned.

```yaml
stack:
  infrastructure:
    - provider: terraform  # terraform | cloudformation | pulumi
      state_backend: s3
      modules_path: infra/modules/
```

**Providers:** `terraform`, `cloudformation`, `pulumi`

### Compute

Defines where workloads run.

```yaml
stack:
  compute:
    - provider: kubernetes  # kubernetes | ecs | lambda | docker-compose
      cluster: production
      namespace: default
```

**Providers:** `kubernetes`, `ecs`, `lambda`, `docker-compose`

### Packaging

Defines how applications are packaged for deployment.

```yaml
stack:
  packaging:
    - provider: helm  # helm | kustomize | raw
      charts_path: deploy/charts/
```

**Providers:** `helm`, `kustomize`, `raw`

### Pipeline

Defines CI/CD pipeline configuration.

```yaml
stack:
  pipeline:
    - provider: github-actions  # github-actions | gitlab-ci | jenkins | circleci
      workflows_path: .github/workflows/
```

**Providers:** `github-actions`, `gitlab-ci`, `jenkins`, `circleci`

### Secrets

Defines secrets management.

```yaml
stack:
  secrets:
    - provider: vault  # vault | aws-sm | gcp-sm | env
      path: secret/data/app
```

**Providers:** `vault`, `aws-sm`, `gcp-sm`, `env`

### Monitoring

Defines observability stack.

```yaml
stack:
  monitoring:
    - provider: prometheus  # prometheus | datadog | cloudwatch | newrelic | otel
      endpoint: http://prometheus:9090
```

**Providers:** `prometheus`, `datadog`, `cloudwatch`, `newrelic`, `otel`

### Alerting

Defines alerting and incident management.

```yaml
stack:
  alerting:
    - provider: pagerduty  # pagerduty | opsgenie | datadog | alertmanager
      service_id: P123ABC
```

**Providers:** `pagerduty`, `opsgenie`, `datadog`, `alertmanager`

### Operations

Defines the operations runtime and configuration.

```yaml
stack:
  operations:
    runtime: node  # node | python | go | shell
    scheduled:
      - name: cleanup
        schedule: "0 3 * * *"
        command: node scripts/cleanup.js
    reactive:
      - name: alert-handler
        trigger: webhook
        command: node scripts/handle-alert.js
```

**Runtimes:** `node`, `python`, `go`, `shell`

When `runtime` is not specified, AI-DLC auto-detects from project files:
- `package.json` → `node`
- `pyproject.toml` or `requirements.txt` → `python`
- `go.mod` → `go`
- Default → `shell`

## Examples

### Simple — Solo Developer

A minimal setup with just CI and basic monitoring:

```yaml
stack:
  pipeline:
    - provider: github-actions
  monitoring:
    - provider: datadog
```

### Medium — Small Team

A typical team setup with container orchestration, CI, monitoring, and operations:

```yaml
stack:
  compute:
    - provider: kubernetes
      cluster: staging
      namespace: app
  pipeline:
    - provider: github-actions
      workflows_path: .github/workflows/
  monitoring:
    - provider: prometheus
      endpoint: http://prometheus:9090
  alerting:
    - provider: pagerduty
      service_id: P456DEF
  operations:
    runtime: node
    scheduled:
      - name: cleanup
        schedule: "0 3 * * *"
        command: node scripts/cleanup.js
```

### Complex — Enterprise

A fully populated stack for a large-scale production environment:

```yaml
stack:
  infrastructure:
    - provider: terraform
      state_backend: s3
      modules_path: infra/modules/
  compute:
    - provider: kubernetes
      cluster: prod-us-east-1
      namespace: platform
  packaging:
    - provider: helm
      charts_path: deploy/charts/
  pipeline:
    - provider: github-actions
      workflows_path: .github/workflows/
  secrets:
    - provider: vault
      path: secret/data/platform
  monitoring:
    - provider: otel
      endpoint: http://otel-collector:4317
  alerting:
    - provider: pagerduty
      service_id: P789GHI
  operations:
    runtime: node
    scheduled:
      - name: cleanup
        schedule: "0 3 * * *"
        command: node scripts/cleanup.js
    reactive:
      - name: alert-handler
        trigger: webhook
        command: node scripts/handle-alert.js
```

## Next Steps

- **[Operations Guide](/docs/operations-guide/)** — Walkthrough of the operations phase
- **[Operation File Reference](/docs/operation-schema/)** — Schema reference for operation spec files
