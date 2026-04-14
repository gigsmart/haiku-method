# Unit 03 Research — ui:// Resource Registration Landscape

## SDK surface
- `@modelcontextprotocol/sdk` pinned at `^1.28.0` in `packages/haiku/package.json:21`. Server is instantiated as `new Server(...)` from `@modelcontextprotocol/sdk/server/index.js` at `packages/haiku/src/server.ts:4` and `:155`. Capabilities block lives at `packages/haiku/src/server.ts:158` and currently advertises `tools`, `prompts`, `completions` — no `resources` capability yet, so unit-04/05 implementer must add `resources: {}` alongside existing entries.
- `ListResourcesRequestSchema` / `ReadResourceRequestSchema` handlers: zero hits across `packages/haiku/src/` (grep). Greenfield registration.

## REVIEW_APP_HTML delivery
- Build script: `packages/haiku/scripts/build-review-app.mjs` runs `review-app` vite build, inlines `<script>`/`<link>` assets, then writes `src/review-app-html.ts` as `export const REVIEW_APP_HTML: string = JSON.stringify(html)` at `build-review-app.mjs:69-70`. Final size log at `:72-73`.
- Current inlined size (built artifact from main worktree): **5,402,978 bytes (~5.15 MB)**. This is a single inline HTML string — relevant to unit-04's iframe-preload concern and to the `vite-plugin-singlefile` open question in `knowledge/DISCOVERY.md:74`.
- No content hash / version stamp is emitted. Adding `REVIEW_APP_VERSION` is a ~3 line addition near `:69` (compute `crypto.createHash("sha256").update(html).digest("hex").slice(0,12)` and append `export const REVIEW_APP_VERSION: string = "..."` to `tsContent`). Stable for unchanged source; changes on any SPA edit — satisfies the completion criterion.
- Only current consumer of `REVIEW_APP_HTML`: `packages/haiku/src/http.ts:11` (import) and `:34` (`serveSpa` Response body). Unit-03 must not touch this path.

## Tool-result helper surfaces
- `_meta` grep in `server.ts`: **zero hits**, confirming greenfield `_meta.ui` envelope.
- No central tool-result builder exists. Each handler returns its own `{ content: [{ type: "text", text }] }` literal (see `server.ts:411-417`, `:436-439`, `:745`, `:760`). The `buildUiResourceMeta()` helper introduced by this unit will therefore be a new utility imported by unit-04 call sites, not a refactor of an existing helper.

## Flags for implementer
- Worktree lacks `review-app-html.ts` until `npm run prebuild` runs — integration tests that import it need the prebuild step.
- `5.15 MB` inline HTML may stress Cowork's `ui://` preloader; flag to unit-04 host-bridge spike.
