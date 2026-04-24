---
title: >-
  WebSocket JWT in query string not characterized as an information disclosure
  surface
status: closed
origin: adversarial-review
author: threat-coverage
author_type: agent
created_at: '2026-04-24T14:42:22Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:FB-14:bolt-1'
bolt: 1
upstream_stage: null
resolution: null
replies: []
integrator_attempts: 1
---

The client-side WebSocket upgrade in `packages/haiku-ui/src/api/client.ts` (the `openWebSocket` method) appends the tunnel JWT as `?t=<jwt>` in the URL:

```
const suffix = token ? `?t=${encodeURIComponent(token)}` : ""
return new WebSocket(`${protocol}//${window.location.host}${basePath}${suffix}`)
```

The code comment explains: *"Browsers can't attach custom headers on the WebSocket upgrade, so the tunnel-auth JWT rides in the query string."*

The expanded threat model (S2, E1) analyzes JWT security in the context of HTTP bearer headers but does not characterize the query-string JWT exposure:

1. **Server access logs.** Query string parameters appear in HTTP server access logs by default. If Fastify logging is ever enabled (it is currently `logger: false`), or if a reverse proxy / tunnel provider logs HTTP requests, the full JWT is logged in plaintext. The threat model does not identify this as an information disclosure vector.

2. **Browser history / referrer leakage.** WebSocket URLs with `?t=<jwt>` are recorded in browser history. If a user shares their browser history, or if a browser extension reads `window.location`, the JWT is exposed. The threat model's I2 finding covers session UUID replay but does not cover JWT-in-URL exposure.

3. **No STRIDE entry for this pattern.** The HTTP bearer token path (Authorization header) is the secure channel; the `?t=` query string is a known weaker channel that requires documenting as an accepted risk or mitigating (e.g. short JWT TTL makes replay windows small).

**Files:** `packages/haiku-ui/src/api/client.ts:openWebSocket`, `stages/security/artifacts/threat-model-expanded.md §1/I`, §1/S2.

**Mitigation required:** Add a STRIDE/I entry for the WebSocket JWT query-string exposure. Document the JWT TTL as the primary mitigation and why the residual risk is accepted.
