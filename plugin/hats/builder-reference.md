# Builder Reference

Companion to the Builder hat. Loaded on-demand for design implementation guidance and detailed procedures.

## Design Implementation Guidance

When working with designs from design tools (Figma, Sketch, Adobe XD, etc.):

- **Download assets when possible.** Use design tool APIs or MCP tools to export images, icons, and SVGs for analysis rather than relying on visual inspection alone.
- **Match colors to named tokens, not raw values.** When extracting colors from designs, do NOT guess hex codes. Instead, match them to the project's existing color system — brand colors, design tokens, CSS custom properties, theme variables, or framework-level color names (e.g., `--color-primary`, `theme.colors.brand.500`, `text-blue-600`). Search the codebase for the color system first.
- **Legacy tools requiring browser inspection**: If you must use Chrome/browser to inspect a design tool that lacks API access, take extra care with color extraction. Cross-reference every color against the project's defined palette. If a color doesn't match any existing token, flag it — don't invent a new one.
- **Distinguish design annotations from UI elements.** Designers often annotate mockups with callouts, arrows, measurement labels, sticky notes, and text blocks that describe UX behavior or implementation details. These annotations are **guidance for you, not part of the design to implement.** Look for: redline measurements, numbered callouts, text outside the frame/artboard, comment threads, and annotation layers. Treat them as implementation instructions — extract and follow the guidance, but do not render them as UI elements.

## Visual Fidelity Feedback

When the reviewer issues REQUEST CHANGES with visual fidelity findings, use this process to resolve them:

### Reading the Comparison Report

1. Open `.ai-dlc/{intent}/screenshots/{unit}/comparison-report.md`
2. Check the `verdict:` field in frontmatter — FAIL means high-severity issues exist
3. Read the **High Severity** section first — these are blocking

### Understanding Findings

Each finding includes:

- **category** — What aspect failed (layout, color, typography, states, responsive, flow)
- **severity** — high (blocking), medium (should fix), low (suggestion)
- **reference_detail** — What the design reference shows
- **actual_detail** — What your built output shows
- **suggestion** — How to fix it

### Comparing Screenshots

- Reference screenshots: `.ai-dlc/{intent}/screenshots/{unit}/ref-*.png` — the design intent
- Built screenshots: `.ai-dlc/{intent}/screenshots/{unit}/*.png` (without ref- prefix) — what you produced
- Use the Read tool to view both images side by side and understand the gap
- Focus on the specific `location` mentioned in each finding

### Fixing Visual Issues

1. Fix all high-severity findings first
2. Address medium-severity findings if straightforward
3. Low-severity findings are optional suggestions
4. After fixing, the visual gate will re-run automatically on the next review cycle
5. Do NOT modify reference screenshots — they represent the design intent

### Fidelity Awareness

The fidelity level determines what counts as a failure:

- **high** — Colors, typography, spacing, and layout must closely match
- **medium** — Structural similarity required; minor styling differences are acceptable
- **low** — Only structure and layout matter; colors and typography will differ (wireframe reference)

If a finding seems incorrect given the fidelity level, note it in your commit message for the reviewer.

## Provider Sync Details

- If a `ticket` field exists in the current unit's frontmatter, **SHOULD** update the ticket status to **In Progress** using the ticketing provider's MCP tools
- If the unit is completed successfully, **SHOULD** update the ticket to **Done**
- If the unit is blocked, **SHOULD** flag the ticket as **Blocked** and add the blocker description as a comment
- If MCP tools are unavailable, skip silently — never block building on ticket updates

## Infrastructure & Deployment Implementation

### Dockerfiles

- **Node.js**: Multi-stage build — `node:XX-alpine` for build, `node:XX-alpine` for run. Copy only `package.json` + lockfile first for layer caching, then `COPY . .`. Use `--production` or prune devDependencies.
- **Python**: Multi-stage — builder installs deps into a virtualenv, runtime copies the venv. Pin base image digests for reproducibility.
- **Go**: Build stage uses `golang:XX`, runtime uses `scratch` or `gcr.io/distroless/static`. Statically link with `CGO_ENABLED=0`.
- Always include a `.dockerignore` (node_modules, .git, .env, test/).
- Always add a `HEALTHCHECK` instruction for service-type deployments.

### Kubernetes Manifests

- Read compute provider via `get_stack_layer "compute"` — if `kubernetes`, produce Deployment + Service + Ingress.
- Set resource requests/limits based on deployment type (service vs job).
- Include readiness and liveness probes for services.
- Use `envFrom` with ConfigMap/Secret refs rather than inline env vars.
- For jobs, set `restartPolicy: OnFailure`, `backoffLimit: 3`, and `activeDeadlineSeconds`.

### Terraform / IaC Modules

- Read infrastructure provider via `get_stack_layer "infrastructure"`.
- `terraform` → produce `.tf` files in the scope directory from stack config.
- `cloudformation` → produce CloudFormation YAML templates.
- `pulumi` → produce Pulumi program in project language.
- Always output resource identifiers (ARN, ID, URL) for downstream consumption.
- Use variables/parameters for environment-specific values (region, account, instance size).

### Helm Charts

- Read packaging provider via `get_stack_layer "packaging"`.
- `helm` → produce Chart.yaml, values.yaml, and templates/ in the charts directory from stack config.
- Templatize image tag, replica count, resource limits, and environment variables.
- Include helpers template (`_helpers.tpl`) for name/label generation.

### CI/CD Pipeline Updates

- Read pipeline provider via `get_stack_layer "pipeline"`.
- `github-actions` → add or update workflow YAML in `.github/workflows/`.
- `gitlab-ci` → add stages/jobs to `.gitlab-ci.yml`.
- Pipeline must build container (if applicable), run deploy_validate gate, and push/deploy artifacts.
- Use environment-specific steps (staging vs production) where deployment config specifies environments.

