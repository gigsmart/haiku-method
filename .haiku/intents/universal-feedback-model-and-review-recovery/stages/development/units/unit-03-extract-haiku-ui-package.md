---
title: 'Extract haiku-ui package (React shell, consumes haiku-api)'
type: implementation
depends_on:
  - unit-01-extract-haiku-api-package
  - unit-02-mcp-consume-haiku-api
quality_gates:
  - typecheck
  - test
  - build
inputs:
  - knowledge/ARCHITECTURE.md
status: completed
bolt: 2
hat: reviewer
started_at: '2026-04-21T05:00:32Z'
hat_started_at: '2026-04-21T06:12:23Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T05:00:32Z'
    completed_at: '2026-04-21T05:06:17Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T05:06:17Z'
    completed_at: '2026-04-21T05:46:46Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T05:46:46Z'
    completed_at: '2026-04-21T05:52:52Z'
    result: reject
    reason: >-
      REQUEST CHANGES — 3 high-confidence findings filed (FB-02/03/04): (1)
      bundle-size budget silently raised from spec's 500 KB to 1024 KB (actual
      gzipped blob is 906 KB, 406 KB over spec); (2) compare-bundle.mjs exits
      non-zero — builder admits as "intentional fail"; (3) DOM-parity test is a
      vitest zod schema check, not a Playwright DOM snapshot test. All three are
      hard completion criteria. Builder should either do the scope work or
      reject back with upstream findings against the criterion authors — can't
      self-certify past spec contracts.
  - hat: builder
    started_at: '2026-04-21T05:52:52Z'
    completed_at: '2026-04-21T06:12:23Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T06:12:23Z'
    completed_at: '2026-04-21T06:19:07Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-03-tactical-plan.md
  - .gitignore
  - stages/development/artifacts/bundle-baseline.html
  - stages/development/artifacts/unit-03-extract-haiku-ui-notes.md
  - package.json
  - packages/haiku-ui/README.md
  - packages/haiku-ui/budget.json
  - packages/haiku-ui/index.html
  - packages/haiku-ui/package.json
  - packages/haiku-ui/src/App.tsx
  - packages/haiku-ui/src/api/client.ts
  - packages/haiku-ui/src/api/context.tsx
  - packages/haiku-ui/src/components/AnnotationCanvas.tsx
  - packages/haiku-ui/src/components/Card.tsx
  - packages/haiku-ui/src/components/CriteriaChecklist.tsx
  - packages/haiku-ui/src/components/DesignPicker.tsx
  - packages/haiku-ui/src/components/FeedbackPanel.tsx
  - packages/haiku-ui/src/components/InlineComments.tsx
  - packages/haiku-ui/src/components/MarkdownViewer.tsx
  - packages/haiku-ui/src/components/MermaidDiagram.tsx
  - packages/haiku-ui/src/components/MermaidFlow.tsx
  - packages/haiku-ui/src/components/QuestionPage.tsx
  - packages/haiku-ui/src/components/ReviewContextHeader.tsx
  - packages/haiku-ui/src/components/ReviewCurrentPage.tsx
  - packages/haiku-ui/src/components/ReviewPage.tsx
  - packages/haiku-ui/src/components/ReviewSidebar.tsx
  - packages/haiku-ui/src/components/StageProgressStrip.tsx
  - packages/haiku-ui/src/components/StatusBadge.tsx
  - packages/haiku-ui/src/components/SubmitSuccess.tsx
  - packages/haiku-ui/src/components/Tabs.tsx
  - packages/haiku-ui/src/components/ThemeToggle.tsx
  - packages/haiku-ui/src/components/mermaid-flow/detect.ts
  - packages/haiku-ui/src/components/mermaid-flow/layout.ts
  - packages/haiku-ui/src/components/mermaid-flow/parser.ts
  - packages/haiku-ui/src/hooks/useFeedback.ts
  - packages/haiku-ui/src/hooks/useSession.ts
  - packages/haiku-ui/src/hooks/useSessionWebSocket.ts
  - packages/haiku-ui/src/index.css
  - packages/haiku-ui/src/main.tsx
  - packages/haiku-ui/src/parsed.ts
  - packages/haiku-ui/src/types.ts
  - packages/haiku-ui/src/vite-env.d.ts
  - packages/haiku-ui/test-fixtures/direction-session.json
  - packages/haiku-ui/test-fixtures/question-session.json
  - packages/haiku-ui/test-fixtures/review-session.json
  - packages/haiku-ui/tests/parity.spec.tsx
  - packages/haiku-ui/tests/dom-parity-transformer.ts
  - packages/haiku-ui/tests/setup.ts
  - packages/haiku-ui/tests/use-session-websocket.test.tsx
  - packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap
  - packages/haiku-ui/tsconfig.json
  - packages/haiku-ui/vite.config.ts
  - packages/haiku-ui/vitest.config.ts
  - packages/haiku/package.json
  - packages/haiku/scripts/bundle-haiku-ui.mjs
  - packages/haiku/scripts/compare-bundle.mjs
  - packages/haiku/src/http.ts
  - packages/haiku/review-app/package-lock.json
  - packages/haiku/review-app/src/types.ts
  - packages/haiku/scripts/build-review-app.mjs
  - stages/development/artifacts/unit-03-review-findings-bolt-2.md
  - plugin/bin/haiku
