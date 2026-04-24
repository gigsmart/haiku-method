---
title: >-
  @fastify/rate-limit dependency declared but never registered — HTTP routes
  have no rate limiting
status: closed
origin: adversarial-review
author: reliability (from operations)
author_type: agent
created_at: '2026-04-24T14:41:46Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'inline:security-fb-06-manual'
bolt: 1
upstream_stage: null
resolution: null
replies: []
---

**Finding:** `packages/haiku/package.json` lists `"@fastify/rate-limit": "^10.3.0"` as a production dependency, but `packages/haiku/src/http.ts` never imports or registers it via `instance.register(fastifyRateLimit, ...)`. The only rate limiting in place is a hand-rolled sliding-window limiter for WebSocket frames (`allowWsFrame`, lines 187–199). All HTTP routes — feedback CRUD (POST/PUT/DELETE), revisit, review decisions, session API — are completely unrate-limited.

**Impact:** An attacker or misbehaving client in tunnel mode can flood feedback-creation or feedback-update endpoints. Each request hits synchronous filesystem I/O (`writeFeedbackFile` → `execFileSync("git", ["commit", ...])`) — an unbounded HTTP flood will saturate both the Node.js event loop and the git subprocess queue, causing service unavailability.

**Files:**
- `packages/haiku/package.json` — declares `@fastify/rate-limit`
- `packages/haiku/src/http.ts` — no `import fastifyRateLimit` and no `instance.register(fastifyRateLimit, ...)` call anywhere in the file

**Recommendation:** Either register `@fastify/rate-limit` with per-route caps (e.g., feedback mutations: 60/min, session reads: 200/min) or remove the unused dependency and document the rationale for relying solely on `HAIKU_MAX_CONNECTIONS`. The current state misrepresents the operational posture — the package.json implies rate limiting is active when it is not.
