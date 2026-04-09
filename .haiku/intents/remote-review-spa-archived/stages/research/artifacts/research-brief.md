# Research Brief: Remote Review SPA

## 1. Localtunnel Integration

**Verdict: Viable with caveats.**

The `localtunnel` npm package works at the TCP level — raw `net.connect()` sockets piped bidirectionally. This means:
- **WebSocket: Yes.** Upgrade requests pass through transparently (byte-level proxy).
- **Binary files: Yes.** No content-type inspection or encoding transformation.

**Programmatic API:**
```js
const localtunnel = require('localtunnel');
const tunnel = await localtunnel({ port: 3000, subdomain: 'optional' });
console.log(tunnel.url); // https://xyz.loca.lt
tunnel.on('close', () => { /* reconnect logic */ });
tunnel.close();
```

**Concerns:**
- The public `localtunnel.me` server is notoriously flaky (502s, random drops, rate limiting). Fine for review sessions (short-lived, low traffic), but worth noting.
- No idle timeout in client code, but server-side eviction can happen.
- Subdomain requests are best-effort — no reservation mechanism.
- Individual socket reconnection is automatic; full session death requires creating a new tunnel.

**Why localtunnel over alternatives:**

| Service | WS Support | Node API | Free Tier | Account Required | Binary Dep |
|---|---|---|---|---|---|
| localtunnel | Yes (TCP pipe) | `localtunnel` npm | Unlimited | No | No |
| ngrok | Yes | `@ngrok/ngrok` npm | 1 agent, rate limited | Yes (auth token) | Yes (binary) |
| cloudflared | Yes | None (CLI only) | Unlimited | No | Yes (binary) |
| bore | Yes (TCP) | None (Rust CLI) | Self-host only | N/A | Yes (binary) |

User selected localtunnel. Key advantages: zero-config (no account, no binary), npm package for programmatic use, transparent TCP proxy. Main downside: public server reliability — acceptable for short-lived review sessions (single user, ~5-30 min).

**Recommendation:** Use localtunnel. If reliability becomes an issue, self-hosting the localtunnel server or switching to ngrok (requires auth token setup) are fallback options.

## 2. Hash Fragment Routing on Static Site

**Verdict: Works perfectly.**

- Next.js `output: "export"` + `trailingSlash: true` produces `/review/index.html`.
- GitHub Pages serves this file for `/review/` requests.
- Hash fragments (`#token`) are never sent to the server — purely client-side. This is a security benefit: the tunnel URL never touches GitHub's servers.
- The existing auth callback pattern (`/app/auth/[provider]/callback/page.tsx`) confirms this works: `generateStaticParams` for the shell + `"use client"` component reading `window` at runtime.

**JWT Client-Side Decoding (no verification needed):**
```ts
function decodeJWT(token: string) {
  const payload = token.split('.')[1]
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(base64))
}
```

No library needed — 3 lines. The signing secret is ephemeral and stays on the local machine. Client only needs to decode the payload.

**Suggested JWT Payload:**
```json
{
  "tun": "https://abc123.loca.lt",
  "sid": "session-uuid",
  "typ": "review",
  "iat": 1712600000,
  "exp": 1712603600
}
```

Compact — lives in a URL fragment. `exp` enables client-side "link expired" UX even without verification.

**Threat Model:**
- **JWT tampering (redirect to attacker server):** If someone intercepts and modifies the JWT payload to point `tun` at a malicious server, the SPA would connect there. Mitigation: the hash fragment never leaves the client (not sent to any server, not in HTTP referer headers). The only attack vector is someone with access to the user's browser/clipboard. This is the same trust boundary as the local MCP itself.
- **Tunnel URL exposure:** The tunnel URL is ephemeral (dies when MCP stops) and serves only the review API. No persistent data is exposed. Session data includes intent specs and unit descriptions — not secrets.
- **Ephemeral secret scope:** Generated per MCP server lifetime (not per session). The JWT signature prevents accidental corruption of the payload but is not a security boundary — the hash fragment's client-only nature is the real protection.

**Explicit Assumptions:**
1. localtunnel passes WebSocket upgrade headers correctly — confirmed by reading source (`TunnelCluster.js` uses raw TCP `stream.pipe()`, no HTTP parsing)
2. GitHub Pages serves `/review/index.html` for `/review/` paths — confirmed by `trailingSlash: true` in Next.js config
3. The existing WS + HTTP POST fallback pattern in `useSession.ts` transfers as-is — the only change is base URL (relative → absolute from JWT). The WebSocket frame protocol and HTTP POST bodies are identical.
4. CORS is a **new requirement** — `http.ts` currently has zero CORS handling since the SPA runs same-origin. Cross-origin requests from `haikumethod.ai` to `*.loca.lt` will fail without `Access-Control-Allow-Origin` headers on all API and file-serving responses.

## 3. SPA Migration Audit

### Component Inventory (20 files, ~3,679 lines)

