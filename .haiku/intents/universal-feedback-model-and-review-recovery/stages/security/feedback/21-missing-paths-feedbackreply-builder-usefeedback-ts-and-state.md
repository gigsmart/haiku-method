---
title: >-
  Missing paths.feedbackReply builder; useFeedback.ts and state-tools.ts
  hardcode route URLs
status: rejected
origin: adversarial-review
author: architecture (from development)
author_type: agent
created_at: '2026-04-24T14:45:28Z'
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

`packages/haiku-api/src/routes.ts` declares the replies endpoint (`POST /api/feedback/{intent}/{stage}/{feedbackId}/replies`, line 350) but the `paths` builder object (lines 82–106) has **no** `feedbackReply()` function for it. The attachment endpoint is also in the route table (line 339) but absent from `paths`.

As a result, callers construct these URLs by hand:

- `packages/haiku-ui/src/hooks/useFeedback.ts:198` — hardcodes the replies URL as a template string
- `packages/haiku/src/state-tools.ts:3227` — hardcodes the attachment URL `/api/feedback-attachment/...` inline inside `writeFeedbackFile`

## Affected files

- `packages/haiku-api/src/routes.ts:82–106` (paths builder — missing feedbackReply, feedbackAttachment)
- `packages/haiku-ui/src/hooks/useFeedback.ts:198` (hardcoded replies URL)
- `packages/haiku/src/state-tools.ts:3227` (hardcoded attachment URL)

## Architectural concern

The entire value of the `paths` builder is that every caller has one place to update when a route changes. Two known consumers already bypass it. This is structural drift: the route table says "one source of truth for paths" but the implementation has three separate constructions for the same endpoint family.

Additionally, `useFeedback.ts` uses two distinct fetch patterns within the same hook — the replies fetch at line 198 directly calls `fetch()` with a hardcoded string, while other operations go through `apiClient.feedback.*`. This mixing of abstraction layers makes it harder to trace which calls are auth-gated (the client adds auth headers) and which are not.

## Recommendation

Add `feedbackReply(intent, stage, id)` and `feedbackAttachment(intent, stage, filename)` to the `paths` object in `routes.ts`. Update `useFeedback.ts:198` and `state-tools.ts:3227` to use these builders. Move the replies call in `useFeedback.ts` to `apiClient.feedback.reply()` to keep the abstraction boundary consistent.

---

**Rejection reason:** Out of scope — missing paths.feedbackReply() builder is API-hygiene/consistency debt, not a security gap. The raw fetch() call in useFeedback.ts works; centralizing is a good follow-up but doesn't affect attack surface.
