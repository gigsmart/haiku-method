# Discovery: Hosted Review UI

## Domain Model

### Entities

**Session** — Ephemeral in-memory object representing a single user interaction. Three variants:
- `ReviewSession` — intent/unit review with decision (approved/changes_requested), annotations (pins, comments, screenshot), parsed intent data, units, DAG, mockups, stage states, knowledge files
- `QuestionSession` — multi-question form with options, images, free-text answers, annotations
- `DesignDirectionSession` — archetype picker with parameter sliders, single selection

**MCP Tool** — The entry point. Three tools create sessions and open the browser:
- `open_review` — creates ReviewSession, parses intent directory, opens browser, blocks until decision
- `ask_user_visual_question` — creates QuestionSession, opens browser, blocks until answered
- `pick_design_direction` — creates DesignDirectionSession, opens browser, returns immediately (does not block)

**HTTP Server** — Node.js `createServer()` on random port at `127.0.0.1`. Serves HTML (SPA), JSON API, file assets (mockups, wireframes, question images), and WebSocket.

**Review App** — React 19 + Vite 6.3 SPA bundled as single inlined HTML string. Built by `scripts/build-review-app.mjs` into `src/review-app-html.ts` as `REVIEW_APP_HTML` constant.

**Website** — Next.js 15 static export to GitHub Pages at `haikumethod.ai`. No review route exists.

### Relationships

```
MCP Tool → creates → Session (in-memory Map)
MCP Tool → starts → HTTP Server (idempotent, random port)
MCP Tool → opens → Browser (http://127.0.0.1:{port}/{type}/{sessionId})
Browser → loads → Review App HTML (served by HTTP server)
Review App → fetches → /api/session/{id} (JSON)
Review App → connects → /ws/session/{id} (WebSocket)
Review App → submits → POST to /{type}/{id}/{action}
  OR via WebSocket message
HTTP Server → updates → Session → emits event
MCP Tool → awaits → Session event (waitForSession, 30min timeout)
```

### Target Relationships (post-migration)

```
MCP Tool → creates → Session (in-memory Map, unchanged)
MCP Tool → starts → HTTPS Server (cert from cert-server, fixed or dynamic port)
MCP Tool → encodes → urlsafebase64({port}-{sessionId})
MCP Tool → opens → Browser (https://haikumethod.ai/review/{encoded})
Website → decodes → {port, sessionId} from URL param
Website → fetches → https://local.haikumethod.ai:{port}/api/session/{id}
Website → connects → wss://local.haikumethod.ai:{port}/ws/session/{id}
Website → submits → POST to https://local.haikumethod.ai:{port}/{type}/{id}/{action}
HTTPS Server → updates → Session → emits event
MCP Tool → awaits → Session event (unchanged)
```

## Technical Landscape

### Current Architecture

| Component | Technology | Location |
|---|---|---|
| MCP Server | Node.js, stdio transport | `packages/haiku/src/server.ts` |
| HTTP Server | Node.js `http.createServer()` | `packages/haiku/src/http.ts` |
| Session Store | In-memory Map + EventEmitter | `packages/haiku/src/sessions.ts` |
| Review App | React 19, Vite 6.3, Tailwind 4.1 | `packages/haiku/review-app/` |
| Build Script | Vite build → inline HTML string | `packages/haiku/scripts/build-review-app.mjs` |
| HTML Export | `REVIEW_APP_HTML` constant (~237K tokens) | `packages/haiku/src/review-app-html.ts` |
| Browser Open | `open`/`xdg-open` with `http://127.0.0.1:{port}/...` | `packages/haiku/src/server.ts` |

**Review App Components** (15 files in `review-app/src/components/`):
AnnotationCanvas, Card, CommentTray, CriteriaChecklist, DecisionForm, DesignPicker, InlineComments, MarkdownViewer, MermaidDiagram, QuestionPage, ReviewPage, StatusBadge, SubmitSuccess, Tabs, ThemeToggle

**HTTP Routes** (current):
- `GET /review/:sessionId` — serves SPA HTML
- `GET /question/:sessionId` — serves SPA HTML
- `GET /direction/:sessionId` — serves SPA HTML
- `GET /api/session/:sessionId` — JSON session data
- `POST /review/:sessionId/decide` — submit review decision
- `POST /question/:sessionId/answer` — submit question answers
- `POST /direction/:sessionId/select` — submit design direction
- `GET /mockups/:sessionId/:path` — serve mockup files from intent dir
- `GET /wireframe/:sessionId/:path` — serve wireframe files from intent dir
- `GET /question-image/:sessionId/:index` — serve question images
- `WS /ws/session/:sessionId` — WebSocket for real-time updates

### Target Architecture

