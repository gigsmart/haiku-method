# Discovery Document: Remote Review SPA

## Problem Statement

The review SPA is currently embedded in the MCP server — built as a Vite React app, inlined as an HTML string, and served from `127.0.0.1`. This couples the review experience to the local machine, bloats the MCP package, and prevents remote review workflows.

## Goal

Externalize the review experience to `haikumethod.ai/review/`. The MCP exposes itself via localtunnel, signs a JWT containing the tunnel URL, and opens the browser at the website. The website decodes the token and connects back through the tunnel via WebSocket.

## Domain Model

```
MCP Server (local)
├── HTTP Server (127.0.0.1:random)
│   ├── API: GET /api/session/:id → session JSON
│   ├── API: POST /review/:id/decide → submit decision
│   ├── API: POST /question/:id/answer → submit answers
│   ├── API: POST /direction/:id/select → submit direction
│   ├── Files: GET /files/:id/*path → intent/haiku files
│   └── WS: /ws/session/:id → real-time transport
├── Localtunnel → https://xyz.loca.lt (exposes HTTP server)
├── JWT Signer (ephemeral secret, per server lifetime)
└── Session Store (in-memory, 30min TTL, 100 session LRU)

Website (haikumethod.ai, static GitHub Pages)
└── /review/#jwt_token
    ├── Decode JWT → extract tunnel URL + session ID + type
    ├── Fetch session data from tunnel
    ├── Open WebSocket to tunnel
    └── Render review UI (full feature parity with current SPA)
```

## Technical Landscape

### Current State
- **Review SPA**: 20 files, ~3,679 lines, React/Vite, Tailwind, embedded as HTML string
- **HTTP Server**: Node native `createServer`, 861 lines, RFC 6455 WebSocket, sessions in memory
- **Build**: Vite → inline HTML → `review-app-html.ts` → imported by HTTP server
- **Transport**: WS primary, HTTP POST fallback, same-origin

### Target State
- **Review UI**: Lives in `website/app/components/review/`, served from GitHub Pages
- **MCP HTTP Server**: Slimmed down — API + file serving + WS only, no SPA serving
- **Tunnel**: localtunnel npm package, opened per review session
- **Token**: JWT in hash fragment, decoded client-side, never touches any server
- **CORS**: Required on all MCP responses (`*` in dev, `haikumethod.ai` in prod)

### Key Decisions (from research)
1. **Tunnel**: localtunnel (TCP-level proxy, npm package, no account/binary needed)
2. **URL**: `haikumethod.ai/review/#jwt` — hash fragment never sent to server
3. **JWT**: Ephemeral secret per server lifetime, decode-only on client (3-line function)
4. **Migration**: Full cutover — delete review-app/ entirely
5. **File serving**: Consolidate 4 routes into `GET /files/:sessionId/*path`
6. **Dependencies**: No new website deps needed; localtunnel added to MCP package

### Risks
- localtunnel public server reliability (502s, drops) — acceptable for short review sessions
- CORS is new to the MCP HTTP server — needs careful implementation for preflight
- Large binary files through tunnel may be slow on poor connections
- **Tunnel death mid-review**: If the tunnel itself dies (not just WebSocket), the JWT contains the old URL. Recovery: MCP re-opens tunnel (new URL), re-signs JWT, re-opens browser. The old tab becomes stale — user sees "tunnel unreachable" and gets a fresh tab.
- Tunnel open retry/timeout: the loca.lt relay can be slow or down. Need retry logic with clear user-facing error.
