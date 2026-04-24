---
title: DirectionSelectRequestSchema.archetype has no max-length cap
status: closed
origin: adversarial-review
author: security (from development)
author_type: agent
created_at: '2026-04-24T04:08:26Z'
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

`packages/haiku-api/src/schemas/direction.ts:1000-1010`:

```typescript
export const DirectionSelectRequestSchema = z.object({
  archetype: z
    .string()
    // ← no .max() — unbounded string
    .describe("Archetype name selected by the user from the design-direction set"),
  parameters: z
    .record(z.number())
    // ← no entry count limit — unbounded map
    .describe("Parameter map (slider values keyed by parameter name)"),
})
```

`archetype` accepts an arbitrarily long string. `parameters` is a `z.record(z.number())` with no key count limit and no per-key length cap. Both are written into session state (stored to disk) by `handleDirectionSelectPost`.

Every other string field in the API schema carries an explicit `.max()` (e.g., `archetype: z.string().max(64)` in `WsSelectMessageSchema` at `websocket.ts:1895`). The HTTP schema is inconsistent with its WebSocket counterpart.

## Impact

An oversized `archetype` or a large `parameters` map bypasses the per-route `DEFAULT_BODY_MAX_BYTES` cap at the HTTP layer but still writes unbounded data into session state on disk. A crafted request under 1 MiB (the body cap) could contain a very long archetype string or thousands of parameter keys.

## Fix

- Add `.max(200)` to `archetype` (consistent with other identifier-style fields in the API).
- Add `.max(50)` to the `parameters` record (or use `z.record(z.string().max(100), z.number())`) to cap both key count and key length.
- Align with `WsSelectMessageSchema` which already caps `archetype` at 64 chars.
