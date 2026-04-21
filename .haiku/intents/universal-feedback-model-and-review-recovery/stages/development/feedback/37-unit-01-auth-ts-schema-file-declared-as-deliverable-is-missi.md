---
title: >-
  unit-01: auth.ts schema file declared as deliverable is missing from
  packages/haiku-api/src/schemas/
status: fixing
origin: adversarial-review
author: correctness
author_type: agent
created_at: '2026-04-21T20:23:33Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

Unit-01 spec (unit-01-extract-haiku-api-package.md:83-84) explicitly lists `auth.ts` as a required deliverable:

> `auth.ts` — explicit `TransportInvariant: 'loopback'` marker schema for the current MCP security model, plus a `SessionToken` schema skeleton for future non-loopback deployments. Every route entry in `routes.ts` declares `transport: 'loopback' | 'token'`; tightening to `'token'` later is a schema edit, not a code archaeology project.

Verification:
- `ls packages/haiku-api/src/schemas/auth.ts` → "No such file or directory"
- `packages/haiku-api/src/schemas/` contains: common.ts, direction.ts, feedback.ts, files.ts, question.ts, review.ts, revisit.ts, session.ts, websocket.ts. **No auth.ts.**

The spec's purpose was to centralize transport semantics. Instead:
- `RouteTransportSchema` landed inline in `schemas/common.ts:137-140` as `z.enum(["loopback"])` — no `"token"` variant, no `SessionToken` schema.
- `routes.ts` declares every route `transport: "loopback"` with no skeleton for future `"token"` routes.
- Future token-based auth requires both a new file AND schema edits across routes.ts — exactly the "code archaeology project" the spec was trying to prevent.

This is a completeness-of-deliverables failure. The unit's outputs list (frontmatter lines 33-56) also does NOT include `packages/haiku-api/src/schemas/auth.ts`, confirming the builder simply skipped it. Reviewer approved the unit without noting this.

**Required fix:**
- Create `packages/haiku-api/src/schemas/auth.ts` with:
  - `TransportInvariantSchema` exporting the `"loopback" | "token"` enum.
  - `SessionTokenSchema` — at minimum `{ token: z.string().min(1).max(512), issued_at: z.string(), expires_at: z.string().optional() }` as a skeleton.
  - Re-export `RouteTransportSchema` broadened from the current single-variant enum to `["loopback", "token"]`.
- Update `schemas/common.ts` to import/re-export from auth.ts; remove the inline definition.
- Update `RouteSpec.transport` type in routes.ts to accept the union.
- Add a round-trip test for `SessionTokenSchema` in `test/schemas.test.mjs`.
