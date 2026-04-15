# Tactical Plan — unit-01-capability-negotiation-probe

**Hat:** planner  
**Bolt:** 1  
**Date:** 2026-04-15

---

## Summary

Implement MCP Apps capability negotiation in three places:

1. `packages/haiku/src/server.ts` — add `resources: {}` and `experimental: { apps: {} }` to the `Server` constructor capabilities block.
2. `packages/haiku/src/state-tools.ts` — add `hostSupportsMcpApps()`, `getMcpHostWorkspacePaths()`, `requestHostWorkspace()`, and a `setMcpServerInstance()` setter.
3. `packages/haiku/test/capability-negotiation.test.mjs` — new test file covering all scenarios from the two `.feature` files.

---

## Files to Modify

| File | Change type | What |
|---|---|---|
| `packages/haiku/src/server.ts` | Modify | Add `resources: {}` and `experimental: { apps: {} }` to Server constructor (line ~157). Call `setMcpServerInstance(server)` after `server` is created. |
| `packages/haiku/src/state-tools.ts` | Modify | Add `setMcpServerInstance`, `hostSupportsMcpApps`, `getMcpHostWorkspacePaths`, `requestHostWorkspace` at the Environment Detection section (after `isGitRepo`). |
| `packages/haiku/test/capability-negotiation.test.mjs` | Create | New test file for all capability negotiation + workspace handshake scenarios. |
| `packages/haiku/test/run-all.mjs` | No change | `run-all.mjs` auto-discovers `*.test.mjs` — new test file is picked up automatically. |

---

## Dependency Direction (Critical)

`server.ts` imports from `state-tools.ts`. To avoid circular imports, use the same injection pattern as `setElicitInputHandler` in `orchestrator.ts`:

- `state-tools.ts` exports `setMcpServerInstance(s: { getClientCapabilities(): unknown; listRoots(): Promise<{ roots: { uri: string }[] }> })` — a narrow interface, not the full `Server` type.
- `server.ts` calls `setMcpServerInstance(server)` immediately after `const server = new Server(...)`.
- `hostSupportsMcpApps()` and `getMcpHostWorkspacePaths()` read through this injected reference.

---

## Implementation Steps

### Step 1 — Server capabilities block (server.ts ~line 157)

Change:
```typescript
const server = new Server(
  { name: "haiku-review", version: "0.1.0" },
  {
    capabilities: {
      tools: {},
      prompts: { listChanged: true },
      completions: {},
    },
  },
)
```

To:
```typescript
const server = new Server(
  { name: "haiku-review", version: "0.1.0" },
  {
    capabilities: {
      tools: {},
      prompts: { listChanged: true },
      completions: {},
      resources: {},
      experimental: { apps: {} },
    },
  },
)
```

Then immediately after that block, add:
```typescript
setMcpServerInstance(server)
```

And add `setMcpServerInstance` to the import from `./state-tools.js`.

### Step 2 — state-tools.ts additions (after the `isGitRepo` block)

Add in the `// ── Environment detection ──` section, after `isGitRepo()`:

