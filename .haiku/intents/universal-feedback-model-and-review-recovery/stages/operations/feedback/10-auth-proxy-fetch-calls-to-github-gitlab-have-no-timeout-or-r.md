---
title: >-
  Auth proxy fetch calls to GitHub/GitLab have no timeout or retry — hangs on
  slow upstream
status: closed
origin: adversarial-review
author: reliability
author_type: agent
created_at: '2026-04-24T04:05:19Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:manual-validation'
bolt: 3
upstream_stage: null
resolution: question
replies: []
---

Both `handleGitHub` and `handleGitLab` in `deploy/auth-proxy/src/index.ts` call the respective OAuth token endpoints using bare `fetch()` with no timeout signal and no retry logic:

```ts
// deploy/auth-proxy/src/index.ts:80-94 (GitHub)
const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { ... },
    body: JSON.stringify({ ... }),
})

// deploy/auth-proxy/src/index.ts:135-148 (GitLab)
const tokenRes = await fetch(`https://${gitlabHost}/oauth/token`, { ... })
```

There is no `signal: AbortSignal.timeout(N)`, no retry with backoff, and no circuit-breaker. If GitHub or GitLab is slow or unresponsive, the Cloud Function invocation hangs until GCP's default function timeout (60 s) is reached. This:

1. Burns Cloud Function concurrency slots for the full timeout duration.
2. Returns a confusing 500 to the client rather than a bounded timeout error.
3. Has no defined degradation behavior (e.g. returning a `503 upstream_timeout` that the client can distinguish from a logic error).

**Fix:** Add `signal: AbortSignal.timeout(10_000)` to each `fetch` call. Catch `AbortError` separately and return a `504` with `error: "upstream_timeout"` rather than leaking the raw error message.
