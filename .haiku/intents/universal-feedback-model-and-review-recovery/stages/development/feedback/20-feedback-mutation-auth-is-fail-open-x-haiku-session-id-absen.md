---
title: >-
  Feedback mutation auth is fail-open — X-Haiku-Session-Id absence is silently
  allowed
status: pending
origin: adversarial-review
author: security
author_type: agent
created_at: '2026-04-21T20:22:44Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

`verifyFeedbackMutationAuth` in `packages/haiku/src/http.ts:1352-1387` treats an absent `X-Haiku-Session-Id` header as authorized. When the header is missing it only emits a console log and returns `{ ok: true }` (lines 1356-1364):

```ts
const sessionHeader = req.headers.get("x-haiku-session-id")
if (!sessionHeader) {
    console.error(
        "[feedback-auth] mutation without X-Haiku-Session-Id (intent=%s)",
        intent,
    )
    return { ok: true }
}
```

The comment above it even acknowledges "follow-up plumbing in unit-08 can flip the default to strict." That follow-up has not happened in this stage — the soft gate is still the only guard on POST/PUT/DELETE `/api/feedback/{intent}/{stage}[/{id}]` (`http.ts:1146, 1214, 1290`).

**Attack surface:** when `isRemoteReviewEnabled()` is true, `openTunnel()` exposes every route in `handleRequest` (packages/haiku/src/http.ts:1612-1764) via `localtunnel` on a public `*.loca.lt` URL. The tunnel URL is embedded in a signed JWT fragment shared with the remote reviewer, but the server never verifies that JWT — any client that guesses / learns / leaks a tunnel URL can hit the feedback-mutation endpoints and pass the soft gate simply by omitting the header. Combined with the `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Headers: Content-Type, bypass-tunnel-reminder` CORS on tunnel mode (http.ts:334-348), this is also reachable from any website the reviewer visits while a tunnel is live (CSRF without even needing credentials, since no cookies are involved — the attacker can just `fetch()` from arbitrary origins).

**Impact:** unauthenticated remote/cross-site attackers can create arbitrary feedback items (which get git-committed into the repo via `gitCommitState`), update status to `closed`/`rejected` on any open finding, or delete non-open findings. This poisons the review state and can silently unblock a stage gate by mass-closing pending feedback.

**Fix:** make `verifyFeedbackMutationAuth` strict — require the header when `isRemoteReviewEnabled()` is true, and return 401 on absence. Also add the header to the SPA's `ApiClient` request headers (`packages/haiku-ui/src/api/client.ts:143-192` currently sends only `Content-Type` + `bypass-tunnel-reminder`, not the session id), otherwise flipping to strict will break the happy path.
