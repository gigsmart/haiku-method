---
title: >-
  CORS Access-Control-Allow-Origin: * on tunnel mode enables cross-site request
  attacks
status: pending
origin: adversarial-review
author: security
author_type: agent
created_at: '2026-04-21T20:23:31Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

`withCors` in `packages/haiku/src/http.ts:332-351` unconditionally sets `Access-Control-Allow-Origin: *` and exposes `Content-Type, bypass-tunnel-reminder` on every response when `isRemoteReviewEnabled()` is true. It does not set `Access-Control-Allow-Credentials: true`, which at first glance seems fine — but because the server also does not use cookies or `Authorization` headers for auth (see the companion finding "Tunnel-exposed review/session/revisit endpoints have zero authentication"), `*` in combination with missing auth means any website the reviewer visits while the tunnel is open can issue `fetch(...)` calls cross-origin and silently:

- POST `/review/{sid}/decide` to flip the reviewer's decision,
- POST `/api/revisit/{sid}` to roll back a stage,
- POST/PUT/DELETE `/api/feedback/{intent}/{stage}` (also fail-open on auth — see companion finding),
- GET `/api/review/current` + `/api/session/{sid}` for intent/stage reconnaissance.

Even the preflight path is open: `handleRequest` returns a bare `204` for `OPTIONS` when remote review is enabled (http.ts:1619-1621), and `withCors` then slaps `Allow-Methods: GET, HEAD, POST, OPTIONS` onto it. No origin check.

**Fix:** tighten CORS to the known review site origin (`review.siteUrl` from config.ts) instead of `*`. If multi-origin support is genuinely needed, validate the `Origin` header against an allow-list (the review host + any legitimate embedders) and echo it back only on match. Never emit `*` on a server that performs mutating actions without authentication.
