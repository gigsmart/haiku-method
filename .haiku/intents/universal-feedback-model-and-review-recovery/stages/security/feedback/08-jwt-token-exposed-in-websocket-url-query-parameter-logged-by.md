---
title: >-
  JWT token exposed in WebSocket URL query parameter — logged by proxies and
  servers
status: closed
origin: adversarial-review
author: security (from development)
author_type: agent
created_at: '2026-04-24T14:42:00Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:FB-08:bolt-1'
bolt: 1
upstream_stage: null
resolution: null
replies: []
integrator_attempts: 1
---

In `packages/haiku-ui/src/api/client.ts` lines 251-261, the tunnel-auth JWT is attached to the WebSocket URL as a query parameter `?t=<jwt>`:

```ts
const token = getAuthToken()
const basePath = paths.wsSession(sessionId)
const suffix = token ? `?t=${encodeURIComponent(token)}` : ""
return new WebSocket(`${protocol}//${window.location.host}${basePath}${suffix}`)
```

The `auth.ts` module documents this as intentional: "Browsers can't attach custom headers on the WebSocket upgrade." This is correct — WebSocket upgrades cannot use `Authorization` headers from the browser. However, the consequence is that the JWT appears in:

1. **Browser history** (via `window.location` if the WS URL is ever navigated to)
2. **Server access logs** — the full URL including query string is typically logged by nginx, Fastify, and most reverse proxies
3. **Tunnel/proxy logs** — any intermediary between the reviewer's browser and the MCP server

The JWT carries a `sid` claim (session ID) and is bound to the tunnel URL, but it is still a bearer credential. If a proxy logs the full request URL (which is standard behavior), the JWT is recoverable from logs and could be replayed within its TTL window.

**Impact:** Low-to-medium. The JWT has a short TTL (30 min per threat model), is bound to the tunnel URL, and requires the session to still be active in-memory. Replay attacks have a narrow window. However, this is a credential that should not appear in logs.

**Mitigations to consider:**
- Use the URL fragment (`#`) for WebSocket tokens — fragments are not sent to the server but are visible to JavaScript. This is already how the review page JWT is delivered (via `window.location.hash` in `auth.ts`). The WebSocket URL construction could derive the WS token from the page's fragment rather than re-appending it.
- Document explicitly in the threat model that WebSocket JWT exposure in server logs is an accepted risk (it is not currently called out in `threat-model-expanded.md` E1 section).

**Files:** `packages/haiku-ui/src/api/client.ts:251-261`, `packages/haiku-ui/src/api/auth.ts`
