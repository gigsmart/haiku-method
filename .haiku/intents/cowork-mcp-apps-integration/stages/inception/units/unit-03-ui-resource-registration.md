---
title: 'ui:// resource registration and REVIEW_APP_HTML delivery'
type: feature
depends_on:
  - unit-01-cowork-env-probe
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - stages/inception/units/unit-01-cowork-env-probe.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-14T22:09:36Z'
hat_started_at: '2026-04-14T22:10:51Z'
outputs:
  - knowledge/unit-03-elaboration-notes.md
completed_at: '2026-04-14T22:13:59Z'
---

# ui:// resource registration and REVIEW_APP_HTML delivery

## Scope

Register the bundled review SPA as an MCP resource under the `ui://` scheme so the MCP Apps host can fetch and render it in a sandboxed iframe. Wire a single helper that builds the metadata for tool results — no call sites yet, that's unit-04.

In scope:
- Add a `resources/list` and `resources/read` handler path to `packages/haiku/src/server.ts` that exposes `ui://haiku/review/{version}` where `{version}` is a stable build-time hash derived from `REVIEW_APP_HTML` contents (to let hosts cache across sessions but bust on plugin upgrade).
- Resource body is the existing `REVIEW_APP_HTML` string from `packages/haiku/src/review-app-html.ts` served with MIME type `text/html`. No re-read from disk.
- Helper `buildUiResourceMeta(resourceUri: string): ToolResultMeta` that returns the `_meta.ui.resourceUri` envelope; additive, no impact on hosts that ignore `_meta`.
- `packages/haiku/scripts/build-review-app.mjs` also writes a `REVIEW_APP_VERSION` constant (content hash) used by the resource URI.

Out of scope:
- Attaching the meta to specific tools (unit-04).
- SPA-side host detection (unit-04).
- `_openReviewAndWait` Cowork path (unit-05).
- Changes to the HTTP serveSpa handler (local path stays identical).

## Completion Criteria

- `rg -n 'ui://haiku/review' packages/haiku/src` returns at least one hit in `server.ts` and one in a test — verified by grep.
- Calling the MCP `resources/list` method returns a resource whose `uri` starts with `ui://haiku/review/` — verified by integration test sending the JSON-RPC call.
- Calling `resources/read` on that URI returns the exact bytes of `REVIEW_APP_HTML` with `mimeType: "text/html"` — verified by integration test comparing byte length and MIME.
- `REVIEW_APP_VERSION` is stable across two consecutive builds with no source changes and differs when the review-app source is modified — verified by running the build twice and grepping the emitted constant.
- Existing HTTP path (`http.ts:serveSpa`) continues to return `REVIEW_APP_HTML` unchanged for non-Cowork hosts — verified by existing review-app HTTP integration tests still passing.
- A non-MCP-Apps host calling an unaffected tool sees no `_meta` field in the result — verified by integration test snapshot.
