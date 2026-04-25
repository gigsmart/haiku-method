---
title: No metrics coverage for the four golden signals on new feedback routes
status: rejected
origin: adversarial-review
author: observability
author_type: agent
created_at: '2026-04-24T04:02:19Z'
iteration: 1
visit: 1
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
resolution: null
replies: []
---

The diff introduces 5 new HTTP routes and 1 WebSocket path, none of which emit metrics. There is no instrumentation for:

- **Latency**: no histogram/timer on feedback create/update/delete/reply or revisit
- **Traffic**: no counter on requests-per-route or feedback items created per stage
- **Errors**: 4xx/5xx responses on the new routes are not counted anywhere
- **Saturation**: no measurement of WebSocket connection count (`wsConnections.size`) or rate-limit rejections (the `allowWsFrame` rejection path at `packages/haiku/src/http.ts:141-143` silently drops frames with no counter)

The health endpoint at line 1529 returns a plain `"ok"` string with no metrics payload — it cannot be used to detect saturation or degraded state.

**Fix:** Add either a metrics library (prom-client, statsd) or at minimum instrument the new routes with timing logs so latency outliers are visible. The WebSocket rate-limit rejection path should log or count drops so operators can detect clients hitting the cap. The `/health` endpoint should return structured JSON including `{ wsConnections, uptime }` to support readiness probes.

---

**Rejection reason:** Out of scope for this intent. "Universal feedback model and review recovery" delivers persistent feedback files + review-UI recovery semantics; standing up a four-golden-signals metrics pipeline (latency/traffic/errors/saturation instrumentation on every route + exporter + collector) is a separate observability-platform initiative. Deferring to a follow-up intent focused on production observability for the local review server.