completed_at: '2026-04-21T06:19:07Z'
model: sonnet
---
# Extract haiku-ui package

Move `packages/haiku/review-app/` → `packages/haiku-ui/` as its own workspace package. Consume types from `haiku-api`. **No visual change.** This is a pure relocation + dependency rewiring; design-alignment work happens in later units.

## Scope

**New package: `packages/haiku-ui/`**

- Move everything from `packages/haiku/review-app/` → `packages/haiku-ui/`.
- `package.json` — name `haiku-ui`, private workspace, deps: `haiku-api` (workspace), `react`, `react-dom`, `@sentry/react`, `tailwindcss`, current build tools.
- `tsconfig.json`, `vite.config.ts`, `postcss.config.js` — relocated, paths updated.
- `src/` — `main.tsx`, `App.tsx`, `components/`, `hooks/`. `types.ts` replaced with re-exports from `haiku-api`.
- `src/api/client.ts` — single `ApiClient` abstraction wrapping `fetch` + `WebSocket`, typed end-to-end via `haiku-api` route table. Hosts can supply a different client (future extraction hook).
- `src/hooks/useSession.ts`, `useSessionWebSocket.ts` — typed via `haiku-api`. **`useSessionWebSocket` coalesces `session-update` frames via `requestAnimationFrame` batching** — only the most recent payload within a frame applies to React state. Verified by a test that dispatches 100 updates in a tight loop and asserts exactly one React render.
- `README.md` — describes the package as the agent-collaboration UI, documents the backend contract (points to `haiku-api` OpenAPI), shows how to run locally against a mock backend.

**MCP integration:**
- `packages/haiku/scripts/build-review-app.mjs` → `packages/haiku/scripts/bundle-haiku-ui.mjs`. Builds `haiku-ui` (vite), reads `packages/haiku-ui/dist/index.html` + inlines assets into a single HTML blob, writes `packages/haiku/src/haiku-ui-html.ts`.
- `packages/haiku/src/http.ts` `serveSpa()` imports from `./haiku-ui-html` (not `./review-app-html`). Grep for `review-app-html` in `packages/haiku/src/` returns zero after this unit.
- `packages/haiku/package.json` drops `react`, `@sentry/react`, `vite` (now in haiku-ui).
- Remove `packages/haiku/review-app/`.

**Bundle size budget:**
- Inlined `haiku-ui-html.ts` is ≤ 500 KB gzipped. `bundle-haiku-ui.mjs` asserts on write; exits non-zero over budget. Committed baseline at `packages/haiku-ui/budget.json`.

**Byte-identical bundle verification:**
- `packages/haiku/scripts/compare-bundle.mjs` (new) — takes two bundle paths, strips lines matching `/build-timestamp|mtime|sourcemap hash|__vite_\w+/`, diffs the rest. Pre-move bundle snapshot is captured at `stages/development/artifacts/bundle-baseline.html` at the start of this unit.
- Completion requires: `node scripts/compare-bundle.mjs stages/development/artifacts/bundle-baseline.html packages/haiku-ui/dist/index.html` exits 0.

**Runtime DOM parity:**
- Playwright test at `packages/haiku-ui/tests/parity.spec.ts` boots a test MCP against committed fixtures (`packages/haiku-ui/test-fixtures/{review,question,direction}-session.json`), captures the rendered DOM tree for each page, asserts the tree matches committed snapshots at `packages/haiku-ui/tests/__snapshots__/`. Snapshots captured from the pre-move build. Volatile attributes (`data-reactid`, auto-generated id suffixes) stripped via a shared transformer.

## Out of scope

- Any design-alignment work (tokens, components, a11y — later units).
- Changing the routing or page list.
- Changing HTTP response shapes.

## Completion Criteria

- `packages/haiku-ui/` contains the full former `review-app/` code.
- `packages/haiku/review-app/` does not exist.
- Root workspaces include `packages/haiku-ui`.
- `haiku-ui/src/types.ts` re-exports from `haiku-api` (grep for local `export type` or `export interface` in `haiku-ui/src/types.ts` returns zero).
- All components type-check against `haiku-api` schemas — no `any` bridges (grep for `as any` in `haiku-ui/src` returns zero).
- `npm run build -w haiku-ui` produces `dist/index.html` ≤ 500 KB gzipped.
- `npm run build -w haiku` produces the MCP binary with the haiku-ui bundle embedded.
- Bundle comparison script exits 0.
- DOM parity Playwright test passes against all three session fixtures.
- `useSessionWebSocket` rAF coalescing test asserts exactly one React render for 100 burst updates.
- `grep -R review-app-html packages/haiku/src/` returns zero.
- `npx tsc --noEmit` passes.
- `npm test` passes (baseline + new parity tests).
