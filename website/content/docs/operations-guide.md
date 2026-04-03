---
title: Operations Guide
description: Complete walkthrough of the AI-DLC operations phase — defining, executing, deploying, and monitoring operational tasks
order: 7
---

The Operations Phase manages ongoing work after construction completes. Instead of treating operations as an external concern, AI-DLC models operational tasks as spec files that live alongside the code they support.

## What Is the Operations Phase?

After an intent's construction and integration are complete, many features require ongoing maintenance: scheduled jobs, reactive responses to production events, or periodic human reviews. The operations phase provides a structured way to define, execute, deploy, and track these tasks using the same file-based approach as the rest of AI-DLC.

Operations are Markdown files with YAML frontmatter stored in `.ai-dlc/{intent}/operations/`. Each file defines a single operational task — what it does, when it runs, and who owns it.

## Quick Start

**1. Create an operation spec:**

```markdown
<!-- .ai-dlc/my-intent/operations/rotate-secrets.md -->
---
name: rotate-secrets
type: scheduled
owner: agent
schedule: "0 0 1 * *"
runtime: node
---

Rotate API keys and database credentials monthly.

1. Generate new credentials via provider API
2. Update secrets store
3. Verify connectivity with new credentials
4. Revoke old credentials
```

**2. Run the operation:**

```
/ai-dlc:operate my-intent rotate-secrets
```

**3. Check status:**

```
/ai-dlc:operate my-intent --status
```

## Defining Operations

### File Location

Operation specs live in `.ai-dlc/{intent}/operations/{name}.md`. The filename (minus `.md`) is the operation's identifier.

### Operation Types

**Scheduled** — Runs on a cron schedule. Use for periodic maintenance like secret rotation, cache warming, or report generation.

```yaml
---
name: warm-cache
type: scheduled
owner: agent
schedule: "*/30 * * * *"
---
```

**Reactive** — Fires in response to a trigger condition. Use for auto-scaling, rollbacks, certificate renewal, or incident response.

```yaml
---
name: scale-on-load
type: reactive
owner: agent
trigger: "p99_latency > 200ms for 5m"
---
```

**Process** — Runs on a human cadence (weekly, quarterly, etc.). Use for reviews, audits, capacity planning, or compliance checks.

```yaml
---
name: quarterly-security-review
type: process
owner: human
frequency: quarterly
---
```

### Ownership Models

**Agent-owned** operations have companion scripts (`.ts`, `.py`, `.go`, or `.sh`) that AI executes autonomously. The Markdown body describes what the script does.

**Human-owned** operations use a checklist in the Markdown body. When invoked via `/ai-dlc:operate`, AI presents the checklist and tracks completion, but humans perform the actual work.

```markdown
---
name: capacity-review
type: process
owner: human
frequency: monthly
---

- [ ] Review resource utilization dashboards
- [ ] Check storage growth trends
- [ ] Evaluate scaling headroom
- [ ] Update capacity forecast spreadsheet
- [ ] File tickets for any needed scaling
```

## Running Operations

### List All Operations

```
/ai-dlc:operate
```

Shows all operations across all intents with their type, owner, and status.

### View Intent Operations

```
/ai-dlc:operate my-intent
```

Displays a status table for one intent:

```
┌──────────────────┬───────────┬───────┬──────────────┐
│ Operation        │ Type      │ Owner │ Status       │
├──────────────────┼───────────┼───────┼──────────────┤
│ rotate-secrets   │ scheduled │ agent │ on-track     │
│ scale-on-load    │ reactive  │ agent │ on-track     │
│ capacity-review  │ process   │ human │ pending      │
└──────────────────┴───────────┴───────┴──────────────┘
```

### Execute a Specific Operation

```
/ai-dlc:operate my-intent rotate-secrets
```

For agent-owned operations, this runs the companion script and reports the result. For human-owned operations, it displays the checklist for the human to work through.

### Check Health

```
/ai-dlc:operate my-intent --status
```

Shows detailed status including last run time, exit codes, and deployment state.

## Deploying Operations

Use `--deploy` to generate platform-specific manifests from operation specs:

```
/ai-dlc:operate my-intent --deploy k8s-cronjob
```

### Supported Targets

| Target | Description |
|--------|-------------|
| `k8s-cronjob` | Kubernetes CronJob manifest for scheduled operations |
| `k8s-deployment` | Kubernetes Deployment with health checks for reactive operations |
| `github-actions` | GitHub Actions workflow files |
| `docker-compose` | Docker Compose service definitions |
| `systemd` | systemd unit and timer files |

Generated manifests are saved as `{name}.deploy.yaml` alongside the operation spec. These are committed to the repository and can be applied to your infrastructure.

## Status Tracking

Operation status is persisted in `.ai-dlc/{intent}/state/operation-status.json`:

```json
{
  "operations": {
    "rotate-secrets": {
      "last_run": "2026-03-15T00:00:00Z",
      "status": "on-track",
      "last_exit_code": 0,
      "deployed": true,
      "deploy_target": "k8s-cronjob"
    }
  }
}
```

### Status Values

| Status | Meaning |
|--------|---------|
| `on-track` | Last run succeeded, operating normally |
| `needs-attention` | Non-critical issue detected, human review recommended |
| `failed` | Last run failed, intervention required |
| `pending` | Not yet executed |
| `torn-down` | Deployment removed, spec preserved |

## Integration with Construction

Operations are not an afterthought — they are part of the construction workflow:

- **Builder** creates operation specs during the production phase when work requires ongoing maintenance (monitoring, scheduled tasks, runbooks).
- **Reviewer** validates operational readiness: are the right operations defined? Do triggers make sense? Are human checklists complete?
- **Integrator** checks for cross-unit conflicts during integration — schedule collisions, trigger overlaps, and shared resource references.

## Teardown

Remove deployments while preserving the operation specs:

```
/ai-dlc:operate my-intent --teardown
```

This sets the operation status to `torn-down` and removes generated deployment manifests. The spec files remain in the repository, so operations can be redeployed later.

## Legacy Format

Projects using the older single-file `operations.md` format continue to work. The plugin detects the legacy format and presents operations from it. New operations should use the individual spec file format in `.ai-dlc/{intent}/operations/`.

## Next Steps

- **[Operation File Reference](/docs/operation-schema/)** — Full schema reference for operation spec files
- **[Stack Configuration Reference](/docs/stack-config/)** — Configure infrastructure layers including operations runtime
- **[Workflows](/docs/workflows/)** — Learn how operations fits into the overall workflow
