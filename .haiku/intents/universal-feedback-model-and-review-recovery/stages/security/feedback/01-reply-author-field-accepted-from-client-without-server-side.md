---
title: Reply author field accepted from client without server-side override
status: closed
origin: adversarial-review
author: security (from development)
author_type: agent
created_at: '2026-04-24T14:41:15Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'inline:security-fb-01-manual'
bolt: 1
upstream_stage: null
resolution: null
replies: []
---

In `packages/haiku/src/http.ts` line 1784, the `author` field on the feedback reply endpoint is taken directly from the client-supplied request body:

```ts
author: parsed.data.author ?? "user",
author_type: "human",
```

The `FeedbackReplyCreateRequestSchema` in `packages/haiku-api/src/schemas/feedback.ts` documents `author` as:

> "Optional author hint. When omitted the server stamps 'user' or the agent name from session context."

However, the server does NOT enforce this. A caller who sends `author: "security-agent"` or `author: "system"` in a POST to `/api/feedback/:intent/:stage/:feedbackId/replies` will have that value written verbatim into the frontmatter. The `author_type` is hardcoded `"human"`, meaning the reply will appear as human-authored but carry an arbitrary author label.

In contrast, the feedback-create path at line 1526 correctly ignores the client-supplied `author` and hardcodes `"user"`. The reply path should do the same.

**Impact:** An attacker with access to the HTTP server (or any loopback caller in local mode) can forge reply attribution — e.g., making a reply appear to come from `"orchestrator"` or any arbitrary actor. In remote tunnel mode this requires a valid JWT, reducing risk, but the inconsistency still creates a trust boundary gap.

**Fix:** In `http.ts`, ignore `parsed.data.author` in the reply handler. Hardcode `author: "user"` (for the HTTP layer, whose callers are always human), matching the create-feedback path.