**Core pages:**
- `ReviewPage.tsx` (1,029 lines) — tabbed review UI (Overview, Units/DAG, Knowledge, Outputs, Domain Model) + unit review
- `QuestionPage.tsx` (276 lines) — multi-question form with radio/checkbox
- `DesignPicker.tsx` (272 lines) — archetype gallery + parameter sliders

**Annotation/interaction:**
- `AnnotationCanvas.tsx` (459 lines) — image pin placement, freehand drawing
- `InlineComments.tsx` (332 lines) — text selection-based commenting
- `ReviewSidebar.tsx` (318 lines) — comment list, approve/reject buttons

**Data layer:**
- `useSession.ts` (225 lines) — fetch session data, WebSocket connection, submit functions
- `types.ts` (157 lines) — all TypeScript interfaces

**Shared UI:**
- Tabs, Card, StatusBadge, MarkdownViewer, CriteriaChecklist, MermaidDiagram, ThemeToggle, SubmitSuccess

### Dependency Compatibility

All SPA dependencies already exist in the website or have direct equivalents:
- react-markdown, remark, remark-gfm, remark-html — already in website
- mermaid — website bundles it (SPA uses CDN, will switch to bundled)
- tailwindcss + typography — already in website
- Sentry — swap @sentry/react for @sentry/nextjs
- @haiku/shared components — inline into website (StatusBadge, MarkdownViewer, CriteriaChecklist)

**No new npm dependencies needed.**

### Data Flow Changes

Current: All fetches use relative paths (`/api/session/:id`). SPA runs on same origin as MCP server.

After migration: Website runs on `haikumethod.ai`, MCP runs on `https://xyz.loca.lt`. The `useSession` hook needs to accept the tunnel URL (from decoded JWT) as the API base URL. All fetch calls and WebSocket URLs become absolute, pointing at the tunnel.

Binary files (mockups, wireframes, artifacts) are currently served by four separate MCP routes. These should be consolidated into a single generic file-serving route: `GET /files/:sessionId/*path` that resolves paths relative to the intent or `.haiku` directory (with path-traversal protection). The website constructs absolute URLs like `https://xyz.loca.lt/files/:sessionId/mockups/design.png`.

### What Gets Removed from MCP

**Remove:**
- `review-app/` directory (entire Vite SPA)
- `review-app-html.ts` (generated HTML blob)
- `scripts/build-review-app.mjs` (build pipeline)
- HTML-serving routes: `GET /review/:sessionId`, `GET /question/:sessionId`, `GET /direction/:sessionId`
- `serveSpa()` function and `REVIEW_APP_HTML` import

**Keep (but refactor):**
- All API routes (`/api/session/`, POST endpoints)
- File serving — consolidate `/mockups/`, `/wireframe/`, `/stage-artifacts/`, `/question-image/` into a single `GET /files/:sessionId/*path` route that serves any file from the intent or `.haiku` directory (with realpath traversal guard)
- WebSocket upgrade handler
- Session management (creation, eviction, event emitter)
- CORS headers will need to be added (cross-origin requests from `haikumethod.ai` to tunnel)

### SSR Compatibility

Almost every interactive component needs `"use client"` — which is fine, the website already has 63 files with this directive. The review page is inherently client-side (reads hash fragment, opens WebSocket). Server component is just the shell.

### Key Replacements
- SPA's custom ThemeToggle → website's `next-themes` system
- CDN mermaid script injection → website's bundled `Mermaid.tsx`
- `@sentry/react` → website's `@sentry/nextjs`
- `App.tsx` routing → Next.js `/review/page.tsx` with `"use client"`

## Architecture Summary

```
Browser opens haikumethod.ai/review/#eyJhb...
    │
    ├─ /review/index.html loads (static, from GitHub Pages)
    ├─ Client JS decodes JWT from hash → extracts tunnel URL + session ID
    ├─ Fetches GET https://xyz.loca.lt/api/session/:sessionId
    ├─ Opens WS wss://xyz.loca.lt/ws/session/:sessionId
    ├─ Files load from https://xyz.loca.lt/files/:sessionId/path/to/file
    │
    └─ User submits review → WS message or POST to tunnel
        └─ MCP server receives, updates session, unblocks orchestrator
```

```
MCP Server (on user's machine)
    │
    ├─ Creates session (UUID, parsed intent/units/criteria)
    ├─ Starts HTTP server (127.0.0.1:random_port)
    ├─ Opens localtunnel (port → https://xyz.loca.lt)
    ├─ Signs JWT { tun: tunnel.url, sid: sessionId, typ: "review" }
    ├─ Opens browser: haikumethod.ai/review/#jwt_token
    ├─ Waits for session decision (EventEmitter)
    │
    └─ HTTP server handles:
        ├─ GET /api/session/:id → JSON session data
        ├─ POST /review/:id/decide → decision + annotations
        ├─ GET /files/:id/*path → any file from intent/.haiku dir
        ├─ WS /ws/session/:id → real-time transport
        └─ (CORS: Allow-Origin haikumethod.ai)
```
