---
title: CI/CD workflow updates for MCP Apps review path
type: ops
model: sonnet
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - .haiku/knowledge/RUNBOOK.md
outputs:
  - .github/workflows/ci.yml
---

# CI/CD workflow updates for MCP Apps review path

## Scope

Update the GitHub Actions workflows to build and validate the MCP Apps review SPA as
part of every CI run, enforce the bundle size budget, and run the end-to-end smoke test.

### In scope

- **`npm run prebuild` step.** Add a `prebuild` step before the typecheck and test jobs
  in all relevant `.github/workflows/*.yml` files. The review SPA must be bundled before
  TypeScript can type-check the generated `review-app-html.ts` asset.
- **Bundle size budget check.** After the `prebuild` step, add:
  `gzip -c packages/haiku/src/review-app-html.ts | wc -c` and fail the job if the result
  exceeds 1,000,403 bytes. Warn (but don't fail) at 950KB.
- **Smoke test step.** Add a step that runs
  `npx tsx packages/haiku/scripts/smoke-mcp-apps-review.ts` and asserts exit 0. This
  step runs after the size check and before deployment gates.

### Out of scope

- No secrets introduced. No changes to `deploy/auth-proxy/` or `deploy/terraform/`.
- No changes to deployment workflows beyond adding the three steps above.
- PagerDuty, alerting, or external monitoring integrations.

## Completion Criteria

1. **prebuild in CI.** `rg -n 'npm run prebuild' .github/workflows/` returns ≥ 1 hit in
   a job that precedes the typecheck/test steps.
2. **Size check present.** `rg -n 'gzip.*review-app-html\|wc -c' .github/workflows/`
   returns ≥ 1 hit with the 1000403 threshold referenced nearby.
3. **Smoke step present.** `rg -n 'smoke-mcp-apps-review' .github/workflows/` returns
   ≥ 1 hit.
4. **No secrets added.** `rg -n 'secret\|password\|token\|key' .github/workflows/`
   returns no new hits beyond what existed before this unit (diff-clean on secrets).
5. **No terraform/auth-proxy changes.** `git diff --name-only` does not include any path
   under `deploy/`.
6. **CI passes.** The updated workflow jobs succeed on the current branch (verify via
   `gh run list --branch $(git branch --show-current) --limit 3`).
