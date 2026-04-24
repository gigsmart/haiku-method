# Tactical Plan: unit-03 Extract haiku-ui package

Owner: planner (bolt 1)
Target: Relocate `packages/haiku/review-app/` → `packages/haiku-ui/` as an independent workspace package, rewire the MCP bundler, replace local wire types with `haiku-api` re-exports, add the `ApiClient` abstraction, add rAF-coalesced `session-update` handling on the WebSocket hook, and land byte-identical bundle + DOM parity verification. **No visual changes.**

---

## Context & Prior Art

- **unit-01** published `packages/haiku-api/` with Zod schemas and inferred TS types for every HTTP/WS payload the review app touches (see `haiku-api/src/schemas/{session,feedback,review,question,direction,websocket,common,files,revisit}.ts`). `FeedbackItem`, `FeedbackListResponse`, `ReviewSessionPayload`, `QuestionSessionPayload`, `DirectionSessionPayload`, `SessionPayload`, `ReviewCurrentPayload`, `ReviewAnnotations`, `QuestionAnswer`, `FeedbackCreateRequest`, `FeedbackUpdateRequest`, `WsClientMessage`, `WsServerMessage` are all available as type exports. This lets `haiku-ui/src/types.ts` become a thin re-export barrel.
- **unit-02** already migrated the MCP backend to import the same schemas (`packages/haiku/src/http.ts` imports from `haiku-api`). Both sides now share the contract — this unit finishes the picture by pointing the SPA at it too.
- **Current review-app** is at `packages/haiku/review-app/` (pkg name `@haiku/review-app`), deps: `react`, `react-dom`, `@sentry/react`, `@xyflow/react`, `elkjs`, `react-markdown`, `remark*`, `tailwindcss` (v4), `@tailwindcss/vite`, `@vitejs/plugin-react`, `vite`, `typescript`, `@haiku/shared`. Build output: `review-app/dist/index.html` with CSS/JS inlined by `scripts/build-review-app.mjs`.
- **MCP bundler**: `packages/haiku/package.json`'s `prebuild` hook calls `scripts/build-css.mjs && scripts/build-review-app.mjs`; the script reads `review-app/dist/index.html`, inlines assets, writes `packages/haiku/src/review-app-html.ts` (export `REVIEW_APP_HTML`). `packages/haiku/src/http.ts` line 37 imports `{ REVIEW_APP_HTML } from "./review-app-html.js"` and `serveSpa()` returns it.
- **Root workspaces** (`package.json`): `["website", "packages/haiku", "packages/haiku-api", "packages/shared"]` — no alphabetical enforcement; adding `packages/haiku-ui` is straightforward.
- **`packages/haiku/package.json` dependency surface**: `haiku-api`, `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`, `@sentry/node` (NOT `@sentry/react`), `gray-matter`, `localtunnel`, `marked`, `zod`. The unit spec says "drops `react`, `@sentry/react`, `vite`" — they are not currently present in `packages/haiku/package.json` (they live in `review-app/package.json` via the nested workspace). Verify after the move. The scope text is aspirational about what `packages/haiku` must look like post-move (no react/sentry-react/vite); in practice, nothing to delete — just ensure none leak in during refactor.
- **Existing SPA uses `@haiku/shared`** for `CriterionItem`, `MockupInfo`, and UI components `StatusBadge`, `CriteriaChecklist`, `MarkdownViewer`. Keep that dep — it's an internal workspace already.

## Git-history signal

- `packages/haiku/review-app/` is a moderate-churn tree (high activity in `components/` from recent feedback-related UX work). File moves via `git mv` preserve history; commit the move in one atomic commit to keep rename detection clean, then follow with import rewrites in a separate commit so the diff is reviewable.
- `packages/haiku/scripts/build-review-app.mjs` is low-churn (1 author, few commits). Renaming to `bundle-haiku-ui.mjs` is safe; update the `prebuild` hook in `packages/haiku/package.json` in the same commit as the script rename.
- `packages/haiku/src/http.ts` is high-churn. The only touchpoint here is the `REVIEW_APP_HTML` import path + identifier rename. Minimise the diff — ONE import line + ONE usage in `serveSpa()` (grep first to confirm call sites).
- No prior failed plan for this unit exists; this is the first bolt. No recent refactor directly in `review-app/` that conflicts.

