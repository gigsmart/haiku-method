# haiku-ui

The H·AI·K·U agent-collaboration UI — a React SPA that hosts review, question,
and design-direction sessions for human reviewers.

Hosts run this package two ways:

- **Development** — `npm run dev -w haiku-ui` starts the Vite dev server on
  `:5173`. Point it at a running H·AI·K·U MCP (defaults assume the MCP is on
  `:7777`; override with standard Vite proxy config if needed).
- **Production** — `packages/haiku/scripts/bundle-haiku-ui.mjs` builds this
  package with Vite, inlines every asset into a single HTML blob, and writes
  the result as a TypeScript string constant consumed by the MCP HTTP server.
  The MCP binary ships the SPA embedded; no separate static-file step.

## Backend contract

All HTTP and WebSocket payloads are typed against `haiku-api`. There are zero
local wire-type declarations in this package — `src/types.ts` re-exports from
`haiku-api` and `@haiku/shared`.

See `packages/haiku-api/` for the OpenAPI route table and Zod schemas. The
`ApiClient` abstraction in `src/api/client.ts` is the single seam that wraps
`fetch` + `WebSocket`; hosts can supply an alternative client via
`<ApiClientProvider>` for mocked or embedded scenarios.

## WebSocket batching

`useSessionWebSocket` coalesces `session-update` frames via
`requestAnimationFrame`: bursty WS traffic (up to hundreds of frames per
second) collapses to one React render per animation frame. See
`tests/perf/use-session-websocket.test.tsx` for the coverage (two
consecutive bursts + real-rAF flushes → 2 renders; see
`tests/perf/README.md` for the perf tier contract).

## Running locally against a mock backend

```sh
# 1) run the MCP (bundles this package and serves it on :7777):
npm run build -w haiku
../haiku/plugin/bin/haiku --http 7777

# 2) in a second terminal, run this package's dev server (hot reload):
npm run dev -w haiku-ui
```

The dev server proxies to `:7777` by default. For pure-UI work without a
backend, stub `ApiClient` via the provider and feed it fixture data from
`test-fixtures/`.

## Component layering (FB-33)

Shared UI building blocks follow a single layering rule:

- **`@haiku/shared/components`** — the canonical home for cross-surface UI
  primitives (`CriteriaChecklist`, `MarkdownViewer`, `StatusBadge`,
  `ProgressBar`, `FileTree`). Platform-agnostic, React peer-depended, consumed
  by any app surface that renders H·AI·K·U artifacts. If a component could
  plausibly be rendered by a second surface (review, question, direction,
  future embed hosts), it belongs here.
- **`haiku-ui/src/components/`** — app-specific components owned by this SPA
  only. Review-session orchestration, session-scoped layout, WebSocket-driven
  panels, feedback UI (`components/feedback/*`). These MUST NOT be
  re-exported as library surface — they are implementation details of this
  app.

**Rule:** do not duplicate a `@haiku/shared` component inside
`haiku-ui/src/components/`. If a shared component needs an app-specific
variant, either extend it via props, wrap it in a composition component, or
land the variant in `@haiku/shared` behind a feature flag. Consumers must
import from `@haiku/shared` — never from a local copy.

`FeedbackStatusBadge` (in `components/feedback/`) is **not** a duplicate of
`StatusBadge` — it owns a distinct color semantic (amber/blue/green/stone for
feedback lifecycle) mandated by DESIGN-TOKENS §1.2a. They are intentionally
separate components with non-overlapping call sites.

## Tests

- `vitest` — unit tests (rAF coalescing, misc hooks).
- `playwright` — DOM-parity tests that boot the app against committed
  fixtures and assert tree equivalence against `tests/__snapshots__/`.
