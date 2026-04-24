---
title: >-
  FEEDBACK_CREATE_MAX_BYTES (8 MiB) creates large disk-write attack surface with
  no per-IP or per-session rate cap
status: closed
origin: adversarial-review
author: mitigation-effectiveness
author_type: agent
created_at: '2026-04-24T14:42:42Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:FB-16:bolt-1'
bolt: 1
upstream_stage: null
resolution: null
replies: []
integrator_attempts: 1
---

**Threat:** The feedback creation endpoint (`POST /api/feedback/:intent/:stage`) accepts bodies up to 8 MiB (`FEEDBACK_CREATE_MAX_BYTES = 8_388_608`, haiku-api/src/schemas/common.ts:221). The 8 MiB limit accommodates base64-encoded screenshots. However, there is no per-IP rate limit, no per-session creation cap, and no limit on the total number of feedback files per stage. Combined, these three gaps mean a single authenticated session can:
1. POST 8 MiB × N requests as fast as Node.js can accept them, writing files to disk and creating git commits for each.
2. Create unboundedly many feedback files — `nextFeedbackNumber` is O(n) in the directory listing, so each creation gets incrementally slower as N grows.
3. Fill disk: 8 MiB × 1000 = ~8 GB in a single automated session.

**What the threat model says:** The DoS section (THREAT-MODEL.md, Section 1 D) claims "feedback creation is a local MCP tool — the blast radius is the developer's own machine. There is no remote unauthenticated creation path." However, this analysis only covers the MCP tool path. The HTTP endpoint is a separate attack surface. The threat model acknowledges that "HTTP requires an active review session," but in tunnel mode (`HAIKU_REMOTE_REVIEW=1`), the session JWT is embedded in the URL fragment and passed via URL — anyone who intercepts the review link (e.g., via browser history, clipboard, or network logging) can replay it for the 1-hour TTL.

**Mitigation gaps vs. root cause:**
- **Connection cap (MAX_CONNECTIONS=256)** caps simultaneous sockets but not request rate. A single persistent connection can fire hundreds of sequential 8 MiB POSTs within the 1-hour JWT window.
- **JWT TTL (1 hour, tunnel.ts:308)** is the only temporal bound, and it's longer than most DoS windows need to be.
- **git commit per file** amplifies the DoS: each feedback write triggers `gitCommitState()`, which spawns a child process. Under rapid creation, this creates a git commit storm that blocks the Node event loop.
- The expanded threat model (threat-model-expanded.md, D2) acknowledges "D2: large reasons array creates filesystem load" but accepts it as "very low / local." The HTTP-path flood is not characterized.

**Defense-in-depth gap:** The threat model claims multiple layers of DoS mitigation, but the only active layer for the HTTP feedback creation path is the connection cap. Rate limiting per session/IP on the feedback creation endpoint would be the appropriate second layer.

**File references:**
- `packages/haiku-api/src/schemas/common.ts:221` — `FEEDBACK_CREATE_MAX_BYTES = 8_388_608`
- `packages/haiku/src/http.ts:1496` — `{ bodyLimit: FEEDBACK_CREATE_MAX_BYTES }` on POST /api/feedback
- `packages/haiku/src/http.ts:226-234` — MAX_CONNECTIONS cap only
- `packages/haiku/src/state-tools.ts:3082-3094` — `nextFeedbackNumber` O(n) directory scan, no count cap
- `packages/haiku/src/tunnel.ts:308` — `exp: now + 3600` (1-hour TTL)
