---
title: H·AI·K·U Plugin Architecture
type: architecture
status: living
---

# H·AI·K·U Plugin Architecture

Living architecture document. Covers the plugin as it exists today on `main`,
plus the additions landed (or being landed) by the `cowork-mcp-apps-integration`
intent. Update this file whenever a module changes shape.

---

## Module Map

### `packages/haiku/src/server.ts` (989 lines)

The MCP server entry point and tool dispatch layer. Instantiates the MCP
`Server` from `@modelcontextprotocol/sdk`, registers handlers for
`ListTools`, `CallTool`, `ListPrompts`, `GetPrompt`, and `CompleteRequest`,
then starts a stdio transport via `StdioServerTransport`. Tool routing is a
flat if/else + `startsWith("haiku_")` dispatch: orchestrator tools are
forwarded to `handleOrchestratorTool` (`orchestrator.ts`), state tools to
`handleStateTool` (`state-tools.ts`), and the two interactive tools
(`ask_user_visual_question`, `pick_design_direction`) are handled inline.
The `setOpenReviewHandler` and `setElicitInputHandler` callbacks are wired
here, injecting HTTP+session logic into the orchestrator's gate without
creating a circular import. After every tool call, the server checks
`hasPendingUpdate()` and hot-swaps itself if a new binary was downloaded.

Imports: `orchestrator.ts`, `state-tools.ts`, `sessions.ts`, `http.ts`,
`tunnel.ts`, `sentry.ts`, `auto-update.ts`, `prompts/index.ts`,
`templates/index.ts`, `templates/question-form.ts`,
`templates/design-direction.ts`.

**MCP Apps intent adds:** `experimental: { apps: {} }` and `resources: {}`
to the `Server` constructor capabilities block (line 157), `ListResources`
and `ReadResource` handlers, and the `haiku_cowork_review_submit` tool
registration plus its dispatch case.

---

### `packages/haiku/src/orchestrator.ts` (4 188 lines)

The deterministic FSM driver. `runNext(slug)` reads intent/stage state from
disk, determines the next FSM action, applies any required state mutation as
a side effect, and returns an `OrchestratorAction` object the agent follows.
The agent never writes stage or intent state directly — it only calls
`haiku_run_next`. The module exports five tools: `haiku_run_next`,
`haiku_intent_create`, `haiku_select_studio`, `haiku_revisit`,
`haiku_intent_reset`. The public API surface is three callbacks set by
`server.ts`:
- `setOpenReviewHandler` (line 3152) — injected HTTP/session logic for
  `gate_review` actions.
- `setElicitInputHandler` (line 3156) — MCP native elicitation fallback.
- `setRunNextHandler` (called from `state-tools.ts`) — breaks the circular
  dependency between state operations and FSM.

`handleOrchestratorTool` (line 3160) is the async dispatch layer: it calls
`runNext`, handles the `gate_review` action by calling `_openReviewAndWait`,
and maps every other action to an instruction string returned to the agent.

Imports: `state-tools.ts`, `git-worktree.ts`, `dag.ts`, `studio-reader.ts`,
`model-selection.ts`, `session-metadata.ts`, `sentry.ts`, `telemetry.ts`,
`config.ts`.

---

### `packages/haiku/src/http.ts` (1 072 lines)

The embedded HTTP + WebSocket server. A single `createServer()` instance
(lazy-started via `startHttpServer()`, idempotent) handles all review,
question, direction, and API routes plus a WebSocket upgrade path. Key routes:

- `GET /review/:id` — serves `REVIEW_APP_HTML` (the inlined SPA)
- `POST /review/:id/decide` — updates a `ReviewSession`
- `GET /api/session/:id` — returns full session JSON for SPA hydration
- `WS /ws/session/:id` — bidirectional WebSocket (session submit + server push)
- `HEAD /api/session/:id/heartbeat` — presence keepalive
- `GET /question/:id`, `/direction/:id` — SPA for other session types

Implements its own WebSocket codec (RFC 6455, unmasked server→client frames)
without a dependency on `ws`. E2E encryption (`e2eEncrypt` from `tunnel.ts`)
wraps responses when remote review is active. CORS headers added for remote
mode.