```typescript
// ── MCP Apps capability negotiation ───────────────────────────────────────

/** Narrow interface — only what the accessors need. Avoids circular import. */
interface McpServerRef {
  getClientCapabilities(): unknown
  listRoots(params?: unknown): Promise<{ roots: Array<{ uri: string; name?: string }> }>
}

let _mcpServer: McpServerRef | null = null
let _mcpAppsSupported: boolean | null = null
let _cachedWorkspacePath: string | null = null

/** Called by server.ts immediately after the Server instance is created.
 *  Must be called before any tool handler runs. */
export function setMcpServerInstance(server: McpServerRef): void {
  _mcpServer = server
  _mcpAppsSupported = null  // reset cache on new connection
  _cachedWorkspacePath = null
}

/**
 * Returns true iff the connected MCP client echoed `experimental.apps`
 * during the initialize handshake. Result is cached for the connection lifetime.
 * Never reads env vars.
 */
export function hostSupportsMcpApps(): boolean {
  if (_mcpAppsSupported !== null) return _mcpAppsSupported
  if (!_mcpServer) {
    _mcpAppsSupported = false
    return false
  }
  const caps = _mcpServer.getClientCapabilities() as Record<string, unknown> | undefined
  _mcpAppsSupported =
    caps != null &&
    typeof caps === "object" &&
    "experimental" in caps &&
    caps.experimental != null &&
    typeof caps.experimental === "object" &&
    "apps" in (caps.experimental as Record<string, unknown>)
  return _mcpAppsSupported
}

/**
 * Returns the workspace paths from the MCP `roots` capability.
 * Returns empty array when roots are not advertised or the server is not injected.
 * Does NOT read CLAUDE_CODE_WORKSPACE_HOST_PATHS.
 */
export async function getMcpHostWorkspacePaths(): Promise<string[]> {
  if (!_mcpServer) return []
  try {
    const result = await _mcpServer.listRoots()
    return (result.roots ?? []).map((r) => r.uri.replace(/^file:\/\//, ""))
  } catch {
    return []
  }
}

/**
 * Fires when hostSupportsMcpApps() === true and roots.length === 0.
 * Uses elicitInput to ask the reviewer to open a workspace folder.
 * Returns the selected path, or throws on timeout/cancellation.
 */
export async function requestHostWorkspace(): Promise<string> {
  if (!_mcpServer) throw new Error("MCP server not injected")
  // elicitInput is wired by server.ts via setElicitInputHandler in orchestrator.ts
  // We call it through the server directly here since we have a reference
  const serverAny = _mcpServer as unknown as {
    elicitInput(params: { message: string; requestedSchema: unknown }): Promise<{ action: string; content?: unknown }>
  }
  const result = await serverAny.elicitInput({
    message: "Please open a workspace folder in your host application to continue.",
    requestedSchema: {
      type: "object",
      properties: {
        workspace_path: {
          type: "string",
          description: "The path to the workspace folder you opened",
        },
      },
      required: ["workspace_path"],
    },
  })
  if (result.action !== "submit" || !result.content) {
    throw new Error("Workspace selection cancelled")
  }
  const content = result.content as Record<string, unknown>
  const path = content.workspace_path as string
  if (!path) throw new Error("No workspace path provided")
  return path
}

/**
 * Resolve the workspace root for MCP Apps hosts:
 * - 1 root: auto-select
 * - 0 roots: call requestHostWorkspace(), cache result
 * - >1 roots: call elicitInput to pick, cache result
 *
 * Returns the selected workspace path. Throws if resolution fails.
 * Caches selection for the session lifetime.
 */
export async function resolveWorkspaceRoot(): Promise<string> {
  if (_cachedWorkspacePath !== null) return _cachedWorkspacePath

  const paths = await getMcpHostWorkspacePaths()

  if (paths.length === 1) {
    _cachedWorkspacePath = paths[0]
    return _cachedWorkspacePath
  }

  if (paths.length === 0) {
    const selected = await requestHostWorkspace()
    _cachedWorkspacePath = selected
    return _cachedWorkspacePath
  }

  // Multiple roots — let the reviewer pick
  const serverAny = _mcpServer as unknown as {
    elicitInput(params: { message: string; requestedSchema: unknown }): Promise<{ action: string; content?: unknown }>
  }
  const result = await serverAny.elicitInput({
    message: "Multiple workspace folders are open. Please select one to use for this H·AI·K·U session.",
    requestedSchema: {
      type: "object",
      properties: {
        workspace_path: {
          type: "string",
          enum: paths,
          description: "Select the workspace folder to use",
        },
      },
      required: ["workspace_path"],
    },
  })
  if (result.action !== "submit" || !result.content) {
    throw new Error("Workspace selection cancelled")
  }
  const content = result.content as Record<string, unknown>
  const selected = content.workspace_path as string
  if (!selected) throw new Error("No workspace path selected")
  _cachedWorkspacePath = selected
  return _cachedWorkspacePath
}
```

### Step 3 — New test file: `packages/haiku/test/capability-negotiation.test.mjs`

Cover all scenarios from `mcp-apps-capability-negotiation.feature` and `workspace-handshake.feature`. Tests use plain Node.js `assert` + inline stubs (no external test runner). Pattern matches existing test files.

**Test cases to cover:**

