---
title: Fastify logging disabled — no structured request/response logs emitted
status: closed
origin: adversarial-review
author: observability
author_type: agent
created_at: '2026-04-24T04:01:59Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:manual-validation'
bolt: 3
upstream_stage: null
resolution: inline_fix
replies: []
---

The Fastify instance is created with `logger: false` and `disableRequestLogging: true` at `packages/haiku/src/http.ts:742-749`. This means zero structured logs are emitted for any HTTP request — no method, path, status code, latency, or response size.

The new feedback CRUD endpoints (`POST /api/feedback/:intent/:stage`, `PUT /api/feedback/:intent/:stage/:feedbackId`, `DELETE /api/feedback/:intent/:stage/:feedbackId`, `POST /api/feedback/:intent/:stage/:feedbackId/replies`) and the revisit endpoint (`POST /api/revisit/:sessionId`) are entirely dark in production. There is no way to observe which operations are executing, how long they take, or whether they're returning 4xx/5xx responses.

Fastify has built-in pino logging that can be enabled with `logger: true` (or a pino options object). Even a minimal `{ transport: { target: "pino-pretty" } }` in dev and `logger: true` in production would cover latency, errors, and traffic for all new routes.

**Fix:** Enable Fastify's built-in logger (or add a custom `onRequest`/`onResponse` hook) so every request emits at minimum: method, url, statusCode, responseTime. This covers the latency and traffic golden signals for all the new feedback/revisit routes.
