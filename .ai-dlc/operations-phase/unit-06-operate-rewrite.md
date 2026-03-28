---
status: completed
last_updated: 2026-03-28T06:28:27Z
depends_on: [unit-01-stack-schema]
branch: ai-dlc/operations-phase/06-operate-rewrite
discipline: backend
---

# unit-06-operate-rewrite

## Description

Rewrite the `/operate` skill as a management interface for operations. Instead of reading a single `operations.md` file, it reads individual operation files from `.ai-dlc/{intent}/operations/`, supports ad-hoc execution of specific operations, generates deployment manifests, shows status, and supports teardown. Each operation is independently addressable.

## Technical Specification

### 1. New CLI Interface (`plugin/skills/operate/SKILL.md`)

```
/operate                              → list all operations across all intents
/operate {intent}                     → list + show status for all operations in an intent
/operate {intent} {operation}         → run a specific operation ad-hoc
/operate {intent} --deploy            → generate/update deployment manifests for all operations
/operate {intent} --deploy {target}   → generate manifests for a specific target (k8s, github-actions, etc.)
/operate {intent} --status            → show last-run timestamps and health for all operations
/operate {intent} --teardown          → remove all operation deployments
```

### 2. Operation File Structure

The skill reads from `.ai-dlc/{intent}/operations/`:

```
.ai-dlc/{intent}/operations/
  rotate-secrets.md                   ← spec (frontmatter + description)
  rotate-secrets.ts                   ← script (self-contained, produced by Builder)
  rotate-secrets.deploy.yaml          ← deployment manifest (produced by Builder)
  token-refresh-failure.md
  token-refresh-failure.ts
  token-refresh-failure.deploy.yaml
  quarterly-access-review.md          ← human process (no script, has checklist)
```

### 3. Operation Listing (`/operate` and `/operate {intent}`)

Read all `.md` files in `operations/`, parse frontmatter, display:

```markdown
## Operations: {Intent Title}

| Operation | Type | Owner | Schedule/Trigger | Last Run | Status |
|---|---|---|---|---|---|
| rotate-secrets | scheduled | agent | every 90 days | 2026-03-15 | on-track |
| token-refresh-failure | reactive | agent | error_rate > 5% | never | pending |
| quarterly-access-review | process | human | quarterly | 2026-01-15 | on-track |
```

### 4. Ad-Hoc Execution (`/operate {intent} {operation}`)

For `owner: agent` operations:
1. Read the operation spec (`.md`)
2. Execute the operation script (`.ts`/`.py`/`.sh`)
3. Capture stdout (JSON output) and exit code
4. Update operation status in state
5. If script modified files, commit changes
6. Report results

For `owner: human` operations:
1. Read the operation spec
2. Display the description and checklist
3. Provide actionable guidance
4. Track that the operation was presented (not completed — human completes offline)

### 5. Deployment Manifest Generation (`/operate {intent} --deploy`)

Read stack config and generate deployment wrappers for each agent-owned operation:

Based on `stack.operations.scheduled` and `stack.operations.reactive`:

| Stack Config Value | Manifest Format |
|---|---|
| `kubernetes-cronjob` | k8s CronJob YAML |
| `kubernetes-deployment` | k8s Deployment + Service YAML |
| `github-actions` | GitHub Actions workflow with cron trigger |
| `docker-compose` | docker-compose service definition |
| `claude-schedule` | Claude Code `/schedule` command |
| `systemd` | systemd timer + service unit files |
| `none` | Skip (user deploys manually) |

Generated manifests are written to `.ai-dlc/{intent}/operations/deploy/`:

```
.ai-dlc/{intent}/operations/deploy/
  rotate-secrets.cronjob.yaml
  token-refresh-failure.deployment.yaml
```

If manifests already exist (produced by Builder in unit-03), update them rather than overwriting.

### 6. Status Tracking

Store operation status in `.ai-dlc/{intent}/operation-status.json`:

```json
{
  "operations": {
    "rotate-secrets": {
      "last_run": "2026-03-15T00:00:00Z",
      "status": "on-track",
      "last_exit_code": 0,
      "last_output": "{\"rotated\": true, \"id\": \"secret-123\"}"
    },
    "token-refresh-failure": {
      "last_run": null,
      "status": "pending",
      "deployed": true,
      "deploy_target": "kubernetes-deployment"
    }
  }
}
```

### 7. Teardown (`/operate {intent} --teardown`)

Remove deployed operations:
1. List all deployed operations from status file
2. For each: generate the delete command based on deploy target
   - k8s: `kubectl delete -f {manifest}`
   - github-actions: remove workflow file
   - docker-compose: remove service definition
3. Update status to `teardown`
4. Do NOT delete the operation specs/scripts — only the deployments

### 8. Remove Legacy operations.md Support

The old single-file `operations.md` format is replaced by the per-file format. If an old `operations.md` exists, the skill should:
1. Warn the user it's using the legacy format
2. Suggest running `/operate {intent} --migrate` to convert to per-file format
3. Still function with the old format for backward compatibility

## Success Criteria

- [ ] `/operate` lists all operations across all intents
- [ ] `/operate {intent}` shows status table for all operations in an intent
- [ ] `/operate {intent} {operation}` executes a specific agent-owned operation and reports results
- [ ] `/operate {intent} {operation}` displays checklist for human-owned operations
- [ ] `/operate {intent} --deploy` generates deployment manifests matching stack config
- [ ] `/operate {intent} --deploy` supports: k8s-cronjob, k8s-deployment, github-actions, docker-compose, systemd
- [ ] `/operate {intent} --status` shows last-run timestamps and health for all operations
- [ ] `/operate {intent} --teardown` removes deployed operations without deleting specs/scripts
- [ ] Operation status persisted in `operation-status.json`
- [ ] Legacy `operations.md` format still works with deprecation warning

## Risks

- **Teardown safety**: Removing k8s resources is destructive. Mitigation: confirm with user before teardown, show what will be deleted.
- **Manifest drift**: Generated manifests may drift from what's actually deployed. Mitigation: `--deploy` regenerates from source of truth (operation specs + stack config).

## Boundaries

Does NOT handle: schema (unit-01), elaboration (unit-02), builder (unit-03), reviewer (unit-04), integration (unit-05), docs (unit-07).

## Notes

- The `--deploy` command doesn't actually deploy — it generates manifests. The user or CI/CD pipeline applies them.
- Consider: should `/operate` support a `--watch` mode that monitors operation health continuously? Probably out of scope for v1, but note it as future work.
- The status tracking uses a JSON file, not han keep. This is because operation status is runtime state that doesn't need git versioning.
