---
status: completed
last_updated: 2026-03-28T08:30:28Z
depends_on: [unit-04-reviewer-ops]
branch: ai-dlc/operations-phase/05-integration-ops
discipline: backend
---

# unit-05-integration-ops

## Description

Expand the integration skill to validate cross-unit deployment compatibility, monitoring coverage, and operational completeness. After all units pass individual review, integration ensures they work together as a deployable, observable, operable system.

## Technical Specification

### 1. Integration Skill Extension (`plugin/skills/integrate/SKILL.md`)

Add new verification steps after existing integration checks:

**Existing steps (unchanged):**
1. Verify merged state integrity (no conflicts)
2. Run full backpressure suite (tests, lint, types)
3. Verify intent-level success criteria
4. Check cross-unit integration (boundaries, shared state)
5. Detect emergent issues

**New steps:**

6. **Cross-unit deployment validation** — When any unit has `deployment:` block:
   - No port conflicts between services
   - No resource name conflicts in IaC (terraform resource names, k8s object names)
   - Dependency order correct (databases before services, infra before apps)
   - Pipeline config handles all new artifacts (not just individual unit artifacts)
   - All deployment artifacts build successfully from merged state (re-run deploy_validate)

7. **Cross-unit monitoring validation** — When any unit has `monitoring:` block:
   - No duplicate metric names across units
   - Consistent label/tag naming conventions
   - Dashboard definitions reference metrics that exist in the merged codebase
   - Alert rules don't conflict (same metric, different thresholds from different units)
   - SLOs are consistent (no contradictory targets)
   - KPIs across units don't double-count

8. **Cross-unit operations validation** — When any unit has `operations:` block:
   - No schedule collisions (two operations running at the same time if they conflict)
   - Reactive operations don't have overlapping triggers with conflicting actions
   - Operation scripts reference resources that exist in the merged deployment
   - Operation deployment manifests are valid in the merged state
   - All operations have corresponding deployment manifests (when stack config specifies targets)

9. **Full-stack dry-run** — When stack config has providers:
   - Run `terraform plan` on merged IaC (if terraform configured)
   - Run `helm template` on merged Helm charts (if helm configured)
   - Run `docker compose config` on merged compose files (if docker-compose configured)
   - Validate CI/CD pipeline config (syntax check, all referenced artifacts exist)

### 2. Integration Decision Extension

Update the ACCEPT/REJECT decision to include operational criteria:

**ACCEPT when:**
- All existing criteria pass (code, tests, integration)
- All deployment artifacts build from merged state
- All monitoring configs are consistent and valid
- All operations are non-conflicting and deployable
- Full-stack dry-run passes (when stack config exists)

**REJECT when (with specific feedback):**
- Port/resource conflicts between units
- Broken metric references in merged dashboards
- Conflicting operation schedules or triggers
- Full-stack dry-run fails
- Missing deployment manifests for operations that need them

## Success Criteria

- [ ] Integration checks for port/resource conflicts across unit deployment artifacts
- [ ] Integration validates consistent metric naming and no duplicate metrics
- [ ] Integration verifies dashboard references resolve to actual metrics in merged codebase
- [ ] Integration detects conflicting operation schedules/triggers
- [ ] Integration runs full-stack dry-run when stack config has providers (terraform plan, helm template, etc.)
- [ ] ACCEPT/REJECT decision accounts for deployment, monitoring, and operations validity
- [ ] Existing integration behavior unchanged when no units have ops frontmatter

## Risks

- **Dry-run failures**: terraform plan or helm template may require credentials/state not available locally. Mitigation: dry-run is best-effort — if tools aren't available, skip with a warning rather than blocking.
- **Metric name validation complexity**: Matching metric names between code and dashboard JSON across providers. Mitigation: regex-based matching, not exact AST parsing.

## Boundaries

Does NOT handle: schema (unit-01), elaboration (unit-02), builder (unit-03), reviewer (unit-04), operate (unit-06), docs (unit-07).

## Notes

- Integration should report all issues at once (not fail on first issue). The rejection feedback should list every conflict found so the Builder can fix them all in one pass.
- The full-stack dry-run may be slow for large terraform/helm projects. Consider: should it be optional via settings? Probably yes — add a `quality_gates.integration_dry_run` setting.
- For metric name validation, consider building a simple index: extract all metric names from code instrumentation, then verify each dashboard/alert reference exists in the index.