## Monitoring Instrumentation

### Adding Metrics by Provider

- **Prometheus** (`prom-client` / `prometheus_client`): Create Counter, Histogram, Gauge objects. Expose `/metrics` endpoint. Use `{service}_{subsystem}_{name}_{unit}` naming.
- **Datadog** (`dd-trace` / `datadog-metrics`): Use `dogstatsd` client. Prefix metrics with service name. Tag with `env`, `service`, `version`.
- **OpenTelemetry** (`@opentelemetry/sdk`): Create Meter, register instruments. Configure OTLP exporter. Works across languages — use language-appropriate SDK.
- **CloudWatch** (AWS SDK): Use `putMetricData` with namespace matching service. Batch metric submissions. Use dimensions for environment/service slicing.
- **New Relic** (New Relic SDK): Use custom events and metrics API. Set `NEW_RELIC_APP_NAME` and `NEW_RELIC_LICENSE_KEY` from secrets.
- **None**: Emit structured JSON logs to stdout with `metric_name`, `value`, `labels`, `timestamp` fields.

### Dashboard Definitions

- **Prometheus/Grafana**: JSON dashboard model with panels. Use `${DS_PROMETHEUS}` datasource variable for portability.
- **Datadog**: JSON dashboard definition using Datadog Dashboard API schema. Group widgets by service area.
- **CloudWatch**: CloudFormation dashboard body JSON or AWS SDK `putDashboard` payload.
- **Layout patterns**: Use RED method (Rate, Errors, Duration) for request-driven services. Use USE method (Utilization, Saturation, Errors) for resource-driven services.
- Place dashboard files in `monitoring/dashboards/` (or stack config path).

### Alert Rules & SLOs

- Derive alert thresholds from `monitoring.slos` in unit frontmatter.
- **Error budget burn rate**: For a 99.9% SLO, alert when 1h burn rate exceeds 14.4x (page) or 6h burn rate exceeds 6x (ticket).
- **Threshold alerts**: Convert SLO targets to concrete thresholds (e.g., p99 latency < 500ms).
- Read alerting provider via `get_stack_layer "alerting"` for routing (PagerDuty service key, Opsgenie team, etc.).
- Alert definitions go in `monitoring/alerts/` (or stack config path).
- Every alert MUST have: summary, description, severity, runbook link placeholder.

## Operation Script Patterns

### Standard I/O Contract

All operation scripts follow a uniform interface:

- **Input**: Environment variables (secrets, config) + CLI flags (--dry-run, --verbose)
- **Output**: JSON to stdout with structure: `{ "status": "success|failure", "data": {...}, "errors": [...] }`
- **Exit code**: 0 = success, 1 = failure, 2 = dry-run passed
- **Logging**: stderr only (never pollute stdout JSON)

### `--dry-run` Flag Implementation

Every operation script MUST support `--dry-run`:

```
# Pattern (any language):
1. Parse --dry-run from argv
2. Execute all read operations normally
3. For write/mutate operations: log what WOULD happen, skip execution
4. Exit with code 2 to signal "dry-run passed"
```

This enables the OPERATIONS_READY gate to validate scripts without side effects.

### Anthropic SDK Usage

Operation scripts MAY use the Anthropic SDK for AI-assisted reasoning:

- **When to use**: Anomaly analysis, incident triage, log summarization, capacity recommendations
- **When NOT to use**: Simple CRUD operations, scheduled cleanups, data migrations
- Import Anthropic SDK directly — do NOT import from project source
- Always handle API errors gracefully (rate limits, network failures)
- Set `ANTHROPIC_API_KEY` via environment variable from secrets provider

### Self-Containment Rules

- Operation scripts MUST NOT import from project source (`../src/`, `../../lib/`, etc.)
- Dependencies are vendored or installed via the script's own package manifest
- Scripts declare their own `package.json` / `requirements.txt` / `go.mod` as needed
- This ensures operations work even when deployed separately from the main application

### Language-Specific Patterns

- **TypeScript** (`.ts`): Use `tsx` or `ts-node` shebang. Parse args with `process.argv`. Use `fetch` for HTTP.
- **Python** (`.py`): Use `argparse` for CLI. Use `requests` or `httpx` for HTTP. Use `json.dumps` for output.
- **Go** (`.go`): Use `flag` package. Print JSON to stdout with `encoding/json`. Build as static binary.
- **Shell** (`.sh`): Use `getopts` for flags. Use `jq` for JSON output. Set `set -euo pipefail`.

### Deployment Manifest Templates (Two-Phase)

Operation deployment manifests follow a two-phase workflow:

1. **Build time (Builder hat):** The builder creates template/stub manifests in `.ai-dlc/{intent}/operations/deploy/` using type-specific filenames (`{name}.cronjob.yaml`, `{name}.deployment.yaml`, `{name}.workflow.yaml`, `{name}.compose.yaml`, `{name}.service`/`.timer`). These templates are the validation target for the OPERATIONS_READY gate — they must exist and pass structural validation for the gate to pass.

2. **Deploy time (`/operate --deploy`):** The operate skill regenerates production-ready manifests in the same `operations/deploy/` location, replacing the builder templates with fully resolved manifests that incorporate stack config, registry paths, and runtime parameters.

**Manifest format by target:**

- **Kubernetes CronJob**: Schedule from operation spec, image from container registry, env from secrets.
- **GitHub Actions workflow**: `workflow_dispatch` + `schedule` triggers. Use `actions/checkout` minimally (operations are self-contained).
- **Docker Compose service**: Long-running for reactive handlers, one-shot for scheduled tasks via `docker compose run`.
- **None**: Skip manifest generation — script runs manually or via external scheduler.
