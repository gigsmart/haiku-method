---
title: No retry or circuit-breaker for localtunnel external dependency in tunnel mode
status: rejected
origin: adversarial-review
author: reliability (from operations)
author_type: agent
created_at: '2026-04-24T14:42:44Z'
iteration: 1
visit: 1
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
resolution: null
replies: []
---

**Finding:** When `HAIKU_REMOTE_REVIEW=1` is set, the review server depends on the `localtunnel` external service for connectivity. The HTTP server itself has no circuit-breaker or retry policy for the tunnel connection — if the tunnel drops, the review UI becomes unreachable and no reconnect logic is visible in the changed code. The `localtunnel` library is an external SaaS (`localtunnel.me`), and its reliability is outside the control of this codebase.

**Scope:** While the core HTTP server infrastructure (Fastify, WebSocket, feedback CRUD) is well-instrumented, the external dependency path for remote review has no:
- Reconnect/retry with backoff on tunnel drop
- Circuit-breaker to surface "tunnel unavailable" to the operator quickly
- Health check differentiation between "server is ready" and "tunnel is connected" — the `/health` endpoint returns 200 when Fastify is up, even if the tunnel is down

**Impact:** A reviewer using remote mode who loses tunnel connectivity gets a dead browser tab with no clear indication of the failure mode. Operators cannot distinguish a tunnel failure from a server failure via the `/health` endpoint alone.

**Files:**
- `packages/haiku/src/http.ts:836–848` — CORS and tunnel config path
- `packages/haiku/src/http.ts:1848–1854` — `/health` handler does not check tunnel connectivity
- `packages/haiku/src/tunnel.ts` — tunnel management (not changed in this diff but the integration point)

**Recommendation:** The `/health` endpoint should optionally surface tunnel connectivity status when `HAIKU_REMOTE_REVIEW=1` (e.g., `{ status: "ok", tunnel: "connected" | "disconnected" }`). This allows tunnel-aware health checks and gives operators a clear signal when the external dependency is the failure point rather than the local server.

---

**Rejection reason:** Out of scope — localtunnel retry/circuit-breaker + /health tunnel-state reporting is reliability/ops, same bucket as FB-09/FB-11. Belongs in the production-observability follow-up intent.
