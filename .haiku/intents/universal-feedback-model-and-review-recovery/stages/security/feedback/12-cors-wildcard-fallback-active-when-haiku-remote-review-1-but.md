---
title: >-
  CORS wildcard fallback active when HAIKU_REMOTE_REVIEW=1 but no allowedOrigins
  configured
status: closed
origin: adversarial-review
author: security (from development)
author_type: agent
created_at: '2026-04-24T14:42:16Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'inline:security-fb-12-manual'
bolt: 1
upstream_stage: null
resolution: null
replies: []
integrator_attempts: 2
---

In `packages/haiku/src/http.ts` at `resolveAllowedCorsOrigin` (line 844-849):

```ts
function resolveAllowedCorsOrigin(origin: string | undefined): string | null {
  if (!origin) return null
  const configured = review.allowedOrigins.filter((o) => o && o !== "*")
  const allowList = configured.length > 0 ? configured : [review.siteUrl]
  return allowList.includes(origin) ? origin : null
}
```

When `HAIKU_REMOTE_REVIEW=1` is set but `review.allowedOrigins` is empty or contains only `"*"` and `review.siteUrl` is also empty/unset, the `allowList` becomes `[""]` or `[undefined]`. In that case, no origin will match (`allowList.includes(origin)` returns false for any real origin value), meaning CORS is effectively blocked for all origins — but this also means the review UI itself cannot POST feedback.

The threat model (`assessments.md`) acknowledges "CORS wildcard leaks review content to any origin" is mitigated by FB-36 origin-checked CORS, but the fallback behavior when `siteUrl` is empty is not documented and may produce unexpected results (either blocking all cross-origin requests silently, or if the `siteUrl` is `"*"` from misconfiguration, allowing all origins).

**The specific risk:** If an operator sets `HAIKU_REMOTE_REVIEW=1` without configuring `HAIKU_REVIEW_SITE_URL`, and the fallback resolves to a falsy/empty `siteUrl`, the CORS gate behavior is undefined and there is no operator-visible warning at startup about the potential misconfiguration.

**Files:** `packages/haiku/src/http.ts:844-849`

**Fix:** Add a startup warning (not just a CORS behavior) when `HAIKU_REMOTE_REVIEW=1` and `allowedOrigins` resolves to an empty or wildcard-only list. This makes the security misconfiguration visible to operators before it causes either broken review UIs or accidental open CORS.
