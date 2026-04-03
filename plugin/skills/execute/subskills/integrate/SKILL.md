---
description: (Internal) Cross-cutting intent-level validation after all units are merged
context: fork
agent: general-purpose
user-invocable: false
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# Integrate: Cross-Unit Validation

Intent-level integration validation that runs after all units have been completed and merged. This skill verifies that all units work together as a cohesive whole and that intent-level success criteria are satisfied.

Unlike the Reviewer hat (which validates individual units), this skill validates the combined result on the merged intent branch.

**You have NO access to `AskUserQuestion`.** All work is fully autonomous. Return a clear ACCEPT or REJECT decision.

---

## Input

This skill is invoked by `/haiku:advance` or `/haiku:execute` when all units are complete. It receives its context via the subagent prompt, including:

- **Intent slug** - The intent being validated
- **Worktree path** - Path to the intent worktree (contains all merged unit work)
- **Intent branch** - The branch name (`ai-dlc/{intent-slug}/main`)
- **Intent-level success criteria** - From `intent.md`
- **Completed units list** - All units that were built and merged

---

## Step 1: Verify Merged State Integrity

- You MUST confirm you are on the intent branch (`ai-dlc/{intent-slug}/main`)
- You MUST verify all unit branches have been merged
- You MUST check for merge conflicts or incomplete merges
- You MUST run `git log --oneline` to confirm all unit merge commits are present
- **Validation**: Clean merged state with all units present

## Step 2: Run Full Backpressure Suite

- You MUST run the full test suite on the merged codebase
- You MUST run lint checks across all changed files
- You MUST run type checks if applicable
- You MUST verify no regressions from unit interactions
- **Validation**: All tests pass, no lint errors, no type errors

## Step 3: Verify Intent-Level Success Criteria

- You MUST read intent-level success criteria from `intent.md`
- You MUST check each intent-level criterion individually
- You MUST run verification commands, not just read code
- You MUST distinguish between unit-level criteria (already verified) and intent-level criteria (your responsibility)
- **Validation**: Each intent-level criterion marked pass/fail with evidence

## Step 4: Verify Cross-Unit Integration

- You MUST check that units interact correctly at their boundaries
- You MUST verify shared state, APIs, or data flows between units work end-to-end
- You MUST check for conflicting patterns, duplicate code, or inconsistent conventions across units
- You SHOULD run integration tests if they exist
- You SHOULD verify that cross-cutting concerns (documented as intent-level criteria) are consistently applied
- **Validation**: Units work together, no integration gaps

## Step 5: Check for Emergent Issues

- You MUST look for problems that only appear when units are combined
- You SHOULD check for performance regressions from combined changes
- You SHOULD verify that the overall user experience flows correctly across unit boundaries
- You MUST identify any missing glue code or wiring between units
- **Validation**: No emergent issues from unit combination

## Step 6: Cross-Unit Deployment Validation

**Condition**: Only run when any completed unit has a `deployment:` block in its frontmatter. If no units have deployment blocks, skip this step entirely.

- You MUST read all unit specs to collect `deployment:` blocks
- You MUST check for port conflicts: scan Dockerfiles, k8s Service manifests, docker-compose ports for duplicate port bindings across units
- You MUST check for resource name conflicts: no two units can define the same Terraform resource name, k8s object name (Deployment, Service, ConfigMap), or Helm release name
- You MUST verify dependency ordering: databases/infrastructure deploy before application services (check k8s manifests for init containers, depends_on in compose, terraform depends_on)
- You MUST verify the CI/CD pipeline handles ALL new artifacts (not just individual unit artifacts) — check pipeline config references all Dockerfiles, all deploy targets
- You MUST re-run deploy_validate quality gate (if configured) on the merged codebase to verify all deployment artifacts build from merged state
- You SHOULD check environment config consistency (same env var names across units, no conflicting defaults)
- You MUST report ALL deployment issues found, not just the first one
- **Validation**: No port/resource conflicts, dependency order correct, all artifacts build from merged state

