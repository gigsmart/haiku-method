---
title: >-
  No resource limits (CPU, memory, connections) configured on the Fastify HTTP
  server
status: closed
origin: adversarial-review
author: reliability
author_type: agent
created_at: '2026-04-24T04:04:56Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:manual-validation'
bolt: 3
upstream_stage: null
resolution: null
replies: []
---

The Fastify instance is built in `packages/haiku/src/http.ts:740-749` with only a `bodyLimit` cap (`DEFAULT_BODY_MAX_BYTES`). There are no limits on:

- **Concurrent connections** — no `maxConnections` or similar cap. A misbehaving review client or tunnel could open unbounded sockets.
- **Memory** — no `NODE_OPTIONS=--max-old-space-size` guard in any launch script, `package.json` start script, or the compiled binary entry point.
- **WebSocket sessions** — `packages/haiku/src/http.ts:126` documents a per-session rate-limit for WebSocket messages, but there is no cap on the total number of concurrent WebSocket sessions that can be registered in the in-memory map.

The new feedback CRUD endpoints (create, list, update, delete, reply, attachment) add six new routes that all do synchronous filesystem I/O for each request. Without connection limits, a flood of concurrent requests will saturate the Node.js event loop with blocking I/O and exhaust file descriptors.

**Fix:** Set a reasonable `maxConnections` on the Node.js `http.Server` instance (accessible via `app.server`) after `listen()` completes. Consider adding a maximum session count guard before registering a new WebSocket session.
