---
title: >-
  unit-01: websocket + annotation primitive schemas have unbounded strings — 64
  KB frame cap is not schema-enforced
status: fixing
origin: adversarial-review
author: correctness
author_type: agent
created_at: '2026-04-21T20:23:11Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

Unit-01 spec (unit-01-extract-haiku-api-package.md:82) mandates:

> `websocket.ts` — `WsClientMessage` (decision | direction-select | answer) + `WsServerMessage` (session-update | ack | error). **Every string field `.max()` capped; total serialized frame size ≤ 64 KB enforced by a top-level schema constraint.**

Implementation at `packages/haiku-api/src/schemas/websocket.ts`:

- `WsDecideMessageSchema.decision: z.string()` — no max
- `WsDecideMessageSchema.feedback: z.string().optional()` — no max
- `WsAnswerMessageSchema.feedback` — no max
- `WsSelectMessageSchema.archetype: z.string()` — no max
- `WsSelectMessageSchema.comments: z.string().optional()` — no max
- `WsSelectMessage.annotations.screenshot: z.string().optional()` — no max (this is the base64 PNG; uncapped means a client can DoS the process by sending a 10-MB base64 string — rejected by the 64-KB socket close, but only after the buffer fills)
- `WsAckMessageSchema.decision/feedback/error: z.string()` — no max anywhere
- `WsSessionUpdateMessageSchema.*` — no max

Furthermore, no **top-level schema-constraint** enforces "total serialized frame size ≤ 64 KB". The http.ts bridge probably enforces it at the socket layer (unit-02 mentioned a 1009 close code for >64KB frames), but the schema contract itself — which external consumers of the package read — has no `.refine()` that checks `JSON.stringify(message).length <= 65536`.

Related unbounded strings in `common.ts` that leak in through the same discriminated union:
- `PinSchema.text: z.string()` — unbounded (flows into `ReviewAnnotationsSchema.pins[]` → `WsDecideMessage.annotations.pins`).
- `InlineCommentSchema.selectedText / comment: z.string()` — both unbounded.
- `ReviewAnnotationsSchema.screenshot: z.string().optional()` — unbounded base64.

**Why this matters for correctness:**
1. Schema package is the external contract. OpenAPI consumers derive their own validators from our schemas. Drop caps and every downstream generated client accepts arbitrarily large values.
2. The 64-KB frame cap at the socket layer is a second line of defense; the first line (schema) should reject invalid shapes before they traverse the pipeline.
3. "Total serialized frame size ≤ 64 KB enforced by a top-level schema constraint" is explicit in the spec and requires a `.superRefine` or wrapping `.refine` on `WsClientMessageSchema` that checks encoded length. No such refinement exists.

**Required fix:**
- Add `.max(2000)` to every scalar string field in websocket.ts and common.ts primitives flowing into WS frames (reasonable per-field ceilings: `decision`=32, `feedback`=10_000, `error`=500, `archetype`=64, `comments`=10_000, `annotations.screenshot`=64*1024 base64, `pin.text`=1000, `inlineComment.selectedText`=2000, `inlineComment.comment`=10_000).
- Add `WsClientMessageSchema.superRefine` that computes `JSON.stringify(value).length` and adds an issue when it exceeds 65_536.
- Round-trip tests: craft a payload at cap-boundary (65_536 bytes) and at cap+1 — assert pass and fail respectively.
