---
status: completed
last_updated: ""
depends_on:
  - unit-01-shared-parser
branch: ai-dlc/visual-review/02-mcp-channel-server
discipline: backend
pass: ""
workflow: ""
ticket: ""
---

# unit-02-mcp-channel-server

## Description

MCP channel server that bridges AI-DLC spec review between Claude Code and a browser-based review UI. Declares `claude/channel` capability, exposes an `open_review` tool for Claude to invoke at review boundaries, serves HTML review pages via local HTTP, and pushes review decisions back as channel events. Built with Bun runtime using the low-level `Server` class from `@modelcontextprotocol/sdk`.

## Discipline

backend - MCP protocol implementation, HTTP server, channel event handling.

## Domain Entities

- **ReviewSession** — Created when Claude calls `open_review`. Tracks: session_id, intent_slug, review_type (intent/unit/dag), review_target (slug), status (pending/decided), decision, feedback.
- **ReviewDecision** — The user's decision from the browser: decision (approved/changes_requested) + feedback text. Pushed as a channel event.

## Data Sources

- **Shared parser** (unit-01): `parseIntent()`, `parseAllUnits()`, `buildDAG()`, `toMermaidDefinition()` for reading `.ai-dlc/` data
- **MCP SDK**: `@modelcontextprotocol/sdk` for Server class, StdioServerTransport, request/notification schemas
- **zod**: Peer dependency for notification schema validation

## Technical Specification

### 1. Server Setup (`plugin/mcp-server/src/server.ts`)

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const mcp = new Server(
  { name: "ai-dlc-review", version: "0.1.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: `Review decisions arrive as <channel source="ai-dlc-review" decision="..." review_type="..." target="...">feedback text</channel>. When you receive a decision with decision="approved", proceed with the workflow. When decision="changes_requested", read the feedback and address the requested changes.`,
  },
);
```

### 2. MCP Tools

**`open_review`** — Opens a browser to the review page for an intent or unit.

Input schema:
```json
{
  "type": "object",
  "properties": {
    "intent_dir": { "type": "string", "description": "Absolute path to .ai-dlc/{slug}/ directory" },
    "review_type": { "type": "string", "enum": ["intent", "unit"], "description": "What to review" },
    "target": { "type": "string", "description": "For unit review: the unit filename (e.g., unit-01-shared-parser)" }
  },
  "required": ["intent_dir", "review_type"]
}
```

Behavior:
1. Parse intent and unit files using shared parser (unit-01)
2. Generate HTML review page with all data
3. Store the review session in memory (Map keyed by session_id)
4. Start HTTP server if not already running (idempotent)
5. Open browser to `http://localhost:{port}/review/{session_id}`
6. Return `{ content: [{ type: "text", text: "Review page opened. Waiting for reviewer decision..." }] }`

**`get_review_status`** — Check if a review decision has been made (for polling if channel event is missed).

Input schema:
```json
{
  "type": "object",
  "properties": {
    "session_id": { "type": "string" }
  },
  "required": ["session_id"]
}
```

Returns the current session status and decision if available.

### 3. HTTP Server (`plugin/mcp-server/src/http.ts`)

Local HTTP server on port 8789 (configurable via `AI_DLC_REVIEW_PORT` env var), bound to `127.0.0.1`.

Routes:
- `GET /review/:sessionId` — Serves the rendered HTML review page (content generated from parsed data, templates from unit-03)
- `POST /review/:sessionId/decide` — Receives the review decision from the browser
- `GET /assets/:file` — Serves static assets (CSS if needed)
- `GET /mockups/:path` — Serves wireframe HTML files from the intent's mockups/ directory

### 4. Review Decision Flow

When browser POSTs to `/review/:sessionId/decide`:

```json
{
  "decision": "approved",       // or "changes_requested"
  "feedback": "Looks good!"     // optional feedback text
}
```

The server:
1. Updates the ReviewSession status to "decided"
2. Pushes a channel event to Claude Code:
```typescript
await mcp.notification({
  method: "notifications/claude/channel",
  params: {
    content: feedback || "",
    meta: {
      decision: "approved",         // or "changes_requested"
      review_type: session.review_type,
      target: session.target || "",
      session_id: sessionId,
    },
  },
});
```
3. Returns `{ status: "ok" }` to the browser (browser can show confirmation and close)

### 5. Browser Opening

Use `Bun.spawn` to open the default browser:
```typescript
// macOS
Bun.spawn(["open", url]);
// Linux
Bun.spawn(["xdg-open", url]);
```

Detect platform via `process.platform`.

### 6. Package Setup (`plugin/mcp-server/package.json`)

```json
{
  "name": "@ai-dlc/mcp-server",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "start": "bun run src/server.ts" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.28.0",
    "zod": "^3.23.0",
    "@ai-dlc/shared": "workspace:*"
  }
}
```

### 7. MCP Configuration (`.mcp.json` in plugin root)

```json
{
  "mcpServers": {
    "ai-dlc-review": {
      "command": "bun",
      "args": ["run", "--cwd", "${CLAUDE_PLUGIN_ROOT}/mcp-server", "src/server.ts"]
    }
  }
}
```

## Success Criteria

- [ ] Server creates successfully with `claude/channel` capability declaration
- [ ] `open_review` tool accepts intent_dir, review_type, and target parameters
- [ ] `open_review` parses intent/unit data using shared parser and generates an HTML page
- [ ] `open_review` starts HTTP server (idempotent) and opens browser to review URL
- [ ] HTTP server serves the review page at `GET /review/:sessionId`
- [ ] `POST /review/:sessionId/decide` receives decision and pushes channel event to Claude Code
- [ ] Channel event includes decision, review_type, target, and session_id in meta fields
- [ ] Feedback text from the browser is included as the channel event content
- [ ] Server handles multiple sequential review sessions (one at a time, not concurrent)
- [ ] Server handles graceful shutdown when Claude Code terminates the subprocess

## Risks

- **Port conflicts**: Port 8789 may be in use. Mitigation: configurable via env var, try next port on EADDRINUSE.
- **Browser opening fails in headless environments**: Mitigation: log URL to stderr so user can open manually; `open_review` still returns the URL.
- **Channel event timing**: If Claude checks for decision before user acts, it should wait for the channel event (not poll). The channel event push model handles this — Claude receives the event when it arrives.

## Boundaries

This unit does NOT handle:
- HTML template design or styling (unit-03)
- Static site generation (unit-04)
- Plugin packaging or skill definitions (unit-05)
- Permission relay capability (out of scope for initial version)

## Notes

- Use the low-level `Server` class, NOT `McpServer`. Only `Server` supports `notification()` and `setNotificationHandler()`.
- The HTTP server should only start when `open_review` is first called (lazy initialization), not at MCP server startup.
- `console.log()` MUST NOT be used (corrupts stdio JSON-RPC). Use `console.error()` for debug logging.
- Review sessions are stored in-memory (Map). No persistence needed — sessions are ephemeral to the Claude Code session lifetime.
- During the research preview, testing requires `--dangerously-load-development-channels server:ai-dlc-review`.