Imports: `sessions.ts`, `tunnel.ts`, `review-app-html.ts` (the inlined SPA
string).

---

### `packages/haiku/src/tunnel.ts` (248 lines)

Wraps `localtunnel` to expose the local HTTP server to a remote URL. Maintains
one global tunnel instance with exponential-backoff reconnect (5 attempts, max
30 s delay) and a 30 s health-check interval. Exports:
- `openTunnel(port)` / `closeTunnel()` / `isTunnelOpen()` / `getTunnelUrl()`
- `buildReviewUrl(sessionId, tunnelUrl, type)` — generates a JWT (HMAC-SHA256
  over an ephemeral 32-byte secret, 1 h TTL) that encodes the tunnel URL, session
  ID, session type, and a per-session AES-256-GCM key.
- `e2eEncrypt(sessionId, data)` — encrypts response bodies for remote sessions.
- `isRemoteReviewEnabled()` — reads `features.remoteReview` from `config.ts`.

Feature-flagged via `HAIKU_REMOTE_REVIEW=1`. Not used on the MCP Apps path.

Imports: `config.ts`.

---

### `packages/haiku/src/sessions.ts` (343 lines)

In-memory session registry. Holds up to 100 sessions with a 30-minute TTL;
evicts oldest on overflow. Three session types:
- `ReviewSession` — gate review: carries parsed intent/unit/criteria data for
  SPA hydration; status transitions from `"pending"` → `"decided"`.
- `QuestionSession` — visual question; status `"pending"` → `"answered"`.
- `DesignDirectionSession` — design direction picker; status `"pending"` →
  `"answered"`.

Presence tracking uses a heartbeat map (`recordHeartbeat`, 25 s grace, 5 s
sweep). `waitForSession(id, timeoutMs)` returns a `Promise` that resolves when
`notifySessionUpdate(id)` fires. Sessions are not persisted to disk.

Imports: none (pure in-memory).

---

### `packages/haiku/src/state-tools.ts` (3 479 lines)

Two distinct responsibilities live here:

1. **Path utilities and JSON/frontmatter I/O** — `findHaikuRoot`,
   `intentDir`, `stageStatePath`, `parseFrontmatter`, `setFrontmatterField`,
   `readJson`, `writeJson`, `gitCommitState`, `isGitRepo`, etc. These are
   imported broadly across the plugin.
2. **State MCP tool handlers** — `stateToolDefs` (the tool schema array) and
   `handleStateTool` (dispatch) implement ~25 `haiku_*` read/write tools such
   as `haiku_intent_get`, `haiku_unit_set`, `haiku_knowledge_list`, etc.

**MCP Apps intent adds:** `hostSupportsMcpApps()` and
`getMcpHostWorkspacePaths()` exported from this module (co-located with
`isGitRepo`). `hostSupportsMcpApps()` calls `server.getClientCapabilities()`
once after `initialize`, caches the boolean for the connection lifetime.

Imports: `git-worktree.ts`, `studio-reader.ts`, `model-selection.ts`,
`session-metadata.ts`, `telemetry.ts`, `auto-update.ts`, `version.ts`,
`config.ts`.

---

### `packages/haiku/src/ui-resource.ts` _(added by `cowork-mcp-apps-integration`, unit-03)_

Thin helper module introduced by this intent. Exports one function:

```typescript
export function buildUiResourceMeta(resourceUri: string): { ui: { resourceUri: string } }
```

Returns the `_meta` extension object that `server.ts` spreads into MCP tool
results when the MCP Apps path is active. Also exports the `REVIEW_APP_VERSION`
constant (12-char SHA-256 prefix of `REVIEW_APP_HTML`, computed at build time
by `build-review-app.mjs`) and the stable resource URI string
`"ui://haiku/review/<REVIEW_APP_VERSION>"`. Keeping these in one place
prevents the `ListResources` handler, the `ReadResource` handler, and the
`setOpenReviewHandler` body from independently constructing the URI string.

Imports: `review-app-html.ts`.