| Component | Technology | Location |
|---|---|---|
| DNS | `local.haikumethod.ai` A→127.0.0.1, AAAA→::1 | GCP Cloud DNS (terraform) |
| Cert Server | Microservice (Let's Encrypt certs) | Hosted (Railway or similar) |
| HTTPS Server | Node.js `https.createServer()` with fetched certs | `packages/haiku/src/http.ts` |
| Session Store | Unchanged | `packages/haiku/src/sessions.ts` |
| Review UI | Website route `/review/[encoded]/` | `website/app/review/` |
| URL Encoding | `urlsafebase64({port}-{sessionId})` | `packages/haiku/src/server.ts` |

**HTTP Routes** (target — API + WebSocket only, no HTML):
- `GET /api/session/:sessionId` — JSON session data (+ CORS)
- `POST /review/:sessionId/decide` — submit review decision (+ CORS)
- `POST /question/:sessionId/answer` — submit question answers (+ CORS)
- `POST /direction/:sessionId/select` — submit design direction (+ CORS)
- `GET /mockups/:sessionId/:path` — serve mockup files (+ CORS)
- `GET /wireframe/:sessionId/:path` — serve wireframe files (+ CORS)
- `GET /question-image/:sessionId/:index` — serve question images (+ CORS)
- `WS(S) /ws/session/:sessionId` — WebSocket (over TLS)

### Infrastructure (existing)

- GCP Cloud DNS zone `haikumethod-ai` for `haikumethod.ai` already exists in terraform
- DNS modules at `deploy/terraform/modules/dns/` with records for GitHub Pages, MCP subdomain (disabled), auth proxy
- Website deploys via GitHub Pages on push to main

## Key Risks

### R1: Mixed-Content / CORS Complexity
The website at `https://haikumethod.ai` must fetch from `https://local.haikumethod.ai:{port}`. This is cross-origin. The local server must respond with proper CORS headers (`Access-Control-Allow-Origin: https://haikumethod.ai`, `Access-Control-Allow-Methods`, preflight handling). WebSocket upgrade requests also need origin validation.

**Mitigation**: Explicit CORS middleware in http.ts. Test with actual browser cross-origin requests.

### R2: TLS Certificate Provisioning
The cert-server must reliably provision and renew Let's Encrypt certs for `local.haikumethod.ai`. If cert-server is down, the local HTTPS server cannot start. Han's pattern uses 6-day certs renewed every 12h.

**Mitigation**: Cache certs locally (filesystem). Fallback to cached cert if cert-server is unreachable. Short cert lifetime means rotation is frequent but manageable.

### R3: Port Encoding Stability
The URL `haikumethod.ai/review/{encoded}` encodes both port and session ID. If the MCP process restarts (new port), existing URLs break. This is the same as today (URLs break on restart), so no regression.

**Mitigation**: Accept as known limitation. Session TTL is 30 minutes — URLs are inherently ephemeral.

### R4: Static Export + Dynamic Route
Next.js static export (`output: "export"`) cannot SSR dynamic routes with unknown params. The `/review/[encoded]/` route must be entirely client-side rendered. This means the page shell is exported at build time, and all logic runs in the browser.

**Mitigation**: Use `"use client"` directive. `generateStaticParams()` returns empty array (or use catch-all `[...encoded]`). All data fetching via `useEffect` + `fetch`.

### R5: Firewall / Network Environment
`local.haikumethod.ai` resolves to 127.0.0.1 via public DNS. Some corporate networks or DNS resolvers may block or rewrite loopback DNS responses (DNS rebinding protection).

**Mitigation**: Document the requirement. Same limitation exists in Han's coordinator pattern — users have validated it works in practice.

### R6: Review App Component Migration
The bundled review app has 15 React components. These need to be ported to the website's codebase (which uses the same stack: React 19, Tailwind, react-markdown, remark-gfm, mermaid). The port should be straightforward since the tech stacks align.

**Mitigation**: Website already has all required dependencies. Components can be moved with minimal adaptation (Tailwind version difference: 4.1 vs 4.0, but functionally compatible).

## Overlap Check

Ran `git diff --name-only main...{branch}` for all active `origin/ai-dlc/*/main` branches.

### Branches with overlapping files

**origin/ai-dlc/first-class-design-providers/main**
- Touches `plugin/mcp-server/src/http.ts`, `plugin/mcp-server/src/server.ts`, `plugin/mcp-server/src/sessions.ts`
- These are the old path names (pre-rebrand). Our intent touches the current paths: `packages/haiku/src/http.ts`, `packages/haiku/src/server.ts`, `packages/haiku/src/sessions.ts`
- **Assessment**: Low conflict risk. The design-providers branch appears to be on the old codebase structure. If it merges first, we rebase. If we merge first, they rebase.

**origin/ai-dlc/haiku-rebrand/main**
- Massive branch touching nearly every file in the repo (full rebrand)
- Touches `packages/haiku/` files, `website/`, `deploy/terraform/`
- **Assessment**: This branch has already been merged to main (it's the current state). The remote branch is stale. No active conflict.

### No-conflict branches
All other active branches (`first-class-passes`, `elaboration-canvas`, etc.) do not touch `packages/haiku/src/http.ts`, `packages/haiku/src/server.ts`, `packages/haiku/review-app/`, or `website/app/review/`.

## Key Decisions

### D1: Cert-server implementation
Model after Han's cert-server pattern. Standalone microservice deployed to Railway. Provisions Let's Encrypt certs for `local.haikumethod.ai` via DNS-01 challenge (requires GCP Cloud DNS API access for TXT record management).

### D2: URL encoding scheme
`urlsafebase64(JSON.stringify({p: port, s: sessionId}))` or simpler `urlsafebase64("{port}-{sessionId}")`. The simpler format is sufficient and produces shorter URLs.

### D3: Website review route structure
Single catch-all route `/review/[encoded]/page.tsx` that handles all three session types (review, question, design_direction). The session type is determined from the API response, not the URL.

### D4: Local server port
Keep random port (OS-assigned) like today. The port is encoded in the URL, so no need for a fixed port. This avoids port conflicts.

### D5: Terraform for DNS
Add `local.haikumethod.ai` A and AAAA records to the existing GCP Cloud DNS zone via new terraform resources in `deploy/terraform/modules/dns/`.
