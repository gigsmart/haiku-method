---
status: completed
type: backend
depends_on:
  - unit-04-review-ui
  - unit-05-interactive-ui
bolt: 1
hat: decomposer
started_at: '2026-04-07T14:39:46Z'
completed_at: '2026-04-07T14:39:54Z'
---

# Cleanup and Binary Reduction

## Scope
Remove the bundled React review app and all associated build infrastructure. Delete `packages/haiku/review-app/`, `packages/haiku/src/review-app-html.ts`, `packages/haiku/scripts/build-review-app.mjs`, `packages/haiku/scripts/build-css.mjs`. Update `packages/haiku/package.json` to remove the prebuild step. Verify the binary builds and is significantly smaller.

## Completion Criteria
- `packages/haiku/review-app/` directory does not exist
- `packages/haiku/src/review-app-html.ts` does not exist
- `packages/haiku/scripts/build-review-app.mjs` does not exist
- `packages/haiku/scripts/build-css.mjs` does not exist
- `npm run build` in `packages/haiku/` succeeds
- `plugin/bin/haiku` binary is smaller than before (was ~1.1MB)
- `plugin/bin/haiku mcp` starts without errors