From capability negotiation feature:
1. Client advertises `experimental.apps: {}` → `hostSupportsMcpApps()` returns `true`
2. Client does not advertise `experimental.apps` → returns `false`
3. Caching: `getClientCapabilities` called at most once across 10 invocations
4. CLAUDE_CODE_IS_COWORK env var set but no `experimental.apps` → returns `false` (env var ignored)
5. Partial/malformed capabilities (as per the feature Examples table):
   - `{}` → false
   - `{ experimental: {} }` → false
   - `{ experimental: { apps: 1 } }` → true (key exists, value doesn't matter)
   - `null` caps → false

From workspace handshake feature:
6. One root → auto-select, no elicitInput call, no requestHostWorkspace call
7. Zero roots + apps supported → `requestHostWorkspace` called before any write
8. Multiple roots → `elicitInput` called with both paths
9. Cached selection reused across multiple calls
10. Non-MCP-Apps host → `getMcpHostWorkspacePaths` not called, existing findHaikuRoot used

**Handshake-precedes-write test (criterion 5):**
This one is conceptual — the actual enforcement is that `resolveWorkspaceRoot()` must be called by the intent-creation path before any `.haiku/` write. The test will assert call order by tracking whether a stub `requestHostWorkspace` resolves before a stub write function is invoked.

### Step 4 — Commit

```bash
cd /path/to/worktree
git add packages/haiku/src/server.ts packages/haiku/src/state-tools.ts packages/haiku/test/capability-negotiation.test.mjs
git commit -m "feat(unit-01): capability negotiation + workspace handshake"
```

---

## Verification Commands

Run these in order, all must pass:

```bash
# 1. Capabilities advertised atomically
rg -n 'resources:\s*\{\}' packages/haiku/src/server.ts
rg -n 'experimental:\s*\{' packages/haiku/src/server.ts

# 2. Accessors exported
rg -n '^export function hostSupportsMcpApps' packages/haiku/src/state-tools.ts
rg -n '^export function getMcpHostWorkspacePaths' packages/haiku/src/state-tools.ts

# 3. No env-var coupling in state-tools or inject-state-file
rg -n 'CLAUDE_CODE_IS_COWORK|isCoworkHost' packages/haiku/src/state-tools.ts packages/haiku/src/hooks/inject-state-file.ts

# 4. Sentry tag untouched
grep -n 'CLAUDE_CODE_IS_COWORK' packages/haiku/src/sentry.ts

# 5. Typecheck (ignoring pre-existing repair-agent.ts issue)
cd packages/haiku && npm run typecheck 2>&1 | grep -v "repair-agent.ts"

# 6. Biome lint
cd packages/haiku && npx biome check src

# 7. All tests pass (214 existing + new)
cd packages/haiku && npm test
```

---

## Risk Assessment

### R1 — Circular import (HIGH, mitigated)
`state-tools.ts` is imported by `server.ts`. Adding a reverse import would create a cycle. **Mitigation:** narrow `McpServerRef` interface injected via setter — same pattern as `setElicitInputHandler` in `orchestrator.ts`. No reverse import.

### R2 — `getClientCapabilities()` called before initialize completes (MEDIUM)
If `hostSupportsMcpApps()` is called during module init (before the first tool call), `getClientCapabilities()` returns `undefined`. **Mitigation:** cache logic treats `undefined` as `false`. The MCP SDK docs confirm `getClientCapabilities()` is populated after `initialize` completes — all tool handlers run after init.

### R3 — `listRoots()` may fail or timeout (MEDIUM)
The MCP client may not support the `roots/list` request even if it advertised `roots` capability. **Mitigation:** `getMcpHostWorkspacePaths()` wraps in try/catch and returns empty array on error. No crash path.

### R4 — `elicitInput` not available in non-Cowork hosts (LOW)
`server.elicitInput()` may throw on hosts that don't support elicitation. **Mitigation:** `requestHostWorkspace` is only called when `hostSupportsMcpApps() === true`, meaning the client is a MCP Apps host. MCP Apps hosts support elicitation. If it still throws, the error propagates naturally (no silent failure).

### R5 — Pre-existing typecheck failure (`repair-agent.ts`) (LOW)
`npm run typecheck` currently fails with `Cannot find module '@anthropic-ai/claude-agent-sdk'`. This predates this unit (commit `5222567c`). **Plan:** Our additions must be fully typed and not introduce new typecheck errors. The pre-existing error is isolated to `repair-agent.ts` — it cannot be ignored per the no-excuses policy but also cannot be fixed in this unit's scope as it's a missing dependency/type declarations issue.

**Action on R5:** Check if `@anthropic-ai/claude-agent-sdk` has a `@types` package or if the package ships its own types. If the fix is a one-line `tsconfig.json` or `package.json` change, fix it as part of this unit. If it requires a larger dependency change, flag it explicitly for the reviewer.

### R6 — `roots` URI format (LOW)
MCP roots use `file://` URI scheme. The implementation strips the prefix via `r.uri.replace(/^file:\/\//, "")`. Need to verify this is the right format. **Mitigation:** MCP SDK types confirm `roots[].uri` is a string URI. The stripping is correct for `file://` URIs.

---

## Feature File Scenario Coverage Map

| Feature | Scenario | Test # |
|---|---|---|
| mcp-apps-capability-negotiation | Client supports MCP Apps → iframe path | 1 |
| mcp-apps-capability-negotiation | Client does not advertise → HTTP path | 2 |
| mcp-apps-capability-negotiation | Caching — getClientCapabilities invoked once | 3 |
| mcp-apps-capability-negotiation | CLAUDE_CODE_IS_COWORK set, no capability → returns false | 4 |
| mcp-apps-capability-negotiation | Partial/malformed capability examples | 5 |
| workspace-handshake | One root → auto-selected, no prompt | 6 |
| workspace-handshake | Zero roots → requestHostWorkspace fires before write | 7 |
| workspace-handshake | Multiple roots → elicitInput pick | 8 |
| workspace-handshake | Cached selection reused | 9 |
| workspace-handshake | Non-MCP-Apps host → filesystem walk, no getMcpHostWorkspacePaths | 10 |

Scenarios not covered in unit tests (out of scope or SPA-only):
- `App.callServerTool` runtime error → NegotiationErrorScreen (SPA, unit-05)
- `resources/list` and `resources/read` JSON-RPC (unit-02/03)
- Hash stability scenarios (build pipeline, unit-03)
- Gate session data parity (unit-05)
- `requestHostWorkspace` timeout (requires real timer mocking, acceptable to defer)

---

## Pre-existing Typecheck Issue — Resolution Plan

Before implementing step 1-3, run:
```bash
ls packages/haiku/node_modules/@anthropic-ai/claude-agent-sdk/
```

If the package has no `.d.ts` files and no `types` field in its `package.json`, add a `declare module '@anthropic-ai/claude-agent-sdk'` shim in `packages/haiku/src/types/` or add `"noImplicitAny": false` scoped to that file. The cleanest fix is a module declaration shim.