---

### `packages/haiku/src/config.ts` (66 lines)

Single config module. All `process.env` reads for Haiku-specific flags
centralised here; reads at module load. Exports three namespaces:
- `features` — `modelSelection`, `remoteReview`, `telemetry`
- `review` — `siteUrl` (default `https://haikumethod.ai`)
- `autoUpdate` — `enabled`, `intervalMs`, `initialDelayMs`
- `observability` — `sentryDsn`, `otlpEndpoint`, OTLP headers/attrs

DSN is baked in at build time via esbuild `--define` so it doesn't need to be
readable from `process.env` at runtime.

---

### `packages/haiku/src/prompts/`

Prompt registry for MCP `prompts/*` protocol handlers. `index.ts` holds a
`Map<string, PromptDef>` registry; `core.ts`, `complex.ts`, `simple.ts`,
`repair.ts` register skill-backed prompts. Historically prompts contained
all agent instructions; those have migrated to plugin skills. The handlers are
kept for protocol compatibility.

---

### `packages/haiku/src/templates/`

Server-side HTML rendering (not React). `index.ts` exports `renderReviewPage`
which routes to `intent-review.ts` or `unit-review.ts` and wraps with
`layout.ts`. Other templates: `question-form.ts`, `design-direction.ts`,
`annotation-canvas.ts`, `inline-comments.ts`. These produce the HTML string
stored on each `ReviewSession.html` (now unused in the MCP Apps path — the SPA
is served from `REVIEW_APP_HTML` directly).

---

### `packages/haiku/src/review-app-html.ts`

Auto-generated by `scripts/build-review-app.mjs`. Contains a single exported
constant `REVIEW_APP_HTML: string` — the fully-inlined review SPA (~5.15 MB,
all JS/CSS embedded). Imported by `http.ts` to serve the SPA. Do not edit
manually.

---

### `packages/haiku/src/hooks/`

Claude Code hook handlers. Each file corresponds to a lifecycle hook invoked
by the harness:
- `context-monitor.ts`, `inject-context.ts`, `inject-state-file.ts` — inject
  intent/session context into tool calls.
- `quality-gate.ts` — enforces completion criteria before allowing advancement.
- `guard-fsm-fields.ts` — prevents the agent from writing FSM-owned fields.
- `enforce-iteration.ts`, `track-outputs.ts` — bolt tracking, output recording.
- `workflow-guard.ts`, `prompt-guard.ts`, `redirect-plan-mode.ts` — behavioral
  guards.
- `subagent-context.ts`, `subagent-hook.ts` — propagate context to subagents.

---

## Data Flow: `haiku_run_next` Today

```
Agent
  │ calls haiku_run_next { intent: slug }
  ▼
server.ts:handleToolCall
  │ routes to handleOrchestratorTool (orchestrator.ts:3160)
  │ validates branch (state-tools.ts:1644)
  ▼
orchestrator.ts:runNext(slug)        ← reads FS, returns action object
  │
  ├─ action ≠ gate_review
  │    └─ withInstructions(action) → text response to agent
  │
  └─ action === gate_review && _openReviewAndWait set
       │ calls _openReviewAndWait(intentDirRel, "intent", gateType)
       │   (handler injected by server.ts:774)
       ▼
     server.ts setOpenReviewHandler body
       │ createSession() → sessions.ts (ReviewSession, status: pending)
       │ renderReviewPage() → session.html
       │ startHttpServer() → http.ts (idempotent)
       │ if remoteReview: openTunnel(port) → tunnel.ts
       │   buildReviewUrl(sessionId, tunnelUrl) → JWT hash URL
       │ else: local URL http://127.0.0.1:{port}/review/{sessionId}
       │ spawn(open, url) → browser opens
       ▼
     waitForSession(sessionId, 10min)   ← blocks here
       │
       │  [user opens browser, SPA fetches GET /api/session/:id]
       │  [user clicks Approve/Request Changes]
       │  [SPA POSTs /review/:id/decide  OR  sends WS "decide" frame]
       │
     http.ts:handleDecidePost / handleWebSocketMessage
       │ updateSession(sessionId, { status: "decided", decision, … })
       │ notifySessionUpdate(sessionId)
       ▼
     waitForSession resolves
       │ getSession(sessionId) → { decision, feedback, annotations }
       │ closeTunnel() if remote
       │ returns { decision, feedback, annotations? }
       ▼
     orchestrator.ts:handleOrchestratorTool (line 3314)
       │ branches on decision:
       │   "approved" → fsmAdvancePhase / fsmAdvanceStage / fsmIntentComplete
       │   "external_review" → fsmCompleteStage blocked
       │   else → changes_requested, no FSM advance
       ▼
     text response to agent
```

