# unit-02-dev: ui:// Resource Registration — Implementation Notes

## What was built

### `packages/haiku/scripts/build-review-app.mjs`
Added `REVIEW_APP_VERSION` build stamp: `crypto.createHash('sha256').update(html).digest('hex').slice(0,12)`. Appended as `export const REVIEW_APP_VERSION: string = "<hash>"` to the generated `src/review-app-html.ts`. Stable across rebuilds with no source change; changes on any SPA edit.

### `packages/haiku/src/ui-resource.ts` (new file)
Exports:
- `REVIEW_RESOURCE_URI` — computed as `` `ui://haiku/review/${REVIEW_APP_VERSION}` ``
- `buildUiResourceMeta(resourceUri: string): { ui: { resourceUri: string } }` — pure helper, no side effects

### `packages/haiku/src/server.ts`
Registered `ListResourcesRequestSchema` and `ReadResourceRequestSchema` handlers:
- `resources/list` returns single entry with `REVIEW_RESOURCE_URI` and `mimeType: "text/html"`
- `resources/read` returns inlined `REVIEW_APP_HTML` as `contents[0].text`; unknown URI throws `McpError(-32602, "Unknown resource URI")`

### `packages/haiku/test/ui-resource.test.mjs` (new file)
17 tests across 5 sections: pure unit tests for `buildUiResourceMeta`, `REVIEW_RESOURCE_URI` format checks, `resources/list` integration tests, `resources/read` integration tests (byte-exactness, error path), and `_meta` leakage snapshot. All 17 pass.

## Verification results
- `npm run prebuild`: exit 0, hash stable across two consecutive runs
- `npm run typecheck`: exit 0
- `npx biome check src`: exit 0, no fixes applied
- `npm test`: 260 passed, 0 failed (all 8 test suites)
