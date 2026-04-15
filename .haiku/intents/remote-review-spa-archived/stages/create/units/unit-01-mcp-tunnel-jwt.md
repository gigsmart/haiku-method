---
title: MCP — Localtunnel + JWT token generation
status: pending
depends_on: []
quality_gates:
  - localtunnel npm package added as dependency
  - Tunnel opens programmatically when a review session is created
  - >-
    JWT signed with ephemeral per-server-lifetime secret containing tunnel URL,
    session ID, and session type
  - Browser opens haikumethod.ai/review/#jwt_token instead of localhost URL
  - Tunnel closes gracefully when session completes or MCP shuts down
---

# MCP — Localtunnel + JWT Token Generation

## What to Build

1. Add `localtunnel` as a dependency to the MCP package
2. In the review handler (where `setOpenReviewHandler` is called), open a localtunnel to the HTTP server port
3. Generate a JWT:
   - Payload: `{ tun: tunnel.url, sid: sessionId, typ: "review"|"question"|"direction", iat, exp }`
   - Signed with an ephemeral secret generated once per MCP server lifetime (crypto.randomBytes)
4. Open browser at `https://haikumethod.ai/review/#${jwt}` instead of `http://127.0.0.1:${port}/review/${sessionId}`
5. Handle tunnel lifecycle: close on session complete, reconnect if dropped mid-session

## Key Files
- `packages/haiku/src/http.ts` — tunnel creation alongside HTTP server
- `packages/haiku/src/server.ts` or `orchestrator.ts` — where browser open is triggered
- `packages/haiku/package.json` — add localtunnel dependency
