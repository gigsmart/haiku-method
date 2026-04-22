---
title: Tunnel-exposed review/session/revisit endpoints have zero authentication
status: fixing
origin: adversarial-review
author: security
author_type: agent
created_at: '2026-04-21T20:23:16Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

`buildReviewUrl` (packages/haiku/src/tunnel.ts:191-209) issues an HS256-signed JWT with a per-session AES-256 key and embeds it in the URL fragment, which is the correct client-side pattern for E2E. **However, the HTTP server never verifies that JWT.** A grep of `packages/haiku/src/` for `verifyJWT|authenticate|checkAuth|requireAuth` returns zero matches. All of the following tunnel-exposed routes fall through to their handlers for any caller:

- `GET /api/session/{id}` — returns full session payload incl. knowledge files, stage artifacts, output artifacts (http.ts:1630-1633)
- `GET /api/review/current` — returns active intent slug, stage, phase, full unit list, feedback summary, per-stage iteration counts (http.ts:1712-1714, 1391-1524). No session check.
- `POST /review/{sessionId}/decide` — anyone can submit approved/changes_requested on behalf of the reviewer (http.ts:1654-1657, 286-316). Only checks that the session exists, not that the caller owns it.
- `POST /question/{sessionId}/answer`, `POST /direction/{sessionId}/select`, `POST /api/revisit/{sessionId}` — same pattern, session-existence check only (http.ts:1707, 1686, 1719 → respective handlers).
- `GET /files/{sessionId}/*`, `/mockups/...`, `/wireframe/...`, `/stage-artifacts/...` — serve file contents for any session id an attacker can enumerate. Session ids come from `randomBytes(8)` (16 hex chars — 64 bits) which is enumerable given enough time if the tunnel stays up, and leakable via tunnel access logs or the JWT-in-URL-fragment landing on the browser history of a shared device.

**Exploit chain:** an attacker who learns the tunnel URL (reviewer shares a screenshot, clipboard, DNS leak, localtunnel-operator compromise, or a malicious browser extension) can:
1. Hit `/api/review/current` with no auth → learn the active `intent` + `stage`.
2. Enumerate / brute-force the 64-bit session id, or read it from server-sent E2E responses if the attacker can get the JWT fragment.
3. Submit a rogue `decide` / `revisit` / `answer` payload and short-circuit the reviewer's decision.

**Fix:** gate every tunnel-reachable route on JWT verification — parse `Authorization: Bearer <jwt>` (have the SPA attach it from the fragment), verify the HMAC with `EPHEMERAL_SECRET` (tunnel.ts:6), and check `exp`, `sid`, and `tun`. Reject with 401 on mismatch. The `isE2EActive(sessionId)` check (http.ts:64) is not a substitute — it only predicts whether to encrypt, not whether the caller is authenticated.