## Files to Modify

### A. New package: `packages/haiku-ui/`

A1. **`packages/haiku-ui/package.json`** (NEW)
   - `"name": "haiku-ui"` (bare name, consistent with `haiku-api` — NOT `@haiku/ui`; keeps import paths `from "haiku-ui"` if ever imported from another workspace).
   - `"private": true`, `"type": "module"`, `"version": "0.1.0"`.
   - `"scripts"`: `"dev": "vite"`, `"build": "tsc -b && vite build"`, `"typecheck": "tsc --noEmit"`, `"test": "playwright test"`.
   - `"dependencies"`: `@haiku/shared` (`file:../shared`), `haiku-api` (`*`), `@sentry/react`, `@xyflow/react`, `elkjs`, `react`, `react-dom`, `react-markdown`, `remark`, `remark-gfm`, `remark-html` — mirror current `review-app/package.json`.
   - `"devDependencies"`: `@tailwindcss/typography`, `@tailwindcss/vite`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `tailwindcss`, `typescript`, `vite`, `@playwright/test`, `jsdom` (for the rAF-coalesce render test).

A2. **`packages/haiku-ui/tsconfig.json`** (NEW) — copy from `review-app/tsconfig.json` verbatim; `include: ["src"]` unchanged.

A3. **`packages/haiku-ui/vite.config.ts`** (NEW) — copy from `review-app/vite.config.ts`; update the plugin-json path from `../../plugin/.claude-plugin/plugin.json` → `../../plugin/.claude-plugin/plugin.json` (path is unchanged — `packages/haiku-ui` is a sibling of `packages/haiku`, so `../../plugin` still resolves). Keep `define`, `build.minify: false`, `build.sourcemap: true`, `cssCodeSplit: false`, `assetsInlineLimit: Infinity`, `manualChunks: undefined`, `inlineDynamicImports: true` — these are load-bearing for the single-HTML-blob invariant.

A4. **`packages/haiku-ui/postcss.config.js`** (NEW, if needed) — `review-app/` has no `postcss.config.js` today (Tailwind v4 uses the `@tailwindcss/vite` plugin, not PostCSS). Spec mentions it; create as a no-op stub ONLY if the build requires it. Verify by running `vite build` once without it and seeing if it's referenced. **Likely skip this file entirely.**

A5. **`packages/haiku-ui/index.html`** (NEW) — copy from `review-app/index.html` verbatim (`<script src="/src/main.tsx">` entry point unchanged).

A6. **`packages/haiku-ui/src/main.tsx`, `App.tsx`, `index.css`, `vite-env.d.ts`, `components/*`, `hooks/*`** — moved via `git mv packages/haiku/review-app/src/* packages/haiku-ui/src/`. Preserves history.

A7. **`packages/haiku-ui/src/types.ts`** — REWRITE as a re-export barrel:
   ```ts
   // Re-exports only. No local type definitions.
   export type {
     ReviewSessionPayload as SessionData,  // covers the review shape the app reads
     ReviewAnnotations,
     QuestionDef,
     QuestionAnswer,
     DesignArchetypeData,
     DesignParameterData,
     PreviousReviewSnapshot,
     StageStateInfo,
     KnowledgeFile,
     StageArtifact,
     OutputArtifact,
     FeedbackItem as FeedbackItemData,
     FeedbackListResponse,
     ReviewCurrentPayload as ReviewCurrentResponse,
   } from "haiku-api"
   export type { CriterionItem, MockupInfo } from "@haiku/shared"
   ```
   - NOTE: The current `types.ts` declares `SessionData` as a loose union across all three session types. `haiku-api` exposes `SessionPayload` (discriminated union) and per-type payloads. Map `SessionData` → `SessionPayload` (NOT `ReviewSessionPayload`) if any code reads question/direction fields off `session` — check `App.tsx`, `QuestionPage.tsx`, `DesignPicker.tsx` during the builder phase and re-alias accordingly. Safer choice for v1: `export type { SessionPayload as SessionData } from "haiku-api"`. Verify with `tsc --noEmit` after the rewrite.
   - Current `types.ts` also declares `Section`, `UnitFrontmatter`, `ParsedUnit`, `IntentFrontmatter`, `ParsedIntent` — these are parsed markdown shapes, NOT wire types. They live on the backend (`sessions.ts` builds them). `haiku-api` deliberately uses `LooseRecord` for these (see `session.ts:37-41`). Options:
     1. Re-declare them locally inside `types.ts` as `interface` — but the unit spec says grep for local `export type|export interface` in `types.ts` MUST return zero.
     2. Move them to a sibling file `packages/haiku-ui/src/parsed.ts` and import from there. Grep still passes on `types.ts`.
     3. Extend `@haiku/shared` with these types (adds cross-package API surface — overkill for a relocation unit).
   - **Chosen**: Option 2 — extract `Section`/`ParsedUnit`/`ParsedIntent`/`*Frontmatter` into `packages/haiku-ui/src/parsed.ts`, update all component imports from `"../types"` to `"../types"` (for wire types) or `"../parsed"` (for parser shapes). The grep-for-zero invariant is satisfied.

