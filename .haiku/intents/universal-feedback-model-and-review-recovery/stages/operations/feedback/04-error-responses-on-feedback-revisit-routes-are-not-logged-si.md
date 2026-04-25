---
title: Error responses on feedback/revisit routes are not logged — silent 4xx/5xx
status: closed
origin: adversarial-review
author: observability
author_type: agent
created_at: '2026-04-24T04:02:29Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:manual-validation'
bolt: 3
upstream_stage: null
resolution: null
replies: []
---

The feedback CRUD handlers and revisit handler produce 400, 404, 409 responses in numerous code paths, but none of those error paths emit any log output. Examples:

- `packages/haiku/src/http.ts:1296-1298`: 404 when stage not found — silent
- `packages/haiku/src/http.ts:1373-1382`: 404/400 on update failure — silent
- `packages/haiku/src/http.ts:1423-1432`: 404 on delete failure — silent
- `packages/haiku/src/http.ts:1109`: 409 on revisit failure — logs the tool result text only if it falls into the `else` branch; the actual error detail is not structured

The only server-level error logging is `console.error` at lines 1685 and 1712 (loopback bind assertion and server startup). There is no Fastify `setErrorHandler` hook that would catch unhandled exceptions and log them with request context.

**Fix:** Add a Fastify `setErrorHandler` that logs `{ method, url, statusCode, error }` for all 4xx/5xx responses. This is the minimum needed to detect error spikes on the new feedback routes. The revisit 409 path at line 1109 should also log the detail text so it's visible without requiring client-side reproduction.
