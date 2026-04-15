---
title: Capability negotiation probe + workspace handshake
type: feature
model: opus
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - knowledge/DATA-CONTRACTS.md
  - features/mcp-apps-capability-negotiation.feature
  - features/workspace-handshake.feature
  - .haiku/knowledge/ARCHITECTURE.md
status: active
bolt: 2
hat: builder
started_at: '2026-04-15T15:21:26Z'
hat_started_at: '2026-04-15T15:38:16Z'
model_original: sonnet
---

# Capability negotiation probe + workspace handshake

## Scope

Implement the MCP capability negotiation path that lets the server advertise the MCP Apps extension and decide at runtime whether to use the iframe transport or fall through to HTTP+tunnel. No env-var coupling.

### In scope

- **Server capabilities block.** Edit `packages/haiku/src/server.ts:~158` to add `resources: {}` AND `experimental: { apps: {} }` in the `Server` constructor capabilities object. Both keys in a single atomic change per `DATA-CONTRACTS.md` "Capability prerequisite — atomic with experimental.apps".
- **`hostSupportsMcpApps()` accessor.** Export from `packages/haiku/src/state-tools.ts` (colocated with `isGitRepo`). Reads `server.getClientCapabilities()` once and caches the result for the connection lifetime.
- **`getMcpHostWorkspacePaths()` accessor.** Parses the negotiated `roots` capability (not `CLAUDE_CODE_WORKSPACE_HOST_PATHS`). Returns empty array when `roots` is not advertised.
- **`requestHostWorkspace()` indirection.** Single function that fires when `hostSupportsMcpApps() === true && roots.length === 0`. Implementation hidden behind the indirection; initial version calls `elicitInput` with a "Please open a workspace folder" prompt.
- **Multi-workspace pick.** When `roots.length > 1`, fire `elicitInput` to let the reviewer choose. Cache the selection on a module-level variable for the session.
- **Tests.** Unit tests covering: client advertises `apps` → accessor returns true; client doesn't → returns false; caching is idempotent (call 10x, `getClientCapabilities` invoked once); workspace handshake fires exactly when `hostSupportsMcpApps() === true && roots.length === 0`; handshake precedes the first `.haiku/` write (spy assertion).

### Out of scope

- The `ui://` resource registration (unit-02).
- The `_openReviewAndWait` branch (unit-03).
- Visual question / design direction MCP Apps branches (unit-04).
- The review SPA host-bridge module (unit-05).
- Removing `CLAUDE_CODE_IS_COWORK` from `sentry.ts` — existing telemetry tag, leave as-is.

## Completion Criteria

1. **Capabilities advertised atomically.** `rg -n 'resources:\s*\{\}' packages/haiku/src/server.ts` and `rg -n 'experimental:\s*\{\s*apps:\s*\{\}' packages/haiku/src/server.ts` both return ≥ 1 hit in the same `Server` constructor block.
2. **Accessors exported.** `rg -n '^export function hostSupportsMcpApps' packages/haiku/src/state-tools.ts` and `rg -n '^export function getMcpHostWorkspacePaths' packages/haiku/src/state-tools.ts` each return 1 hit.
3. **Caching works.** Vitest asserts `getClientCapabilities` spy is called at most once across 10 `hostSupportsMcpApps()` calls on the same connection.
4. **Handshake branches correct.** Vitest with stub client: zero roots + `apps` advertised → `requestHostWorkspace` called; one root → auto-select, no call; multi-roots → `elicitInput` called with paths.
5. **Handshake precedes first `.haiku/` write.** Spy asserts `requestHostWorkspace.callIndex < firstHaikuWriteSpy.callIndex`.
6. **No env-var coupling.** `rg -n 'CLAUDE_CODE_IS_COWORK|isCoworkHost' packages/haiku/src/state-tools.ts packages/haiku/src/hooks/inject-state-file.ts` returns zero hits.
7. **Existing state-tools tests unchanged.** `git diff packages/haiku/src/state-tools.test.ts` shows additions only; full suite passes.
8. **Sentry `CLAUDE_CODE_IS_COWORK` tag still works.** Existing reference in `sentry.ts:24-25` is untouched.
9. **Typecheck + lint clean.** `cd packages/haiku && npm run typecheck && npx biome check src` exit 0.
10. **Tests pass.** `cd packages/haiku && npm test` exit 0.
