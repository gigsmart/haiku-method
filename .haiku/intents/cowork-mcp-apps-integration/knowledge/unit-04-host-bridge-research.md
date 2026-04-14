# Unit 04 Research — SPA Host Bridge Landscape

## Bundled review-app transport surface

The **bundled** review-app (the one inlined into `REVIEW_APP_HTML` via
`packages/haiku/scripts/build-review-app.mjs:29,37,69`) is the Vite project at
`packages/haiku/review-app/`. Its **only** session-transport file is
`packages/haiku/review-app/src/hooks/useSession.ts` (the file the unit spec
flagged as possibly superseded — it is **not**).

PR #213 (`8a218683`, `a59ca899`) replaced WebSocket with a HEAD heartbeat in
`website/app/components/review/hooks/useReviewSession.ts` — a *different* SPA
that is **not** bundled into the binary. `packages/haiku/review-app/src/hooks/useSession.ts`
was last touched by PR #173 and still runs the WebSocket-first / HTTP-POST-fallback
pattern. It is load-bearing for unit-04.

Transport surface in `useSession.ts`:
- `useSessionWebSocket(sessionId)` — opens `ws://…/ws/session/:id` (`:9-45`)
- `useSession(sessionId)` — `GET /api/session/:id` (`:60-97`)
- `submitDecision(...)` — WS first, else `POST /review/:id/decide` (`:101-135`)
- `submitAnswers(...)` — WS first, else `POST /question/:id/answer` (`:139-172`)
- `submitDesignDirection(...)` — WS first, else `POST /direction/:id/select` (`:176-204`)
- `tryCloseTab(...)` — `sendBeacon` + `window.close` (`:209-227`)

Callers: `App.tsx:3,42-43`, `ReviewSidebar.tsx:3`, `QuestionPage.tsx:4`, `DesignPicker.tsx:3`.

## `@modelcontextprotocol/ext-apps` references

Grep across `packages/haiku/review-app/`: **zero hits**. Greenfield dependency.

## Current `review-app/package.json` dependencies

`packages/haiku/review-app/package.json:8-19`:
- `@haiku/shared` (workspace), `@sentry/react ^10.47.0`,
  `@xyflow/react ^12.10.2`, `elkjs ^0.11.1`, `react ^19.1.0`, `react-dom ^19.1.0`,
  `react-markdown ^10.1.0`, `remark ^15.0.0`, `remark-gfm ^4.0.1`, `remark-html ^16.0.0`.

devDeps: `@tailwindcss/typography`, `@tailwindcss/vite`, `@types/react`,
`@types/react-dom`, `@vitejs/plugin-react`, `tailwindcss ^4.1.4`,
`typescript ^5.7.0`, `vite ^6.3.2`.

## Detection probe options

| Option | Pros | Cons |
|---|---|---|
| `window.parent !== window` | Zero-dep, instant | True inside *any* iframe (E2E tunnel preview, Storybook) |
| `typeof window.App === "function"` | Tightest signal | Requires host to populate `window.App` before script boot |
| Query string flag (`?mcp=1`) | Explicit | Caller must stamp URL; easy to miss in `ui://` preload |
| `ext-apps` client helper (`new App().connect()`) | Protocol-accurate | Heavy to run unconditionally |

**Recommendation:** two-gate probe — `window.parent !== window` **and**
`try { new App({...}); return true } catch { return false }` on the imported
`App` class. The first gate is free; the second is the authoritative signal
that `@modelcontextprotocol/ext-apps` can construct against the host's
postMessage channel. Fall back to browser mode on any throw. Wire this as a
module-level `isMcpAppsHost()` function in the new `host-bridge.ts`, called
exactly once at module load.
