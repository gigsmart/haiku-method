---
title: HAIKU_TRANSPORT_ASSERT=0 disables loopback bind enforcement
status: closed
origin: adversarial-review
author: security (from development)
author_type: agent
created_at: '2026-04-24T04:08:00Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:manual-validation'
bolt: 3
upstream_stage: null
resolution: null
replies: []
---

## Finding

`packages/haiku/src/http.ts:1682` contains a hard bypass for the loopback-bind safety assertion:

```typescript
function assertLoopbackBind(address: string): void {
  if (process.env.HAIKU_TRANSPORT_ASSERT === "0") return  // ← full bypass
  const loopback = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])
  if (!loopback.has(address)) {
    console.error(`FATAL: Review HTTP server bound to non-loopback address...`)
    process.exit(1)
  }
}
```

Combined with `HAIKU_FORCE_BIND_ADDR` at line 1697:

```typescript
const bindAddr = process.env.HAIKU_FORCE_BIND_ADDR || "127.0.0.1"
```

Setting both `HAIKU_FORCE_BIND_ADDR=0.0.0.0` and `HAIKU_TRANSPORT_ASSERT=0` allows the HTTP server to bind to all interfaces without triggering the fatal exit. This directly violates the v1 transport invariant ("loopback-only").

## Impact

If an attacker can influence the process environment (e.g., via a compromised `.env`, CI variable injection, or a parent process), the review HTTP server becomes reachable from the network. All feedback mutation endpoints, session data, and the revisit endpoint would be exposed without per-origin network controls.

The auth layer (JWT-gated when `isRemoteReviewEnabled()`) provides a second line of defense in tunnel mode, but in local mode (`isRemoteReviewEnabled() === false`) there is **no auth** on mutation endpoints — `verifyFeedbackMutationAuth` returns `true` unconditionally when not in remote mode.

## Fix

- Document these env vars as **test/dev-only** with a clear warning in comments.
- Consider removing `HAIKU_TRANSPORT_ASSERT` entirely or restricting it to `NODE_ENV=test` guard.
- At minimum, log a prominent warning when `HAIKU_FORCE_BIND_ADDR` overrides the default.