---

## Target Data Flow: MCP Apps Path (this intent's addition)

```
[initialize handshake]
  Client echoes experimental.apps → hostSupportsMcpApps() caches true
  server.ts capabilities block now includes:
    experimental: { apps: {} }   ← unit-01
    resources: {}                 ← unit-03

Agent
  │ calls haiku_run_next { intent: slug }
  ▼
handleOrchestratorTool → runNext → action === gate_review
  ▼
server.ts setOpenReviewHandler body (unit-05 branch)
  │
  ├─ hostSupportsMcpApps() === false
  │    └─ [existing HTTP+tunnel+browser path, byte-identical]
  │
  └─ hostSupportsMcpApps() === true
       │ createSession() → sessions.ts (same as HTTP path)
       │ buildUiResourceMeta(resourceUri) → { ui: { resourceUri } }
       │   resourceUri = "ui://haiku/review/<REVIEW_APP_VERSION>"
       │   REVIEW_APP_VERSION = sha256(REVIEW_APP_HTML).slice(0,12)
       │
       │ skips startHttpServer, openTunnel, spawn(open)
       │
       │ returns tool result to MCP transport:
       │   { content: [{ type: "text", text: sessionDataJSON }],
       │     _meta: { ui: { resourceUri } } }
       │
       ▼
     Host (Cowork / MCP-Apps-capable client)
       │ sees _meta.ui.resourceUri in tool result
       │ calls resources/read { uri: "ui://haiku/review/<VERSION>" }
       │   → server.ts ReadResource handler
       │   → returns { contents: [{ uri, mimeType: "text/html",
       │               text: REVIEW_APP_HTML }] }
       │ renders HTML in an iframe inside the conversation surface
       ▼
     Review SPA boots inside iframe
       │ host-bridge.ts#isMcpAppsHost():
       │   gate 1: window.parent !== window   (iframe check)
       │   gate 2: try { new App({...}); return true } catch { return false }
       │   caches result
       │ isMcpAppsHost() === true → MCP Apps mode
       │ hydrates from sessionDataJSON in tool result content
       │   (no GET /api/session/:id fetch needed)
       ▼
     User reviews and clicks Approve / Request Changes
       │
       ▼
     host-bridge.ts#submitDecision (MCP Apps mode)
       │ App.callServerTool("haiku_cowork_review_submit", {
       │   session_type: "review",
       │   session_id,
       │   decision,
       │   feedback,
       │   annotations?
       │ })
       ▼
     server.ts CallTool → haiku_cowork_review_submit handler (unit-05)
       │ Zod discriminatedUnion validation on session_type
       │ getSession(session_id) — must exist and be "pending"
       │ updateSession(session_id, { status: "decided", decision, feedback })
       │ notifySessionUpdate(session_id)
       │ returns { content: [{ type: "text", text: '{"ok":true}' }] }
       ▼
     waitForSession resolves (same promise as HTTP path)
       │ getSession → { decision, feedback, annotations }
       │ returns { decision, feedback, annotations? }
       ▼
     handleOrchestratorTool branches on decision — identical to HTTP path
```

---

## Key Abstractions

### FSM Hats

A hat is a markdown file at `plugin/studios/{studio}/stages/{stage}/hats/{hat}.md`.
It defines a behavioral role for an agent executing a unit within that stage.
`haiku_unit_advance_hat(intent, unit)` is called by the **subagent** when it
finishes its hat's work. The orchestrator reads the current hat index from unit
state, increments it, and if it reaches the end of the hat list, marks the unit
complete. `haiku_unit_reject_hat` decrements the hat index and increments the
bolt counter. The parent agent then spawns a new subagent for the next hat or
moves to the next wave.

