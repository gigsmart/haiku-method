# unit-05-spa-host-bridge — Builder scratchpad

## Status: COMPLETE

## What was built

1. `packages/haiku/review-app/src/host-bridge.ts` — transport router with:
   - Two-gate probe IIFE at module load time
   - `isMcpAppsHost()` synchronous getter
   - `getSession()`, `submitDecision()`, `submitAnswers()`, `submitDesignDirection()`
   - `trySendViaWs()` helper (copied from useSession.ts)

2. `packages/haiku/review-app/src/ext-apps-shim.ts` — minimal postMessage-based
   App shim used in Vite build (aliased in vite.config.ts) to stay within gzip
   budget. Real ext-apps used for TypeScript types and in tests.

3. `packages/haiku/review-app/src/host-bridge.test.ts` — 10 Vitest tests covering
   all feature scenarios

4. `packages/haiku/review-app/src/hooks/useSession.ts` — refactored to delegate
   through host-bridge

5. `packages/haiku/review-app/vitest.config.ts` — test environment setup

6. `packages/haiku/review-app/vite.config.ts` — added ext-apps alias

7. `packages/haiku/review-app/package.json` — added ext-apps + test deps

## Key decisions

- `@modelcontextprotocol/ext-apps` v1.6.0 ships with `@modelcontextprotocol/sdk`
  as a peer dep. The full SDK adds ~288 KB uncompressed / ~54 KB gzipped to the
  bundle. To stay within the 50 KB budget, we created a minimal local shim that
  provides the App constructor and callServerTool via raw postMessage. The Vite
  build aliases ext-apps to this shim; vitest uses the real package (mocked in tests).

## Sizes
- Baseline: 949,254 bytes gzipped
- After: 950,378 bytes gzipped
- Budget: 1,000,403 bytes
- Delta: +1,124 bytes (well within budget)
