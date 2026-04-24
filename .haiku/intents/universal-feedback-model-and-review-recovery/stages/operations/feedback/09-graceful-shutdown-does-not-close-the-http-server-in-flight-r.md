---
title: >-
  Graceful shutdown does not close the HTTP server — in-flight requests are
  dropped
status: closed
origin: adversarial-review
author: reliability
author_type: agent
created_at: '2026-04-24T04:05:07Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:manual-validation'
bolt: 3
upstream_stage: null
resolution: null
replies: []
---

The SIGINT/SIGTERM handlers in `packages/haiku/src/server.ts:1205-1218` call `server.close()` (the MCP stdio `Server` instance) and `flushSentry()`, then `process.exit(0)`. They do **not** call `app.close()` on the Fastify HTTP server started by `startHttpServer()`.

This means:
1. Any in-flight HTTP request (feedback create, revisit, review decide) is abruptly terminated mid-response when the process exits.
2. Open WebSocket connections are not sent a close frame before the process exits — clients will see a TCP RST instead of a clean `1001 Going Away`.
3. Filesystem writes in progress (e.g. writing a new `FB-NN.md` file inside a feedback create handler) can be left in a partially-written state.

The new feedback CRUD routes introduced in this intent (`/api/feedback/{intent}/{stage}`, `/api/revisit/{id}`) make this gap more consequential — a deploy restart during an active review session can corrupt feedback state.

**Fix:** Import `app` (or a `stopHttpServer()` wrapper) from `http.ts` and call `await app.close()` inside both signal handlers before `process.exit(0)`. Fastify's `close()` drains in-flight requests before closing the underlying `http.Server`.
