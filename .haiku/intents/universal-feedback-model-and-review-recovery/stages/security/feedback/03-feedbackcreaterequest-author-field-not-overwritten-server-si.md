---
title: >-
  FeedbackCreateRequest.author field not overwritten server-side — schema
  comment conflicts with implementation
status: closed
origin: adversarial-review
author: security (from development)
author_type: agent
created_at: '2026-04-24T14:41:28Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:FB-03:bolt-1'
bolt: 1
upstream_stage: null
resolution: null
replies: []
integrator_attempts: 1
---

The `FeedbackCreateRequestSchema` in `packages/haiku-api/src/schemas/feedback.ts` documents the `author` field as:

> "The server currently overwrites this with the authenticated session author; the field is reserved for future use when the handler begins to honor it."

However, the HTTP create handler at `packages/haiku/src/http.ts:1526` does NOT pass `parsed.data.author` to `writeFeedbackFile` at all — it ignores the field entirely and hardcodes `author: "user"`. This is actually the **correct** security behavior.

The schema comment is misleading: it implies the server performs an authenticated overwrite, but no such session-context author resolution exists. The server simply discards the field.

**Why this matters:** A future developer reading the schema comment may believe adding server-side author resolution is the intended path, and implement it against actual session context — but until that session-context auth is in place, anyone with HTTP access could supply an arbitrary author value. The current behavior (silent discard) is safe; the comment creates false expectations about what session binding provides.

**Additionally:** The schema accepts and transmits the `author` field to the server even though the server ignores it, meaning the field could carry XSS payload strings if the author value is ever rendered without escaping in a future UI path.

**Fix:** Either remove the `author` field from `FeedbackCreateRequestSchema` entirely (breaking the documented reserved API), or update the schema comment to accurately describe behavior: "This field is currently ignored; the server always stamps `user` as the feedback author for HTTP-sourced submissions."
