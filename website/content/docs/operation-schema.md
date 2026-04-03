---
title: Operation File Reference
description: Schema reference for .ai-dlc/{intent}/operations/*.md operation spec files
order: 9
---

This is the complete reference for operation spec files — the Markdown files that define operational tasks in AI-DLC.

## File Location

```
.ai-dlc/{intent}/operations/{name}.md
```

The filename (minus `.md`) serves as the operation identifier and must match the `name` field in frontmatter.

## Frontmatter Schema

All operation specs use YAML frontmatter with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Operation identifier, must match filename |
| `type` | enum | yes | `scheduled`, `reactive`, or `process` |
| `owner` | enum | yes | `agent` or `human` |
| `schedule` | string | conditional | Cron expression (required for `scheduled` type) |
| `trigger` | string | conditional | Condition expression (required for `reactive` type) |
| `frequency` | string | conditional | Human-readable cadence (required for `process` type) |
| `runtime` | enum | no | `node`, `python`, `go`, or `shell` — per-operation override of stack default |

### Type-Specific Required Fields

- **Scheduled** operations must have `schedule`
- **Reactive** operations must have `trigger`
- **Process** operations must have `frequency`

## Body Content

The Markdown body serves different purposes depending on ownership:

**Agent-owned:** Describes what the companion script does — its logic, expected behavior, and any constraints. This serves as documentation and context for the AI when executing.

**Human-owned:** Contains a checklist that `/ai-dlc:operate` presents to the human. Use standard Markdown task list syntax:

```markdown
- [ ] Step one
- [ ] Step two
- [ ] Final verification
```

## Companion Files

Agent-owned operations can have companion files in the same directory:

| File | Purpose |
|------|---------|
| `{name}.ts` | TypeScript implementation |
| `{name}.py` | Python implementation |
| `{name}.go` | Go implementation |
| `{name}.sh` | Shell script implementation |
| `{name}.deploy.yaml` | Generated deployment manifest |

The runtime (set per-operation or via stack config) determines which companion file is executed. Only one implementation file is expected per operation.

## Status Schema

Operation status is tracked in `.ai-dlc/{intent}/state/operation-status.json`. Each operation has an entry keyed by name:

```json
{
  "operations": {
    "operation-name": {
      "last_run": "2026-03-15T00:00:00Z",
      "last_presented": "2026-03-14T10:30:00Z",
      "status": "on-track",
      "last_exit_code": 0,
      "last_output": "Rotated 3 secrets successfully",
      "deployed": true,
      "deploy_target": "k8s-cronjob"
    }
  }
}
```

### Status Fields

| Field | Type | Description |
|-------|------|-------------|
| `last_run` | ISO-8601 or `null` | Timestamp of last execution |
| `last_presented` | ISO-8601 or `null` | Timestamp of last time presented to human (process type) |
| `status` | enum | `on-track`, `needs-attention`, `failed`, `pending`, or `torn-down` |
| `last_exit_code` | number or `null` | Exit code from last agent execution |
| `last_output` | string or `null` | First 2000 characters of last execution output |
| `deployed` | boolean | Whether the operation is currently deployed |
| `deploy_target` | enum | `k8s-cronjob`, `k8s-deployment`, `github-actions`, `docker-compose`, `systemd`, or `none` |

## Complete Examples

### Scheduled Agent Operation

```markdown
<!-- .ai-dlc/auth-system/operations/rotate-secrets.md -->
---
name: rotate-secrets
type: scheduled
owner: agent
schedule: "0 0 1 * *"
runtime: node
---

Rotate API keys and database credentials on the first of each month.

1. List all secrets due for rotation from the secrets provider
2. Generate new credentials via provider API
3. Update the secrets store with new values
4. Verify connectivity using the new credentials
5. Revoke the old credentials
6. Log rotation summary to audit trail
```

With companion script `rotate-secrets.ts` in the same directory.

### Reactive Agent Operation

```markdown
<!-- .ai-dlc/api-service/operations/scale-on-load.md -->
---
name: scale-on-load
type: reactive
owner: agent
trigger: "p99_latency > 200ms for 5m"
runtime: shell
---

Scale API replicas when sustained high latency is detected.

1. Query current replica count and resource utilization
2. Compute target replicas based on request rate and latency
3. Apply scaling via kubectl (capped at 20 replicas)
4. Wait for rollout to complete
5. Verify latency has returned to acceptable levels
```

With companion script `scale-on-load.sh` in the same directory.

### Process Human Operation

```markdown
<!-- .ai-dlc/platform/operations/quarterly-security-review.md -->
---
name: quarterly-security-review
type: process
owner: human
frequency: quarterly
---

- [ ] Run dependency audit (`npm audit` / `pip audit`)
- [ ] Review OWASP top 10 against current endpoints
- [ ] Check certificate expiration dates
- [ ] Review IAM roles and permissions for least privilege
- [ ] Verify backup restoration process
- [ ] Update threat model if architecture changed
- [ ] Document findings and file tickets for remediation
```

When invoked with `/ai-dlc:operate platform quarterly-security-review`, the checklist is presented for the human to work through. Progress is tracked in the status file.

## Next Steps

- **[Operations Guide](/docs/operations-guide/)** — Full walkthrough of the operations phase
- **[Stack Configuration Reference](/docs/stack-config/)** — Configure the operations runtime and other stack layers
