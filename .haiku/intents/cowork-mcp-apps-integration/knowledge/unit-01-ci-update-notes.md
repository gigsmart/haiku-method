# CI/CD Update Notes — MCP Apps Review Path

## What changed

`.github/workflows/ci.yml` — `test` job now has three additional steps before the final
smoke test:

1. **`npm run prebuild`** — bundles the review SPA into `packages/haiku/src/review-app-html.ts`.
   Must run before typecheck/test because TypeScript needs the generated asset.

2. **Bundle size check** — `gzip -c src/review-app-html.ts | wc -c`:
   - Warns (non-fatal) if > 950,000 bytes
   - Hard-fails (`exit 1`) if > 1,000,403 bytes

3. **Smoke test** — `npx tsx scripts/smoke-mcp-apps-review.ts` must exit 0.

## Step order in `test` job

```
Checkout → Setup Node → Install deps → prebuild → size check → test suite → smoke test
```

## Rollback

Revert this commit and the size-budget check disappears from CI. The prebuild step
can also be disabled by removing it from the workflow without affecting production builds
(it runs as a separate step, not a dependency of the main build).
