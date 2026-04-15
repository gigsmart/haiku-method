---
title: 'ui:// resource registration and REVIEW_APP_HTML delivery'
type: feature
model: sonnet
depends_on:
  - unit-01-cowork-env-probe
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - stages/inception/units/unit-01-cowork-env-probe.md
  - knowledge/unit-03-resource-registration-research.md
status: pending
bolt: 0
hat: ''
started_at: null
hat_started_at: '2026-04-14T22:10:51Z'
outputs:
  - knowledge/unit-03-elaboration-notes.md
completed_at: null
---

# ui:// resource registration and REVIEW_APP_HTML delivery

## Scope

Register the bundled review SPA as an MCP resource under the `ui://` scheme so the MCP Apps host can fetch and render it in a sandboxed iframe. Wire a single helper that builds the `_meta.ui` envelope for tool results — no call sites yet, that's unit-04.

### In scope

- **Advertise `resources` capability.** `packages/haiku/src/server.ts:158` currently declares only `tools`, `prompts`, `completions`. Add `resources: {}` alongside — without it the SDK rejects `resources/*` requests. This is a required first step.
- **Greenfield resource handlers.** No existing `ListResourcesRequestSchema` / `ReadResourceRequestSchema` handlers in `packages/haiku/src/` (researcher confirmed zero grep hits). Register both on the `Server` instance, exposing exactly one resource whose `uri` is `ui://haiku/review/${REVIEW_APP_VERSION}`, `mimeType` is `text/html`, and whose `contents` are the existing `REVIEW_APP_HTML` string from `packages/haiku/src/review-app-html.ts`. No disk re-read.
- **New `buildUiResourceMeta(resourceUri: string)` helper** in a new `packages/haiku/src/ui-resource.ts`. Returns `{ ui: { resourceUri } }` suitable for splatting into a tool result's `_meta`. This is a new utility, not a refactor — handlers today return `{ content: [...] }` literals with zero `_meta` usage (`server.ts:411-417`, `:436-439`, `:745`, `:760`).
- **Build-time version stamp.** `packages/haiku/scripts/build-review-app.mjs:69-70` already writes `REVIEW_APP_HTML` into `src/review-app-html.ts`. Add ~3 lines near `:69` computing `crypto.createHash("sha256").update(html).digest("hex").slice(0,12)` and appending `export const REVIEW_APP_VERSION: string = "<hash>"` to `tsContent`. Stable across rebuilds with no source change; bumps on any SPA edit.

### Out of scope (scope firewall)

- **`http.ts:serveSpa` MUST NOT be modified.** The local-HTTP review path is unchanged for non-Cowork hosts. Only consumer of `REVIEW_APP_HTML` today is `packages/haiku/src/http.ts:11,34` — it keeps working verbatim.
- Attaching `_meta.ui` to specific tool call sites (unit-04).
- SPA-side host / bridge detection (unit-04).
- Cowork `_openReviewAndWait` branching (unit-05).

### Flags for downstream units

- Inlined `REVIEW_APP_HTML` is ~**5.15 MB** (5,402,978 bytes measured on main). Flagged as an input to unit-04 (host-bridge / iframe-preload) and unit-05 (Cowork open handler) for awareness; **not in scope to shrink here**. The `vite-plugin-singlefile` question in `knowledge/DISCOVERY.md:74` remains open for a later unit.
- `review-app-html.ts` doesn't exist until `npm run prebuild` runs; integration tests that import the resource handler must depend on the prebuild step.

## Completion Criteria

1. **Capability advertised.** `rg -n "resources:\s*\{\}" packages/haiku/src/server.ts` returns exactly one hit inside the `capabilities` block near `:158`.
2. **Handlers registered.** `rg -n "ListResourcesRequestSchema|ReadResourceRequestSchema" packages/haiku/src/server.ts` returns at least two hits (one per handler).
3. **URI is referenced.** `rg -n "ui://haiku/review" packages/haiku/src` returns ≥1 hit in `server.ts` and ≥1 hit in a test file under `packages/haiku/src/__tests__/` (or sibling test dir).
4. **`resources/list` contract.** Integration test sends a JSON-RPC `resources/list` request to a booted in-process server; response `.resources[0].uri` matches `/^ui:\/\/haiku\/review\/[0-9a-f]{12}$/` and `.mimeType === "text/html"`.
5. **`resources/read` contract.** Integration test sends `resources/read` with that URI; response `.contents[0].text.length === REVIEW_APP_HTML.length` (byte-exact) and `.contents[0].mimeType === "text/html"`.
6. **Version stability.** Running `npm --prefix packages/haiku run prebuild` twice with no source change yields identical `REVIEW_APP_VERSION` strings (`diff` of the two emitted `review-app-html.ts` files is empty). Touching any byte in `packages/review-app/src/` and rebuilding changes the 12-char hash.
7. **Helper exists and is pure.** `rg -n "export function buildUiResourceMeta" packages/haiku/src/ui-resource.ts` returns one hit; unit test asserts `buildUiResourceMeta("ui://x").ui.resourceUri === "ui://x"`.
8. **Local HTTP path untouched.** `git diff main -- packages/haiku/src/http.ts` is empty after the unit is complete. Existing `serveSpa` integration tests (non-Cowork) still pass.
9. **No accidental `_meta` leakage.** Snapshot test on an unrelated tool result (e.g. `haiku_version_info`) confirms `result._meta` is `undefined` — the new helper is not wired into any handler yet.