## Step 7: Cross-Unit Monitoring Validation

**Condition**: Only run when any completed unit has a `monitoring:` block in its frontmatter. If no units have monitoring blocks, skip this step entirely.

- You MUST read all unit specs to collect `monitoring:` blocks (metrics, dashboards, alerts, slos)
- You MUST check for duplicate metric names: no two units should emit the same metric name unless intentionally shared
- You MUST verify consistent label/tag naming: if multiple units use labels (e.g., `service`, `environment`), they MUST use the same label names and value conventions
- You MUST verify dashboard references resolve: for each metric referenced in dashboard definitions (in `monitoring/dashboards/`), confirm the metric is instrumented in the merged codebase (grep for metric name in source files)
- You MUST check alert rule consistency: no conflicting alert rules (same metric, different thresholds from different units)
- You MUST verify SLO consistency: no contradictory SLO targets (e.g., one unit targets 99.9%, another targets 95% for the same service)
- You SHOULD check for orphaned metrics: metrics instrumented in code but not referenced by any dashboard or alert
- You SHOULD verify KPIs across units don't double-count the same underlying metric
- You MUST report ALL monitoring issues found, not just the first one
- **Validation**: No duplicate metrics, consistent naming, all dashboard/alert references resolve, SLOs consistent

## Step 8: Cross-Unit Operations Validation

**Condition**: Only run when any completed unit has an `operations:` block in its frontmatter. If no units have operations blocks, skip this step entirely.

- You MUST read all operation specs in `.haiku/intents/{intent}/operations/` directory
- You MUST check for schedule collisions: two scheduled operations running at the same cron time that could conflict (e.g., both writing to the same resource). Parse cron expressions from operation spec frontmatter.
- You MUST check for overlapping reactive triggers: two reactive operations triggered by the same event but performing conflicting actions
- You MUST verify operation scripts reference resources that exist in the merged deployment (e.g., database names, service URLs, secret references)
- You MUST verify operation deployment manifests are valid in the merged state (k8s CronJob YAML validates, GitHub Actions workflow syntax is correct)
- You MUST verify all operations that need deployment manifests HAVE them (when stack config specifies compute/operations targets)
- You SHOULD run operation scripts with `--dry-run` flag on merged codebase to verify they execute without errors
- You MUST report ALL operations issues found, not just the first one
- **Validation**: No schedule collisions, no trigger conflicts, all resource references valid, manifests valid

## Step 9: Full-Stack Dry-Run

**Condition**: Only run when the project has stack config with providers (check via `get_stack_layer` for non-empty layers). If no stack providers are configured, skip this step entirely. This step is best-effort — if tools are not available, skip with a warning rather than blocking.

- If stack has `infrastructure` layer with `terraform`: run `terraform validate` (and `terraform plan` if state backend is accessible) on merged IaC directory
- If stack has `packaging` layer with `helm`: run `helm template` on merged Helm charts to verify they render without errors
- If stack has `compute` layer with `docker-compose`: run `docker compose config` on merged compose files to verify they parse correctly
- If stack has `pipeline` layer: validate CI/CD pipeline config syntax (e.g., `actionlint` for GitHub Actions, `gitlab-ci-lint` for GitLab CI)
- You MUST check that all artifacts referenced in pipeline config exist in the merged codebase
- You MUST NOT fail the integration if a tool is unavailable — log a warning and skip that check
- You SHOULD run all configured quality gates (deploy_validate, observable_validate, operations_validate) on the merged codebase
- You MUST report ALL dry-run failures found, not just the first one
- **Validation**: All available dry-run commands pass, all artifact references resolve

## Step 10: Make Decision

