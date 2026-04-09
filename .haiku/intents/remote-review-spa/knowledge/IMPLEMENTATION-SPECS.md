# Implementation Specs (for development stage)

## Unit Split (4 units, parallel where possible)

### MCP — Localtunnel + JWT
- Add `localtunnel` dependency, open tunnel on review session create
- Sign JWT: `{ tun, sid, typ, iat, exp }` with ephemeral per-server-lifetime secret
- 1-hour TTL
- Open browser at `haikumethod.ai/review/#jwt`
- Tunnel lifecycle: close on session complete, reopen on drop
- If tunnel dies mid-session: re-open tunnel (URL may change), re-sign JWT, re-open browser with new token
- Retry/timeout on tunnel open — clear error if relay is down

**Verification:**
- `curl -s https://<tunnel>/api/session/<id> | jq .sid` returns valid session ID
- JWT decodes to correct payload with `node -e "console.log(JSON.parse(Buffer.from(token.split('.')[1], 'base64url')))"`
- Tunnel closes after session completes (no orphan processes)

### MCP — API Refactor
- CORS: wildcard dev, haikumethod.ai prod, OPTIONS preflight
- Consolidate 4 file routes into `GET /files/:sessionId/*path` (intent dir + global knowledge, realpath guard)
- Remove SPA serving (serveSpa, REVIEW_APP_HTML, HTML routes)
- Delete review-app/, review-app-html.ts, build-review-app.mjs
- Remove from prebuild scripts, tsconfig, CI

**Verification:**
- `OPTIONS` preflight to tunnel returns correct CORS headers
- `review-app/` directory absent from build output
- `bun run build` succeeds without review-app references
- `GET /files/:sessionId/mockups/test.png` returns image; `GET /files/:sessionId/../../etc/passwd` returns 403

### Website — Review Page Shell
- `/app/review/page.tsx` → static shell
- `ReviewShell.tsx` "use client" → read hash, decode JWT, check exp
- useSession hook adapted for remote base URL from JWT
- WebSocket auto-reconnect with retry + disconnected banner
- Error states: expired, malformed, unreachable, not found

**Verification:**
- `bun run build` in website/ succeeds; `/review/index.html` exists in output
- `/review/#<valid-token>` loads and fetches session data from tunnel
- `/review/#<expired-token>` shows "link expired" error
- `/review/#garbage` shows "invalid token" error
- WS disconnect shows reconnecting banner; WS reconnect resumes normal UI

### Website — Component Migration
- Port all 20 components to website/app/components/review/
- Swap ThemeToggle → next-themes, MermaidDiagram → bundled Mermaid, Sentry → @sentry/nextjs
- Binary file URLs → absolute via /files/:sessionId/*path
- All interactive components get "use client"
- MarkdownViewer.tsx and MermaidDiagram.tsx are explicitly NOT ported — replaced by website equivalents

**Verification:**
- All 20 source components accounted for (12 ported, 3 replaced, 5 eliminated)
- Review page renders all tabs (Overview, Units/DAG, Knowledge, Outputs) without console errors
- Annotation canvas pins and inline comments work
- E2E: MCP creates session → opens tunnel → signs JWT → website decodes → fetches → opens WS → submits decision → MCP receives

### DAG
Units 1, 2, 3 parallel → Unit 4 depends on Unit 3

### Branch
Feature branch: haiku/remote-review-spa/main → PR to main
