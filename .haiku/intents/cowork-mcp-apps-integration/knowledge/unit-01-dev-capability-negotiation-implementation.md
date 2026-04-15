# unit-01-capability-negotiation-probe: Implementation Notes

## What was built

Three source artifacts were committed in `57ecb708`:

- `packages/haiku/src/server.ts` — Added `resources: {}` and `experimental: { apps: {} }` to the `Server` constructor capabilities block (atomic, per DATA-CONTRACTS.md).
- `packages/haiku/src/state-tools.ts` — Added `setMcpServerInstance()`, `hostSupportsMcpApps()`, `getMcpHostWorkspacePaths()`, `requestHostWorkspace()`, and `resolveWorkspaceRoot()`. Caches `getClientCapabilities()` result on first call per connection lifetime. Zero env-var coupling; resolves workspace via MCP `roots` capability only.
- `packages/haiku/test/capability-negotiation.test.mjs` — 29 tests covering all `mcp-apps-capability-negotiation.feature` and `workspace-handshake.feature` in-scope scenarios. All pass.

## Verification results (bolt 2)

- Prebuild: exit 0
- Typecheck: exit 0
- Biome: exit 0 (60 files, no issues)
- Full test suite: 243 passed, 0 failed across 7 test files