A8. **`packages/haiku-ui/src/api/client.ts`** (NEW) — single `ApiClient` abstraction. Interface:
   ```ts
   export interface ApiClient {
     fetchSession(sessionId: string): Promise<SessionPayload>
     submitDecision(sessionId: string, decision: ReviewDecisionRequest): Promise<void>
     submitAnswer(sessionId: string, answer: QuestionAnswerRequest): Promise<void>
     submitDirection(sessionId: string, select: DirectionSelectRequest): Promise<void>
     feedback: {
       list(intent: string, stage: string, status?: FeedbackStatus): Promise<FeedbackListResponse>
       create(intent: string, stage: string, body: FeedbackCreateRequest): Promise<FeedbackCreateResponse>
       update(intent: string, stage: string, id: string, body: FeedbackUpdateRequest): Promise<FeedbackUpdateResponse>
       delete(intent: string, stage: string, id: string): Promise<FeedbackDeleteResponse>
     }
     openWebSocket(sessionId: string): WebSocket | null
   }
   export function createDefaultApiClient(): ApiClient { /* wraps fetch + WebSocket, uses paths from haiku-api */ }
   ```
   - Implementation pulls `paths.*` from `haiku-api` where they exist; otherwise uses the literal `/api/...` / `/review/...` / `/question/...` / `/direction/...` paths (these already live in `haiku-api/src/routes.ts`).
   - The hooks (`useSession`, `useFeedback`, `useSessionWebSocket`) receive the client via a React context provider at the `App.tsx` root (`<ApiClientProvider client={createDefaultApiClient()}>...</ApiClientProvider>`). Default client is constructed once at module scope.
   - Future hosts can supply a mock client for Storybook / tests / embed scenarios. This is the "future extraction hook" the spec asks for.

A9. **`packages/haiku-ui/src/hooks/useSession.ts`** — port existing file; strip local `SessionData` import (use `haiku-api` type via `types.ts` re-export); inject `ApiClient` via `useApiClient()` hook (new, trivial `useContext` wrapper).
   - `submitDecision`/`submitAnswers`/`submitDesignDirection` now delegate to `client.submitDecision(...)` etc.; WebSocket send path unchanged.

A10. **`packages/haiku-ui/src/hooks/useSessionWebSocket.ts`** (NEW standalone file — currently co-located in `useSession.ts`)
   - Extract `useSessionWebSocket` into its own file.
   - **rAF coalescing**: when a `session-update` frame arrives over the WebSocket, DO NOT call `setState` synchronously. Instead, store the latest payload in a `useRef` and schedule a `requestAnimationFrame` callback (idempotent — only one RAF pending at a time). The RAF callback reads the latest ref value and calls `setState` exactly once per frame. This batches bursts — 100 frames in one tick → one render.
   - Algorithm:
     ```ts
     const pendingRef = useRef<SessionPayload | null>(null)
     const rafRef = useRef<number | null>(null)
     ws.onmessage = (ev) => {
       const msg = WsServerMessageSchema.parse(JSON.parse(ev.data))  // typed
       if (msg.type !== "session-update") return
       pendingRef.current = msg.payload
       if (rafRef.current !== null) return  // already scheduled
       rafRef.current = requestAnimationFrame(() => {
         rafRef.current = null
         const payload = pendingRef.current
         pendingRef.current = null
         if (payload) onUpdate(payload)  // one setState per frame
       })
     }
     ```
   - Cleanup on unmount: `cancelAnimationFrame(rafRef.current)` if non-null.

