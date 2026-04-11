# Discovery

## Business Context

### Feature goal & vision
H·AI·K·U needs to work seamlessly in Cowork (Claude Code's IDE/web environment). Currently, the review flow depends on binding a local HTTP port and opening a browser (or localtunnel for remote). Cowork can't bind ports or connect to localhost — the MCP server runs in a sandboxed environment. MCP Apps (modelcontextprotocol.io/extensions/apps) solve this by letting tools declare `_meta.ui.resourceUri` pointing to `ui://` resources that the host renders inline in sandboxed iframes.

### Origin & context
Jason identified this while testing haiku:start in Cowork. The existing review flow is fundamentally incompatible with Cowork's execution model. MCP Apps is the official MCP extension for interactive UIs — supported by Claude, Claude Desktop, VS Code Copilot, Goose, and others.

### Success criteria
- **Functional**: Reviews render inline in Cowork via MCP Apps; decisions flow back to the FSM; intent creation detects missing workspace and prompts for one
- **Outcome**: Haiku works end-to-end in Cowork without any HTTP server or tunnel dependency

## Technical Landscape

### Environment detection
- `CLAUDE_CODE_IS_COWORK=1` — detect Cowork runtime
- `CLAUDE_CODE_WORKSPACE_HOST_PATHS` — check if a workspace folder is open (empty = no folder)
- `request_cowork_directory` — tool to prompt user to open a folder

### Current review architecture
Two review infrastructure layers exist:

1. **Server-side HTML templates** (`packages/haiku/src/templates/`): TypeScript functions generating HTML strings. Files: `index.ts` (intent review), `unit-review.ts`, `question-form.ts`, `design-direction.ts`, `annotation-canvas.ts`, `components.ts`, `layout.ts`, `styles.ts`. Bundled into `review-app-html.ts` as a single-page app.

2. **Website React SPA** (`website/app/components/review/`): React components (`ReviewRouter`, `ReviewShell`, `IntentReview`, `UnitReview`, `QuestionForm`, `DirectionPicker`, `ReviewSidebar`) with a `useReviewSession` hook. These fetch session data from `/api/session/:id`.

### HTTP server flow (`packages/haiku/src/http.ts`)
- `createServer()` binds a local port
- Serves the bundled SPA for page routes
- `/api/session/:id` — returns session JSON
- `/api/session/:id/decision` — accepts review decisions (POST)
- `/api/session/:id/answer` — accepts question answers (POST)
- SSE channel for real-time updates
- `tunnel.ts` wraps localtunnel for remote access with JWT + E2E encryption

### Orchestrator gate flow (`packages/haiku/src/orchestrator.ts`)
- `setOpenReviewHandler()` — callback injected by server.ts, opens review UI and blocks until decision
- `setElicitInputHandler()` — fallback when review UI fails
- `gate_review` action triggers `_openReviewAndWait()` → opens HTTP review → waits for decision → processes approve/reject/changes_requested
- Fallback chain: review UI → elicitation → error

### MCP Apps architecture (target)
- Tools declare `_meta.ui.resourceUri` pointing to `ui://` resource
- Host preloads the resource, renders HTML in sandboxed iframe
- `@modelcontextprotocol/ext-apps` provides:
  - Server side: `registerAppTool()`, `registerAppResource()`, `RESOURCE_MIME_TYPE`
  - Client side: `App` class with `connect()`, `ontoolresult`, `callServerTool()`, `updateModelContext()`, `sendMessage()`
- Communication via postMessage (JSON-RPC dialect of MCP)
- No port binding, no HTTP server required

### Key files to modify
- `packages/haiku/src/server.ts` — tool registration, add `_meta.ui` metadata, register `ui://` resources
- `packages/haiku/src/orchestrator.ts` — gate review handler, Cowork-aware branching
- `packages/haiku/src/http.ts` — skip HTTP server startup in Cowork
- New: bundled review app HTML using `@modelcontextprotocol/ext-apps` App class
- New: Cowork environment detection utility

### Overlap with other branches
The `remote-review-spa` branch modifies `http.ts`, `server.ts`, `tunnel.ts`, and adds website review components. This intent touches `server.ts` and `orchestrator.ts` but adds a parallel code path (Cowork) rather than modifying the existing HTTP path.

## Considerations & Risks

### Technical
- **MCP Apps host support**: Need to verify Cowork implements the `ext-apps` protocol
- **Bundle size**: The review SPA must be inlined as a single HTML file; large bundles may have performance implications
- **Bidirectional flow**: `updateModelContext()` should signal Cowork to continue the agent's turn — needs testing
- **Session state**: Without HTTP, session data must be passed through tool results

### Open questions
- Does `updateModelContext()` trigger Cowork to resume the agent, or is it passive context?
- Should the MCP App path eventually replace the HTTP path entirely, or remain Cowork-only?
- Can `vite-plugin-singlefile` produce a bundle small enough for inline `ui://` resources?

## UI Impact

### Affected surfaces
- **Review gate UI**: Rendered inline in Cowork conversation instead of browser tab
- **Visual question UI**: Same — inline instead of browser
- **Design direction picker**: Same — inline instead of browser
- **Intent creation flow**: New workspace detection prompt when no folder is open in Cowork
