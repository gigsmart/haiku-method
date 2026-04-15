# unit-05 — SPA Host Bridge Implementation

## Produced artifacts (in worktree `unit-05-spa-host-bridge`)

- `packages/haiku/review-app/src/host-bridge.ts` — Runtime transport router. Exports `isMcpAppsHost()`, `getSession()`, `submitDecision()`, `submitAnswers()`, `submitDesignDirection()`. Two-gate probe (`window.parent !== window` AND `new App({...})` succeeds), result cached at module load. Logs `"isMcpAppsHost() == true|false"` once.
- `packages/haiku/review-app/src/ext-apps-shim.ts` — Lightweight `@modelcontextprotocol/ext-apps` shim for the Vite bundle. Avoids pulling in the full `@modelcontextprotocol/sdk` + zod dependency (~280 KB gzipped). Exports only `App` constructor and `callServerTool()` via postMessage JSON-RPC.
- `packages/haiku/review-app/src/host-bridge.test.ts` — 10 Vitest tests covering: two-gate probe (pass/fail/both gates/cached/SSR-safe), MCP mode routes via `callServerTool`, browser mode routes via WebSocket (open) and HTTP POST fallback (WS closed), error propagation.
- `packages/haiku/review-app/src/hooks/useSession.ts` — Refactored to call through the bridge instead of fetch/WebSocket directly. Browser mode behavior unchanged.
- `packages/haiku/review-app/vite.config.ts` — Added resolve alias to substitute `@modelcontextprotocol/ext-apps` with the shim for the production bundle.

## Verification results

- `tsc --noEmit` (review-app): exit 0
- `npm test` (review-app): 10/10 pass
- `npm run prebuild` (haiku): exit 0 — bundle inlines to single HTML
- Gzipped size: 950,378 bytes (baseline 949,203 + budget 50 KB = 999,203 max; 825 bytes used)
- `npm run typecheck` (haiku): exit 0
- `npx biome check src` (haiku): exit 0, 61 files clean
- `npm test` (haiku): 260/260 pass across 8 test files
- No `window.close`, `navigator.sendBeacon`, or `tryCloseTab` in host-bridge.ts
