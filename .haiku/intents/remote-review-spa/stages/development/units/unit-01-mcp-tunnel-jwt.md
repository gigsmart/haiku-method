---
title: MCP — Localtunnel + JWT token generation
status: completed
depends_on: []
quality_gates:
  - localtunnel added as dependency in packages/haiku/package.json
  - >-
    Tunnel opens programmatically when review session is created and
    HAIKU_REMOTE_REVIEW=1
  - >-
    JWT signed with HS256 using ephemeral per-server-lifetime secret
    (crypto.randomBytes)
  - 'JWT payload contains: tun, sid, typ, iat, exp (1hr TTL)'
  - >-
    Browser opens haikumethod.ai/review/#jwt instead of localhost URL when flag
    is set
  - Tunnel closes when session completes
  - Tunnel reconnect on drop with new JWT and new browser tab
  - >-
    Feature flag HAIKU_REMOTE_REVIEW=1 gates the new behavior; unset = local SPA
    (current)
  - TypeScript compiles with no errors
bolt: 1
hat: reviewer
started_at: '2026-04-09T19:52:01Z'
hat_started_at: '2026-04-09T19:56:37Z'
completed_at: '2026-04-09T19:57:28Z'
---

# MCP — Localtunnel + JWT Token Generation

## Implementation

Key files: `packages/haiku/src/http.ts`, `packages/haiku/package.json`

1. `bun add localtunnel` in packages/haiku/
2. Create tunnel management (in http.ts or new file):
   - `openTunnel(port)` → returns tunnel URL
   - `closeTunnel()` → cleanup
   - Retry on tunnel open failure
3. JWT signing (no library — use crypto.createHmac):
   - Ephemeral secret: `crypto.randomBytes(32)` generated once at module load
   - Payload: `{ tun, sid, typ, iat, exp }`
4. In `setOpenReviewHandler` callback:
   - If `HAIKU_REMOTE_REVIEW=1`: open tunnel, sign JWT, open `haikumethod.ai/review/#${jwt}`
   - Else: current local SPA behavior
5. On tunnel death: re-open tunnel, re-sign JWT, re-open browser