### Review Gate (`setOpenReviewHandler`)

`setOpenReviewHandler` at `orchestrator.ts:3152` stores a handler that the FSM
calls when it reaches a `gate_review` action. The contract:

```typescript
(intentDir: string, reviewType: string, gateType?: string)
  => Promise<{ decision: string; feedback: string; annotations?: unknown }>
```

The promise blocks the FSM until the user submits a decision. The handler is
registered once by `server.ts:774`. The MCP Apps branch and the HTTP+tunnel
branch must resolve with the identical 3-field object; the orchestrator branches
solely on `decision`.

### Host-Bridge Detection (`isMcpAppsHost()`)

`packages/haiku/review-app/src/host-bridge.ts` (added by unit-04) exports
`isMcpAppsHost()`. Detection runs once at module load via a two-gate probe:

```typescript
function isMcpAppsHost(): boolean {
  // gate 1: is this document in an iframe?
  if (window.parent === window) return false;
  // gate 2: can we construct the MCP Apps bridge?
  try { new App({ ... }); return true; } catch { return false; }
}
```

Result cached as a module-level boolean. Any throw on the `App` constructor
(wrong host, missing capability) safely falls back to browser mode, leaving the
HTTP+WebSocket path intact.

### Discriminated Union Submit Tool (`haiku_cowork_review_submit`)

Single tool registered in `server.ts` (unit-05 + unit-06). One `ListTools`
entry, one `CallTool` dispatch case. Input schema is a Zod
`z.discriminatedUnion("session_type", [...])` with three variants:
`"review"`, `"question"`, `"design_direction"`. The SPA multiplexes all three
session types through this single tool; no per-type tools exist. Validation
order: Zod parse → session existence check → session_type discriminator match
→ status === "pending" check. All errors returned as `{ isError: true }` tool
results per MCP spec.

### Review SPA Bundling

`packages/haiku/scripts/build-review-app.mjs` runs `npm run build` in
`review-app/`, reads `dist/index.html`, inlines all JS and CSS assets as
`<script>` and `<style>` tags, then writes the result to
`src/review-app-html.ts` as the `REVIEW_APP_HTML` string constant.
`build-mcp.mjs` then bundles the whole MCP server including this constant with
esbuild into `plugin/bin/haiku`. The SPA is served verbatim in both transport
paths: `http.ts` serves it over HTTP, and the MCP Apps resource handler returns
it as `text/html` content via `resources/read`.

### `ui://` Resource URI

`"ui://haiku/review/<REVIEW_APP_VERSION>"` is the stable resource URI exposed
via `resources/list` and `resources/read`. `REVIEW_APP_VERSION` is a 12-character
lowercase hex string (first 12 chars of the SHA-256 of `REVIEW_APP_HTML`),
computed at build time in `build-review-app.mjs` and baked into the binary.
Content-hash stability: the URI changes only when the SPA changes, so MCP hosts
can cache the resource safely.

---

## Dependency Graph

### `packages/haiku` (MCP server)

| Category | Package | Version |
|---|---|---|
| MCP SDK | `@modelcontextprotocol/sdk` | `^1.28.0` |
| MCP Apps extension | `@modelcontextprotocol/ext-apps` | _(added by this intent — not yet in package.json)_ |
| Tunnel provider | `localtunnel` | `^2.0.2` |
| Frontmatter parsing | `gray-matter` | `^4.0.3` |
| Schema validation | `zod` | `^3.23.0` |
| Markdown rendering | `marked` | `^17.0.5` |
| Observability | `@sentry/node` | `^10.47.0` |
| Claude Agent SDK | `@anthropic-ai/claude-agent-sdk` | `^0.1.0` |
| Dev / build | `esbuild`, `tsx`, `typescript`, `tailwindcss` | various |

### `packages/haiku/review-app` (bundled SPA)