- If all intent-level criteria pass, integration checks pass, no emergent issues, and all operational validations pass (or were skipped): **ACCEPT**
- If issues found in ANY step: **REJECT** with specific units that need rework and clear reasons
- You MUST document decision clearly
- You MUST NOT accept if intent-level criteria are not met
- You MUST NOT accept if deployment conflicts, monitoring inconsistencies, operations conflicts, or dry-run failures were found
- You MUST specify which units need rework when rejecting (not just "fix it")
- You MUST include results from ALL steps in the decision output, including skipped steps
- **Validation**: Clear ACCEPT/REJECT with rationale

---

## Output Format

### On ACCEPT

```
INTEGRATOR DECISION: ACCEPT

All intent-level criteria verified:
- [x] {criterion 1} -- {evidence}
- [x] {criterion 2} -- {evidence}

Cross-unit integration: PASS
Backpressure suite: PASS
Deployment compatibility: PASS (or SKIPPED — no deployment blocks)
Monitoring consistency: PASS (or SKIPPED — no monitoring blocks)
Operations validity: PASS (or SKIPPED — no operations blocks)
Full-stack dry-run: PASS (or SKIPPED — no stack config)
```

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
aidlc_telemetry_init
aidlc_record_integration_result "${INTENT_SLUG}" "true" "0"
```

### On REJECT

```
INTEGRATOR DECISION: REJECT

Failed criteria:
- [ ] {criterion} -- {what failed and why}

Units requiring rework:
- {unit-NN-slug}: {specific issue to fix}
- {unit-MM-slug}: {specific issue to fix}

Integration issues:
- {description of cross-unit problem}

Deployment conflicts:
- {port conflict, resource name conflict, etc.}

Monitoring issues:
- {duplicate metric, broken dashboard reference, etc.}

Operations conflicts:
- {schedule collision, trigger overlap, etc.}

Dry-run failures:
- {terraform plan failure, helm template error, etc.}
```

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
aidlc_telemetry_init
aidlc_record_integration_result "${INTENT_SLUG}" "false" "${ISSUE_COUNT}"
```

---

## Error Handling

### Error: Merge Conflicts on Intent Branch

**Symptoms**: Units merged but conflicts remain unresolved

**Resolution**:
1. You MUST NOT attempt to resolve merge conflicts
2. You MUST REJECT and identify the conflicting units
3. Specify which units need to be re-built with awareness of each other's changes

### Error: Tests Pass Individually But Fail Combined

**Symptoms**: Unit tests passed during review but fail on merged branch

**Resolution**:
1. You MUST identify which units' tests are conflicting
2. You MUST determine root cause (shared state, import conflicts, etc.)
3. You MUST REJECT with the specific units that need rework
4. Include the failing test output in your rejection feedback

### Error: Missing Integration Between Units

**Symptoms**: Units work independently but aren't wired together

**Resolution**:
1. You MUST identify the missing wiring (e.g., component not imported, route not registered)
2. You MUST REJECT and specify which unit should own the integration
3. If the gap is a new concern, recommend it be added to the unit spec

### Error: Dry-Run Tool Unavailable

**Symptoms**: `terraform`, `helm`, `docker compose`, or pipeline linter not installed or not in PATH

**Resolution**:
1. You MUST NOT fail the integration — skip the specific dry-run check
2. You MUST log a warning noting which tool was unavailable and which check was skipped
3. Continue with remaining dry-run checks

### Error: Credential-Dependent Validation Blocked

**Symptoms**: `terraform plan` or cloud-provider commands fail due to missing credentials

**Resolution**:
1. You MUST NOT fail the integration — skip the credential-dependent check
2. You MUST log a warning noting the credential requirement
3. You SHOULD still run `terraform validate` (which does not require credentials)
4. Continue with remaining checks

### Error: Large Metric Index

**Symptoms**: Many metrics across many units making validation slow

**Resolution**:
1. Use regex-based matching for metric name lookups, not AST parsing
2. Build a simple index of metric names from code (grep for metric registration patterns)
3. Compare dashboard/alert references against this index
