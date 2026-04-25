---
title: Health check returns liveness-only "ok" — no readiness verification
status: closed
origin: adversarial-review
author: reliability
author_type: agent
created_at: '2026-04-24T04:04:35Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:manual-validation'
bolt: 3
upstream_stage: null
resolution: null
replies: []
---

The `/health` endpoint at `packages/haiku/src/http.ts:1529-1531` returns the bare string `"ok"` with no check of actual server readiness. It does not verify that the WebSocket session registry is populated, that the Fastify instance has accepted its first connection, that the MCP stdio transport is live, or any other application-layer invariant.

A process can return HTTP 200 on `/health` immediately after `listen()` completes while the rest of the startup path (e.g. `startUpdateChecker`, loading studio configs) is still running. Any tunnel or load balancer probing this endpoint will believe the instance is ready to serve traffic before it actually is.

**Fix:** Add a readiness flag (e.g. `let ready = false`) that is set to `true` only after the full `buildApp()` and post-listen initialization complete. Return HTTP 503 until the flag is set. This is the standard readiness-vs-liveness split expected by the tunnel integration referenced in the route summary ("Plain-text keepalive check used by the tunnel").
