# H·AI·K·U MCP Package — Validation Reference

This document describes how the MCP package validates two key runtime capabilities:
MCP Apps support for in-process review gates, and the dual-path cowork review transport.

---

## MCP Apps capability negotiation

The MCP Apps path (iframe-based review gate) is only active when the connected host
advertises support during the MCP initialize handshake. Capability detection is
centralized in `src/state-tools.ts`.

### How it works

When an MCP client connects, it sends an `initialize` request that includes a
`capabilities` object. Hosts that support MCP Apps include an `experimental.apps`
key in that object. The server declares its own MCP Apps support symmetrically:

```typescript
// src/server.ts — server capabilities declaration
const server = new Server(
  { name: "haiku-review", version: "0.1.0" },
  {
    capabilities: {
      tools: {},
      prompts: { listChanged: true },
      completions: {},
      resources: {},           // required: enables resource listing/reading
      experimental: { apps: {} }, // required: signals MCP Apps support
    },
  },
)
```

Both `resources: {}` and `experimental: { apps: {} }` must be present in the server
capabilities declaration. The `resources` capability enables the `/api/resources` route
that serves the bundled review SPA. The `experimental.apps` echo tells the host that
this server is prepared to render UI inside the host application rather than opening a
browser tab.

### `hostSupportsMcpApps()`

```typescript
// src/state-tools.ts
export function hostSupportsMcpApps(): boolean
```

Returns `true` when the connected MCP client echoed `experimental.apps` in the
initialize handshake. The result is cached for the connection lifetime (module-scoped
`_mcpAppsSupported` variable). The cache is cleared on each new connection via
`setMcpServerInstance()`.

Detection logic (non-negotiable — must not read env vars):

1. If `_mcpAppsSupported` is cached, return it.
2. If no server is injected (`_mcpServer === null`), return `false`.
3. Call `_mcpServer.getClientCapabilities()` and check for the key path
   `capabilities.experimental.apps` (type-safe walk without casting to a known shape).
4. Cache and return the result.

The function never falls back to environment variables — capability is determined
exclusively by the client's initialization handshake.

### Setup sequence

```
1. server.ts creates Server instance with resources + experimental.apps capabilities
2. setMcpServerInstance(server) called immediately after Server creation
3. Client connects, sends initialize with capabilities
4. First call to hostSupportsMcpApps() reads and caches the answer
5. All subsequent calls within the connection hit the cache
```

---

## Cowork review transport

When the orchestrator's FSM reaches a `gate_review` action, `handleOrchestratorTool`
(in `src/orchestrator.ts`) calls `_openReviewAndWait`. This handler is registered by
`server.ts` at startup via `setOpenReviewHandler`. The registration selects one of two
transport paths based on `hostSupportsMcpApps()`.

### Transport paths

**Path A — MCP Apps (in-process iframe, no HTTP server)**

Active when `hostSupportsMcpApps() === true`. Implemented in
`src/open-review-mcp-apps.ts` (`openReviewMcpApps`).

- Creates a review session via `createSession()`.
- Calls `setReviewResultMeta(buildUiResourceMeta(REVIEW_RESOURCE_URI))` to attach the
  `_meta.ui` resource pointer to the tool result before blocking.
- Awaits `waitForSession()` — a single blocking promise that resolves when
  `haiku_cowork_review_submit` is called with the matching session ID.
- Returns `{ decision, feedback, annotations }` from the settled session.
- Does NOT import `./http.js`, `./tunnel.js`, or `node:child_process`. This is
  structurally enforced — the file's import list is part of the contract (CC-2).

**Path B — HTTP + tunnel + browser (existing path)**

Active when `hostSupportsMcpApps() === false`. Implemented inline in the
`setOpenReviewHandler` callback in `server.ts`.

- Starts the HTTP server (`startHttpServer()`), builds signed review URL.
- If remote review is enabled, opens a localtunnel (`openTunnel()`).
- Opens the review URL in the user's default browser.
- Polls `waitForSession()` with the same blocking interface.

### Branching point

```typescript
// src/server.ts
setOpenReviewHandler(
  async (intentDirRel, reviewType, gateType) => {
    if (hostSupportsMcpApps()) {
      return openReviewMcpApps({ intentDirRel, reviewType, gateType, signal, setReviewResultMeta })
    }
    // HTTP + tunnel + browser path ...
  }
)
```

`setOpenReviewHandler` is called once at server startup. After that, every
`gate_review` action flows through the registered handler, which selects the path at
call time (not at registration time) so re-connections get the correct path.

### V5-10 host-timeout fallback

If the MCP host disconnects or times out before the review is submitted, the AbortSignal
passed via `deps.signal` fires. The MCP Apps arm handles this as follows:

1. Detects `signal?.aborted` (or `err.message === "host_timeout"` from the abort
   promise).
2. Logs a `gate_review_host_timeout` event to the session log.
3. Clears the in-memory heartbeat for the session via `clearHeartbeat()`.
4. Writes `blocking_timeout_observed: true` to the intent's frontmatter via
   `setFrontmatterField()`. This is a non-fatal best-effort write.
5. Does NOT touch `state.json` — the FSM phase is left unchanged so the next
   `haiku_run_next` call re-presents the review gate.
6. Returns a synthetic `{ decision: "changes_requested", feedback: "Review timed out..." }`.

The `blocking_timeout_observed` frontmatter flag is written to
`.haiku/intents/<slug>/intent.md`. It is informational — the orchestrator reads it on
the next gate presentation to surface a warning to the agent.

### `haiku_cowork_review_submit` tool

The MCP host (Claude Desktop or compatible) submits the user's review decision by
calling this tool with the session ID and decision payload. The tool validates the input
via Zod, calls `updateSession()` (or `updateQuestionSession()` /
`updateDesignDirectionSession()` for non-review session types), and returns `{"ok":true}`.
`notifySessionUpdate()` wakes the blocked `waitForSession()` promise, which causes
`openReviewMcpApps` to return the decision to the orchestrator.
