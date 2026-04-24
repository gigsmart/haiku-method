---
title: >-
  Memory limit (NODE_OPTIONS) is a code comment recommendation, not an enforced
  configuration
status: rejected
origin: adversarial-review
author: reliability (from operations)
author_type: agent
created_at: '2026-04-24T14:42:14Z'
iteration: 1
visit: 1
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
resolution: null
replies: []
---

**Finding:** `packages/haiku/src/http.ts:222–224` documents that memory headroom should be set via `NODE_OPTIONS=--max-old-space-size=<MB>` at "the process manager level," but this is only a comment — no process management configuration (systemd unit, launchd plist, Dockerfile ENV, or `.npmrc` `node-options`) sets this value anywhere in the repository. The Fastify rewrite adds new in-process state (WebSocket registry `wsConnections`, rate-limit state `wsRateState`, per-request timing BigInt fields) that was not present in the prior hand-rolled implementation. Without a defined memory cap, the Node.js GC will use the default V8 heap size (~1.5 GB on 64-bit), and no alerting threshold exists.

**Impact:** The feedback model's synchronous git commit path (`execFileSync`) runs inside the event loop. Under high load, accumulation of in-flight Promises, WebSocket state, and git process forks can exhaust memory silently — no operator metric or alert surfaces memory pressure before the process crashes. `HAIKU_MAX_CONNECTIONS` caps TCP sockets but does not bound per-connection memory allocation.

**Files:**
- `packages/haiku/src/http.ts:222–224` — recommendation only, not enforced
- No process manager config exists in the repo for the MCP server process

**Recommendation:** Either enforce `NODE_OPTIONS=--max-old-space-size=512` (or similar) in the npm start script / MCP server launch config, or document the rationale for leaving it to operator discretion with an explicit default value callout. The current state means different operators will get different memory behavior silently.

---

**Rejection reason:** Out of scope — NODE_OPTIONS memory-limit enforcement is ops/deployment config, belongs in the production-observability follow-up intent (grouped with FB-03/FB-05/FB-07 from operations). Security stage doesn't own process-launch configuration.
