---
title: HAIKU_WS_RATE_LIMIT=0 silently disables WebSocket rate limiting
status: closed
origin: adversarial-review
author: security (from development)
author_type: agent
created_at: '2026-04-24T04:08:13Z'
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

`packages/haiku/src/http.ts:128-135`:

```typescript
const WS_RATE_LIMIT_PER_SEC = Number.parseInt(
  process.env.HAIKU_WS_RATE_LIMIT ?? "20",
  10,
)

function allowWsFrame(socket: WsWebSocket): boolean {
  if (!Number.isFinite(WS_RATE_LIMIT_PER_SEC) || WS_RATE_LIMIT_PER_SEC <= 0) {
    return true  // ← rate limiting disabled
  }
  ...
}
```

Setting `HAIKU_WS_RATE_LIMIT=0` (or any non-positive value) disables the sliding-window rate limiter entirely. The guard `<= 0` means zero is treated as "no limit."

## Impact

With rate limiting disabled a single WebSocket connection can flood the server with decide/answer/select messages at an unbounded rate. Because WebSocket handlers call into orchestrator state (session writes, feedback file creation), this creates a denial-of-service vector on the local process and on the git working tree (unbounded `gitCommitStateBackgroundPush` spawns).

This is lower severity because the server binds loopback by default and the WS endpoint requires a valid `sessionId`, but the interaction with `HAIKU_FORCE_BIND_ADDR` + `HAIKU_TRANSPORT_ASSERT=0` (FB-12) can elevate it.

## Fix

- Treat `HAIKU_WS_RATE_LIMIT=0` as "use default (20)" rather than "disable."
- Document the env var as a test override, not a production tunable.
- Consider a hard minimum floor (e.g., `Math.max(parsedValue, 1)`) so the rate limiter can never be set to zero through environment config.
