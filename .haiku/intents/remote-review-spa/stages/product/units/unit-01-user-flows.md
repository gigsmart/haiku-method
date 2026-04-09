---
title: Behavioral spec — user flows and error scenarios
type: product
status: completed
quality_gates:
  - >-
    Happy path flow specified for all 3 session types (review, question,
    direction)
  - At least 3 error scenarios per flow with Given/When/Then
  - Feature flag behavior specified (local SPA vs remote review)
  - Reconnection flow specified end-to-end
  - >-
    Stepped review UX specified (section navigation, comment state, decision
    inference)
---

# User Flows and Error Scenarios

## Happy Path: Intent Review
1. Agent calls `_openReviewAndWait()` → MCP creates session
2. MCP opens localtunnel to HTTP server port
3. MCP signs JWT `{ tun, sid, typ: "review", iat, exp }`
4. MCP opens browser at `haikumethod.ai/review/#<jwt>`
5. Website loads, decodes hash → extracts tunnel URL + session ID
6. Website fetches `GET {tunnelUrl}/api/session/{sid}` → session data JSON
7. Website opens `wss://{tunnelHost}/ws/session/{sid}`
8. Reviewer sees stepped sections (Problem → Solution → Units → Criteria → Decision)
9. Navigation is free — click any step in sidebar, or use Back/Next buttons. No forced order. Steps are marked as "seen" when visited.
10. Reviewer adds comments per section in left sidebar (stored locally until decision)
11. Final "Decision" step: shows which sections were seen vs skipped, auto-suggests action from comment state
12. Reviewer clicks Approve or Request Changes → all comments batched and sent via WS (fallback: HTTP POST)
12. MCP receives decision, unblocks orchestrator, closes tunnel

## Error Scenarios

### E1: Expired token
- Given: JWT exp claim is in the past
- When: Website decodes token on mount
- Then: Show "Review Link Expired" error card, sidebar shows red "Token expired" status

### E2: Tunnel unreachable
- Given: Valid JWT but tunnel server is down or MCP stopped
- When: Website tries `GET {tunnelUrl}/api/session/{sid}`
- Then: Show "Connection Failed" error card after timeout, sidebar shows "Tunnel unreachable"

### E3: Malformed token
- Given: Hash fragment is not a valid JWT (bad base64, no dots, etc.)
- When: Website attempts to decode
- Then: Show "Invalid Review Link" error card

### E4: Session not found
- Given: Valid JWT, tunnel reachable, but session ID doesn't exist (expired from MCP memory)
- When: `GET /api/session/{sid}` returns 404
- Then: Show "Session Not Found" error, suggest requesting a new link

### E5: WebSocket drops mid-review
- Given: Reviewer is in the middle of stepping through sections
- When: WebSocket connection closes unexpectedly
- Then: Show amber "Reconnecting..." banner, sidebar shows pulsing amber dot, content dims. Auto-retry every 3 seconds. On reconnect: resume normal UI. After 5 failed retries: show persistent error.

### E6: Tunnel dies mid-review
- Given: Tunnel process dies on MCP side (not just WS)
- When: Both WS and HTTP requests fail
- Then: MCP re-opens tunnel (new URL), re-signs JWT, re-opens browser with new token. Old tab shows "Connection Failed" error.

## Feature Flag
- `HAIKU_REMOTE_REVIEW=1` environment variable
- When unset or 0 (default): MCP uses local SPA (current behavior)
- When set to 1: MCP uses localtunnel + website flow
- Simple env var — no config persistence needed