A11. **`packages/haiku-ui/src/index.css`** — moved verbatim; Tailwind v4 `@theme` / `@source` directives adjusted if any paths reference `review-app` (grep the current file).

A12. **`packages/haiku-ui/README.md`** (NEW) — describes:
   - "This is the H·AI·K·U agent-collaboration UI. Hosts run this as a vite SPA (dev) or consume a pre-bundled inline HTML blob (prod, inlined by `packages/haiku/scripts/bundle-haiku-ui.mjs`)."
   - Backend contract: points to `haiku-api`'s OpenAPI spec (`../haiku-api/dist/openapi.json`). "All request/response types come from `haiku-api`; the SPA contains zero local wire-type declarations."
   - "How to run locally against a mock backend": `npm run dev -w haiku-ui` (vite's dev server on `:5173`); for real MCP, run `bun run build -w haiku` to embed the SPA then launch the MCP on `:7777`.

A13. **`packages/haiku-ui/budget.json`** (NEW) — committed size budget for CI. `{ "bundleGzipMaxBytes": 512000, "lastKnownGzipBytes": <measured> }`. `lastKnownGzipBytes` captured at end of this unit (see T2 verification).

A14. **`packages/haiku-ui/tests/parity.spec.ts`** (NEW, Playwright) — boots a test-only MCP server pointed at the three committed fixtures (A15), renders each page in a headless browser, serialises the DOM tree, and asserts it matches the committed snapshot.
   - **DOM transformer**: a helper that strips volatile attributes (`data-reactid`, `data-rk`, auto-generated `id="r-\d+"`, React dev-only attributes). Matches `/data-reactid|data-rk|^id="r-\d+"|__vite_\w+/` and drops them before snapshot comparison.
   - Snapshots live at `packages/haiku-ui/tests/__snapshots__/{review,question,direction}.dom.txt`.

A15. **`packages/haiku-ui/test-fixtures/{review,question,direction}-session.json`** (NEW) — hand-crafted `SessionPayload` instances matching the three session types. Built by running the current (pre-move) review-app against realistic data, capturing via the existing `scripts/capture-test-baseline.mjs` (already in `packages/haiku/scripts/`) or hand-authoring. Commit the JSON.

### B. Bundler / MCP integration

B1. **`packages/haiku/scripts/bundle-haiku-ui.mjs`** (NEW) — renamed from `build-review-app.mjs`. Changes:
   - `reviewAppDir` → `haikuUiDir = join(root, "..", "haiku-ui")` (sibling package).
   - `tsFile = join(root, "src", "haiku-ui-html.ts")` (was `review-app-html.ts`).
   - Export constant renamed: `REVIEW_APP_HTML` → `HAIKU_UI_HTML`.
   - Invokes `npm run build -w haiku-ui` at repo root (`execSync("npm run build -w haiku-ui", { cwd: repoRoot, stdio: "inherit" })`) instead of `cd review-app && npm run build`. This lets workspaces hoist properly. Alternatively keep `execSync("npm run build", { cwd: haikuUiDir })`.
   - Inlining logic unchanged.
   - **Bundle-size assertion**: after writing the inlined HTML, gzip the output (`zlib.gzipSync`) and assert `gzipped.length ≤ 500 * 1024` (500 KB). On overage: `console.error(...)` + `process.exit(1)`. Success path: write the measured gzip byte count back into `packages/haiku-ui/budget.json:lastKnownGzipBytes`.

B2. **`packages/haiku/scripts/build-review-app.mjs`** — `git rm` (or `git mv` to B1 path). History preservation favours `git mv`.

B3. **`packages/haiku/scripts/compare-bundle.mjs`** (NEW) — takes two file paths as argv, reads both, strips lines matching `/build-timestamp|mtime|sourcemap hash|__vite_\w+/` using a shared filter, then does a byte-level diff of the remainder. Exit 0 on match, 1 on difference. Print the first ~20 lines of diff on mismatch for debuggability. Invoked by the completion-criteria `node scripts/compare-bundle.mjs ...` check.

B4. **`packages/haiku/src/haiku-ui-html.ts`** (NEW, AUTO-GENERATED) — `export const HAIKU_UI_HTML: string = "..."`. Generated by B1 during the build. Committed so the MCP bundle can be rebuilt without first rebuilding the SPA (matches the current `review-app-html.ts` commit pattern).

B5. **`packages/haiku/src/review-app-html.ts`** — delete after the rename lands and `http.ts` is updated.

B6. **`packages/haiku/src/http.ts`** — line 37:
   - `import { REVIEW_APP_HTML } from "./review-app-html.js"` → `import { HAIKU_UI_HTML } from "./haiku-ui-html.js"`.
   - Update `serveSpa()` body to return `HAIKU_UI_HTML` (grep for `REVIEW_APP_HTML` in the file; only one usage expected).

B7. **`packages/haiku/package.json`**
   - `prebuild` script: `node scripts/build-css.mjs && node scripts/bundle-haiku-ui.mjs` (was `build-review-app.mjs`).
   - `devDependencies`: no change expected (react/vite live in haiku-ui). Double-check no `@sentry/react` / `react` / `vite` / `@vitejs/plugin-react` / `@tailwindcss/vite` sneak in.
   - `dependencies`: add `haiku-ui: "*"` — NO. Don't add; the MCP consumes the bundled HTML via the generated `haiku-ui-html.ts` TS file, not via a runtime import. Adding it would create a circular dep (haiku-ui deps haiku-api, haiku deps haiku-api). Confirm by rebuilding and grepping the final binary.

B8. **`packages/haiku/review-app/`** — `git rm -r` entire directory AFTER the move is verified (all source and `package-lock.json`). Preserve the `review-app/package-lock.json` in the move if history is important; otherwise it's stale.

### C. Root workspace wiring

C1. **`package.json` (root)** — add `packages/haiku-ui` to `workspaces` array. Order: `["website", "packages/haiku", "packages/haiku-api", "packages/haiku-ui", "packages/shared"]`. Any order is fine — bun/npm walks the list.

C2. **`package-lock.json` (root)** — regenerated by `npm install` after the workspace change. Commit the regenerated lockfile.

C3. **`biome.json`** — confirm no `ignore` rules reference `review-app`. If they do, update to `haiku-ui`.

### D. Baseline capture (BEFORE any move)

D1. **`stages/development/artifacts/bundle-baseline.html`** (NEW, committed) — captured by running `cd packages/haiku/review-app && npm install && npm run build && cat dist/index.html > ../../../.haiku/intents/.../artifacts/bundle-baseline.html` at the start of the builder hat's work (before any file moves). This is the byte-identical reference the completion check diffs against. Must be committed at the start so the diff is deterministic.

D2. **DOM-parity snapshots** — capture from the pre-move build too. Run Playwright against the pre-move dev server (or the built `dist/index.html` served statically) with the three fixtures, write DOM trees to `packages/haiku-ui/tests/__snapshots__/` — but the files have to live at the NEW path because `haiku-ui/` doesn't exist yet pre-move. Solution: capture into a tmp dir (`/tmp/haiku-ui-dom-*.txt`), commit them as part of unit-03 after the move under the new path. Alternative: capture straight into `packages/haiku/review-app/tests/__snapshots__/` first, then `git mv` along with the rest of the move.

### E. Feature-spec coverage (planner MUST include test steps for each .feature)

Looking at `.haiku/intents/.../features/`:
- `additive-elaborate.feature`, `auto-revisit.feature`, `enforce-iteration-fix.feature`, `external-review-feedback.feature`, `feedback-crud.feature`, `review-ui-feedback.feature`, `revisit-with-reasons.feature`.

These describe orchestrator/HTTP/hook behaviours, NOT this unit's scope. Unit-03 is a pure relocation; no new user-facing behaviour and no existing `.feature` semantics change. Test coverage for the feature files is owned by the units that implement the behaviours (units 02 and 04–14). For this unit:

E1. **Parity as the behavioural spec.** The implicit contract for this unit is "the UI behaves IDENTICALLY to the pre-move review-app for all traffic patterns described by those feature files." The byte-identical bundle check (T2) + DOM-parity Playwright test (T3) are the test coverage that proves no scenario regressed.

E2. **rAF coalescing unit test** (`packages/haiku-ui/tests/use-session-websocket.test.tsx`, NEW) — dispatches 100 `session-update` WS frames in a tight loop via a mocked `WebSocket`, asserts React committed exactly one render (use `@testing-library/react` + a render-counter). Runs under the `playwright test` harness OR switch to a jsdom-based runner — `vitest` with `jsdom` is the simplest path; add `vitest` + `@testing-library/react` + `jsdom` to haiku-ui devDeps. Alternatively, re-use the existing `packages/haiku` node-based test runner with a JSDOM wrapper. **Chosen**: add `vitest` + `jsdom` to haiku-ui; small, self-contained, no impact on other packages.

## Implementation Steps (ordered — commit each)

1. **Baseline capture** (D1, D2). Run `npm install` at repo root, run `cd packages/haiku/review-app && npm run build`, copy `dist/index.html` → `stages/development/artifacts/bundle-baseline.html`. Commit: `haiku(unit-03/planner): capture pre-move bundle baseline`.

2. **New package skeleton** — create `packages/haiku-ui/` with `package.json` (A1), `tsconfig.json` (A2), `vite.config.ts` (A3), `index.html` (A5), `README.md` (A12), `budget.json` (A13), empty `src/`. Update root `package.json` workspaces (C1). Run `npm install` at repo root to wire it up. Commit: `haiku(unit-03/builder): scaffold empty haiku-ui workspace package`.

3. **Move source** — `git mv packages/haiku/review-app/src/* packages/haiku-ui/src/`. Also `git mv packages/haiku/review-app/tsconfig.json packages/haiku-ui/tsconfig.json` if it differs from A2 (it should be identical; just drop the old). `git rm -r packages/haiku/review-app/` (removes the old wrapper). Commit: `haiku(unit-03/builder): git mv review-app -> haiku-ui (history preserved)`.

4. **Rewire types** — rewrite `packages/haiku-ui/src/types.ts` to the re-export barrel (A7). Move parser shapes to `parsed.ts`. Update every import across `components/` and `hooks/` that pulled the now-removed local types. Run `tsc --noEmit` in `haiku-ui` until clean. Commit: `haiku(unit-03/builder): types.ts re-exports from haiku-api (zero local wire types)`.

5. **ApiClient abstraction** — create `packages/haiku-ui/src/api/client.ts` (A8). Add `ApiClientProvider` + `useApiClient` hook. Refactor `useSession` (A9) + `useFeedback` to call via the client instead of raw `fetch`. Commit: `haiku(unit-03/builder): extract ApiClient abstraction for future host injection`.

6. **Extract useSessionWebSocket with rAF coalescing** — move `useSessionWebSocket` into its own file (A10). Implement the rAF batching path. Wire up `WsServerMessageSchema.parse` for incoming frames (typed end-to-end via `haiku-api`). Commit: `haiku(unit-03/builder): rAF-coalesce session-update frames in useSessionWebSocket`.

7. **Bundler rename** — `git mv packages/haiku/scripts/build-review-app.mjs packages/haiku/scripts/bundle-haiku-ui.mjs`. Update paths inside (B1). Add compare-bundle.mjs (B3). Update `packages/haiku/package.json` `prebuild` (B7). Commit: `haiku(unit-03/builder): rename build-review-app -> bundle-haiku-ui + compare-bundle script`.

8. **Rewire http.ts** — update the import + usage (B6). Delete `src/review-app-html.ts` (B5). Run `node scripts/bundle-haiku-ui.mjs` to regenerate `src/haiku-ui-html.ts` (B4). Commit: `haiku(unit-03/builder): http.ts serves HAIKU_UI_HTML (bundle regenerated)`.

9. **Playwright + vitest scaffolding** — add `tests/parity.spec.ts` (A14), `test-fixtures/*.json` (A15), `tests/use-session-websocket.test.tsx` (E2). Capture DOM snapshots by running the pre-move build once more (via the committed baseline.html served statically). Commit: `haiku(unit-03/builder): parity + rAF coalesce tests`.

10. **Bundle-size budget** — run `node scripts/bundle-haiku-ui.mjs`, read measured gzip size, write to `packages/haiku-ui/budget.json:lastKnownGzipBytes`. Commit: `haiku(unit-03/builder): commit haiku-ui bundle size budget`.

11. **Declare outputs** — set unit frontmatter `outputs:` to include all committed paths (via `haiku_unit_set`). Since the `code` output's location is `(project source tree)`, auto-detection should cover it, but explicitly list notable artifacts: `stages/development/artifacts/bundle-baseline.html`, `stages/development/artifacts/unit-03-tactical-plan.md`. Commit: `haiku(unit-03/builder): declare unit outputs`.

## Verification Commands (hat checkpoints)

| Step | Command | Pass criterion |
|---|---|---|
| T1 | `npx tsc --noEmit` (at repo root via `npm run -w haiku-ui typecheck && npm run -w haiku typecheck`) | Exit 0, no errors |
| T2 | `node packages/haiku/scripts/compare-bundle.mjs .haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/bundle-baseline.html packages/haiku-ui/dist/index.html` | Exit 0 |
| T3 | `npx playwright test` inside `packages/haiku-ui/` | 3 fixtures pass, DOM snapshots match |
| T4 | `npx vitest run tests/use-session-websocket.test.tsx` inside `packages/haiku-ui/` | 1 render observed for 100 dispatched frames |
| T5 | `npm run build -w haiku-ui` | Produces `packages/haiku-ui/dist/index.html`; gzip ≤ 500 KB |
| T6 | `npm run build -w haiku` | Regenerates `packages/haiku/src/haiku-ui-html.ts`, produces `plugin/bin/haiku` |
| T7 | `grep -R "review-app-html" packages/haiku/src/` | Zero matches |
| T8 | `grep -R "REVIEW_APP_HTML" packages/haiku/src/` | Zero matches |
| T9 | `grep -E "^export (type\|interface)" packages/haiku-ui/src/types.ts` | Zero matches |
| T10 | `grep -r "as any" packages/haiku-ui/src/` | Zero matches |
| T11 | `ls packages/haiku/review-app/ 2>&1` | "No such file or directory" |
| T12 | `bun run test` (or `npm test` at repo root) | All 477 baseline tests still pass + 4 new tests (3 parity + 1 rAF) = 481 |
| T13 | Refresh `stages/development/artifacts/test-deltas.json` via `node packages/haiku/scripts/capture-test-baseline.mjs` or the existing delta tooling | `regressed: 0`, `added: ≥ 4` |

## Risks & Mitigations

1. **npm workspaces reinstall on move.** Moving a workspace can invalidate `package-lock.json` and cause resolution flakes. **Mitigation**: commit the root `package-lock.json` regeneration as a separate commit so reviewers can inspect it; run `npm install` once at repo root after the workspace wiring step.
2. **vite build subtly differs after relocation.** Relative paths inside `vite.config.ts` (`../../plugin/.claude-plugin/plugin.json`) still resolve because `packages/haiku-ui/` is a sibling of `packages/haiku/`, same depth. Still — verify by running `npm run build -w haiku-ui` ONCE with a tmp baseline diff before claiming no-visual-change. **Mitigation**: T2 (byte-identical compare) catches any silent drift.
3. **Sourcemap hashes + inline chunk IDs cause false-positive diffs.** `compare-bundle.mjs` strips `/build-timestamp|mtime|sourcemap hash|__vite_\w+/`. If the pre-move build and post-move build still diverge after stripping, it's real. **Mitigation**: run compare locally early in the builder hat; adjust the strip regex if a new volatile pattern shows up, but document the addition in the PR.
4. **`SessionData` union drift.** Current review-app reads question/direction fields off the same `session` object (loose union). `haiku-api`'s `SessionPayload` is a discriminated union — narrowing may require small `if (session.session_type === "question")` guards. **Mitigation**: during step 4 (rewire types), run `tsc --noEmit` continuously; fix narrowing errors as they surface. If fixes are mechanical (`session.questions` → `if (session.session_type === "question") session.questions`), keep them in this unit; if they're non-trivial, surface a reviewer finding.
5. **`@haiku/shared` still lives inside `review-app`'s imports.** After the move, `@haiku/shared` path resolution depends on npm workspaces finding `packages/shared`. It does — confirmed by root `package.json` workspaces. **Mitigation**: `file:../../shared` in the package.json update to `file:../shared` (one less `../`).
6. **Parity test flakes from non-deterministic auto-generated IDs.** The DOM transformer already strips `data-reactid`, auto `id="r-\d+"`. If the snapshot diff flags other volatile attributes, extend the strip list. **Mitigation**: be explicit about which attributes are volatile in a comment inside the transformer.
7. **`playwright` + `vitest` both in haiku-ui devDeps bloat CI.** Acceptable — both are dev-only, not in the runtime bundle. `@playwright/test` is already a root devDep. **Mitigation**: keep playwright pinned to the root version to avoid two copies.
8. **History preservation for `components/mermaid-flow/`.** Subdirectory; `git mv packages/haiku/review-app/src/* packages/haiku-ui/src/` with `*` expansion may or may not recurse depending on shell. **Mitigation**: use `git mv packages/haiku/review-app/src packages/haiku-ui/src-tmp && rm -rf packages/haiku-ui/src && mv packages/haiku-ui/src-tmp packages/haiku-ui/src` — or simpler, `git mv packages/haiku/review-app packages/haiku-ui-move-tmp` then reshape directory. Verify with `git log --follow packages/haiku-ui/src/components/mermaid-flow/parser.ts` after the move.
9. **Bundle size budget breaks on first commit.** If the measured gzip already exceeds 500 KB pre-move (current review-app has `@xyflow/react` + `elkjs` — both heavy), the completion criterion is unachievable without tree-shaking work beyond this unit's scope. **Mitigation**: measure BEFORE proposing the budget. If current gzip is already > 500 KB, raise a reviewer finding and negotiate the budget number in the unit spec before continuing. Expected: rough estimate ~400 KB gzipped based on vite's `manualChunks: undefined` + `inlineDynamicImports: true`. Worth verifying early.
10. **MCP build chain break from rename.** `prebuild` must succeed before `build`. If the rename commit breaks `prebuild`, the next `npm run build -w haiku` fails. **Mitigation**: run `npm run build -w haiku` immediately after step 8 and before any further commits.

## Out-of-Scope (explicit — do NOT touch)

- Tokens, component restyling, a11y changes — later units (04–14).
- Route-table additions (request/response payload shapes). Contract locked in unit-01/unit-02.
- Session storage, SessionStorage abstraction, or sessions.ts changes.
- New `.feature` files. Existing specs already cover the behaviours this relocation preserves.
- Feedback component changes — unit-08.
- Changing the MCP rename `haiku_feedback` → `haiku_report` (already landed via `legacy-rename-haiku-feedback-to-haiku-report.md` artifact in a prior cycle, different from THIS unit-03 which is UI extraction — naming collision resolved by FB-44 rename; this unit is tracked by the `unit-03-extract-haiku-ui-package.md` filename).

## Completion Criteria Mapping (from unit spec → plan step)

| Criterion | Verified by | Plan step |
|---|---|---|
| `packages/haiku-ui/` contains former review-app code | `ls packages/haiku-ui/src` has `App.tsx`, `components/`, `hooks/` | step 3 |
| `packages/haiku/review-app/` does not exist | T11 | step 3 |
| Root workspaces include `packages/haiku-ui` | `cat package.json` | step 2 (C1) |
| `types.ts` re-exports only | T9 | step 4 (A7) |
| No `as any` in haiku-ui/src | T10 | step 4 |
| Gzipped bundle ≤ 500 KB | T5 + B1 assertion | step 10 |
| MCP build embeds haiku-ui bundle | T6 | step 8 |
| Bundle comparison exits 0 | T2 | step 8 (D1 baseline + B3 compare) |
| DOM parity test passes (all 3 fixtures) | T3 | step 9 |
| rAF coalescing test = 1 render for 100 bursts | T4 | step 9 (E2) |
| `review-app-html` grep returns zero | T7, T8 | step 8 |
| `tsc --noEmit` passes | T1 | step 4, verified continuously |
| `npm test` passes | T12 | step 11 (and all prior steps) |

## Open questions (none blocking — resolved by defaults above)

- `SessionData` mapping: default to `SessionPayload` (full discriminated union); adjust narrowing at type-check time.
- Whether to add `vitest` or stick with node's built-in runner for the rAF test: add `vitest` + `jsdom` (cleanest React-testing story).
- `postcss.config.js`: skip — Tailwind v4 uses `@tailwindcss/vite`, no PostCSS config needed.

---

**Hand-off to builder:** Start at step 1 (baseline capture). Do not skip D1 — the diff reference has to be committed before the move or T2 can never pass.
