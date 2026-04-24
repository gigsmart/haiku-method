---
title: >-
  Duplicate type definitions: FeedbackOrigin/Status/Item in state-tools and
  haiku-api without shared source
status: rejected
origin: adversarial-review
author: architecture (from development)
author_type: agent
created_at: '2026-04-24T14:45:13Z'
iteration: 1
visit: 1
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
resolution: null
replies: []
---

## Finding

`FEEDBACK_ORIGINS`, `FEEDBACK_STATUSES`, `FeedbackReply`, and `FeedbackItem` are defined in two separate modules with no shared source of truth:

- `packages/haiku/src/state-tools.ts` (lines 2952–2963, 2981–2988, 3104–3149) — internal runtime types
- `packages/haiku-api/src/schemas/common.ts` and `schemas/feedback.ts` — wire/contract types

`state-tools.ts` does **not** import from `haiku-api`. The two sets of definitions are kept in sync entirely by manual discipline. Any future addition to the origin or status enum (e.g. a new `user-annotation` origin) requires changes in both places and has no compile-time enforcement.

## Affected files

- `packages/haiku/src/state-tools.ts:2952–2963` (`FEEDBACK_ORIGINS`)
- `packages/haiku/src/state-tools.ts:2981–2988` (`FEEDBACK_STATUSES`)
- `packages/haiku/src/state-tools.ts:3104–3149` (`FeedbackReply`, `FeedbackItem` interfaces)
- `packages/haiku-api/src/schemas/common.ts:24–61` (`FeedbackOriginSchema`, `FeedbackStatusSchema`)
- `packages/haiku-api/src/schemas/feedback.ts:30–76` (`FeedbackItemSchema`)

## Architectural concern

This violates the single-source-of-truth principle for domain enumerations. The correct dependency direction is for the internal runtime to derive its validation from the canonical contract package (`haiku-api`), not maintain parallel copies. The `allowedResolutions` set in `writeFeedbackFile` (state-tools.ts:3230–3234) and `updateFeedbackFile` (state-tools.ts:3448–3453) is also hand-coded inline rather than derived from `FeedbackResolutionSchema`.

## Recommendation

`state-tools.ts` should import the enum values from `haiku-api` (or a shared sub-module), deriving its runtime constants from the Zod schema's `.options` property. This is the direction the architecture already points — `http.ts` imports `FeedbackCreateRequestSchema` and `FeedbackUpdateRequestSchema` from `haiku-api` — but it hasn't been applied to the core enum definitions yet.

---

**Rejection reason:** Out of scope — duplicate type defs between state-tools.ts and haiku-api is architecture debt, not a security issue. Consolidation belongs in a dedicated architecture-refactor intent where the type migration can be done carefully with compatibility guarantees.