| Category | Package | Notes |
|---|---|---|
| MCP Apps extension | `@modelcontextprotocol/ext-apps` | _(added by this intent, unit-04 — not yet in package.json)_ |
| React | `react`, `react-dom` | `^19.1.0` |
| Vite | `vite` + `@vitejs/plugin-react` | build toolchain |
| Tailwind | `tailwindcss` `^4`, `@tailwindcss/vite` | utility CSS |
| DAG layout | `@xyflow/react`, `elkjs` | intent/unit graph |
| Markdown | `react-markdown`, `remark-gfm` | knowledge file rendering |
| Observability | `@sentry/react` | `^10.47.0` |

---

## Architectural Decisions

### Capability negotiation over env-var detection

The MCP Apps path activates only when the connected host echoes
`experimental.apps` back during the `initialize` handshake.
`hostSupportsMcpApps()` (`state-tools.ts`) reads the negotiated client
capabilities, not an env variable. This means the feature works across any
MCP-Apps-capable host (Cowork, Claude Desktop if it ships the extension,
Goose, VS Code Copilot, etc.) without per-host configuration. An env-var check
would couple the codebase to a specific host name, break if the product renames,
and require manual provisioning in every new environment.

### Single polymorphic `haiku_cowork_review_submit` over three per-type tools

The review SPA already multiplexes `session_type` in `App.tsx:96-103` and in
`useSession.ts`'s three submit helpers. A single `z.discriminatedUnion` tool
keeps the tool list stable (one `ListTools` entry, one `CallTool` dispatch),
makes the host's tool schema simpler, and centralises session-type validation
in one place. Three separate tools would each need session-existence and
status checks, tripling the boilerplate with no consumer benefit.

### Review SPA reused verbatim across both transport paths

The component tree in `review-app/src/` is unchanged by this intent. The only
difference between HTTP mode and MCP Apps mode is the transport: `host-bridge.ts`
detects the runtime and routes `submitDecision`/`submitAnswers`/
`submitDesignDirection` through either the existing WebSocket/HTTP path or
`App.callServerTool`. No duplicate components, no parallel component trees.
The single bundle is served both by `http.ts` (HTTP GET) and by the
`resources/read` handler (`_meta.ui.resourceUri`).

### Bottom-sheet decision panel over sidebar/drawer

The review SPA's decision controls are rendered in a bottom sheet rather than
a sidebar or right-hand drawer. Iframe width under MCP Apps hosts is
unpredictable — some hosts render narrow panels, some render near-full-width.
A bottom sheet occupies a fixed vertical band at the bottom of the viewport
regardless of width, avoids horizontal layout conflicts, and doesn't truncate
the content area. This was chosen via `pick_design_direction` in the design
stage (`unit-06-visual-question-design-direction`).

### Non-MCP-Apps path stays byte-identical

The HTTP+tunnel+browser path inside `setOpenReviewHandler` is wrapped in an
`else` branch and is not modified. This prevents regressions on local Claude
Code installations that don't support MCP Apps, keeps the existing test suite
green without modification, and means the MCP Apps feature can be reverted by
removing the capability negotiation call and the new `if` branch without
touching the existing logic.

### Blocking timeout logs and resolves `changes_requested` (V5-10, deferred resumable path)

If `waitForSession` times out (30 min total, 3 × 10 min attempts), the handler
currently throws, propagating the error through `handleOrchestratorTool` into a
logged gate-review failure. The unit-02 spike was to measure whether MCP hosts
impose a shorter tool-call timeout that would require a resumable
(`pending_review`) path instead. The spike outcome defaulted to **blocking** —
most hosts honor multi-minute tool calls. If a future spike finds a tighter
ceiling, the resumable path (storing `cowork_review_session_id` in stage state,
resolving on the next `haiku_cowork_review_submit` call) is isolated to the
`setOpenReviewHandler` body and the `haiku_cowork_review_submit` handler; the
orchestrator's `gate_review` branching logic in `handleOrchestratorTool` does
not change. The orchestrator's existing retry semantics (re-running the FSM on
`haiku_run_next`) remain the single source of retry logic.
