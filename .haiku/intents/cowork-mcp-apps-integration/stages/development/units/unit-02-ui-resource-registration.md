---
title: 'ui:// resource registration + REVIEW_APP_VERSION build stamp + _meta.ui helper'
type: feature
model: sonnet
depends_on:
  - unit-01-capability-negotiation-probe
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - knowledge/DATA-CONTRACTS.md
  - features/iframe-review-gate.feature
  - .haiku/knowledge/ARCHITECTURE.md
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-15T15:46:42Z'
hat_started_at: '2026-04-15T15:55:54Z'
outputs:
  - knowledge/unit-02-dev-ui-resource-registration-implementation.md
  - knowledge/unit-02-dev-ui-resource-registration-implementation.md
completed_at: '2026-04-15T16:00:56Z'
---

# ui:// resource registration + REVIEW_APP_VERSION + _meta.ui helper

## Scope

Register the bundled review SPA as an MCP resource at `ui://haiku/review/{REVIEW_APP_VERSION}` and ship the small helper that builds the `_meta.ui.resourceUri` envelope for tool results. No call sites yet — that's unit-03 / unit-04.

### In scope

- **`resources/list` and `resources/read` handlers** in `packages/haiku/src/server.ts`. `list` returns a single entry with the `ui://haiku/review/{version}` URI and `mimeType: "text/html"`. `read` returns the inlined `REVIEW_APP_HTML` string as the `contents[0].text` value — no disk re-read.
- **`REVIEW_APP_VERSION` build stamp.** Edit `packages/haiku/scripts/build-review-app.mjs` to compute a `crypto.createHash('sha256').update(html).digest('hex').slice(0,12)` and append `export const REVIEW_APP_VERSION: string = "<hash>"` to the generated `src/review-app-html.ts`. Stable across rebuilds with no source change; changes on any SPA edit.
- **`packages/haiku/src/ui-resource.ts`** — new file exporting `buildUiResourceMeta(resourceUri: string): { ui: { resourceUri: string } }`. Pure helper, no side effects.
- **Unknown URI error path.** `resources/read` with an unrecognized URI returns JSON-RPC error `-32602` with message `"Unknown resource URI"` per `DATA-CONTRACTS.md`.
- **Tests.** Unit tests for the helper (shape equality). Integration test sending JSON-RPC `resources/list` and `resources/read` to an in-process server, asserting the URI matches `/^ui:\/\/haiku\/review\/[0-9a-f]{12}$/`, the body byte-length equals `REVIEW_APP_HTML.length`, and the unknown-URI error is correctly shaped.

### Out of scope

- Wiring `_meta.ui.resourceUri` into any tool result call site (units 03 and 04).
- SPA-side host detection (unit-05).
- Changes to `http.ts:serveSpa` — local HTTP path stays untouched.

## Completion Criteria

1. **Capability already advertised** by unit-01 (prerequisite). Verified by `rg -n 'resources:\s*\{\}' packages/haiku/src/server.ts`.
2. **Handlers registered.** `rg -n 'ListResourcesRequestSchema|ReadResourceRequestSchema' packages/haiku/src/server.ts` returns ≥ 2 hits.
3. **URI pattern.** `resources/list` integration test: `response.resources[0].uri` matches `/^ui:\/\/haiku\/review\/[0-9a-f]{12}$/`, `mimeType === "text/html"`.
4. **`resources/read` byte-exactness.** Integration test: `response.contents[0].text.length === REVIEW_APP_HTML.length`, `mimeType === "text/html"`.
5. **Unknown URI error.** Integration test with URI `ui://haiku/bogus/xxx` returns JSON-RPC error with `code === -32602`, `message === "Unknown resource URI"`.
6. **Version hash stable.** Run `npm --prefix packages/haiku run prebuild` twice with no source change; diff the two emitted `review-app-html.ts` files is empty.
7. **Version hash changes on source edit.** Touch any byte in `packages/haiku/review-app/src/`; rebuild; the 12-char hash differs from the previous run.
8. **Helper exported.** `rg -n '^export function buildUiResourceMeta' packages/haiku/src/ui-resource.ts` returns 1. Unit test asserts `buildUiResourceMeta('ui://x').ui.resourceUri === 'ui://x'`.
9. **Local HTTP path untouched.** `git diff main -- packages/haiku/src/http.ts` is empty.
10. **No accidental `_meta` leakage.** Snapshot test on an unrelated existing tool result (e.g. `haiku_version_info`) confirms `result._meta` is `undefined`.
11. **Typecheck + lint + tests clean.** `cd packages/haiku && npm run typecheck && npx biome check src && npm test` exit 0.
