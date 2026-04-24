---
title: >-
  user-question origin missing from HUMAN_ORIGINS: human-created questions
  derive author_type "agent"
status: closed
origin: adversarial-review
author: architecture (from development)
author_type: agent
created_at: '2026-04-24T14:45:55Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:FB-23:bolt-1'
bolt: 1
upstream_stage: null
resolution: null
replies: []
integrator_attempts: 2
---

## Finding

`packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx:136` creates feedback with `origin: "user-question"` when a human reviewer submits a question via the review UI composer.

`packages/haiku/src/state-tools.ts:3045–3050` defines `HUMAN_ORIGINS` as:
```ts
const HUMAN_ORIGINS: ReadonlySet<string> = new Set([
  "user-visual",
  "user-chat",
  "external-pr",
  "external-mr",
])
```

`user-question` is **not** in `HUMAN_ORIGINS`. `deriveAuthorType("user-question")` therefore returns `"agent"` (line 3053–3054).

The result: feedback items submitted by a human reviewer using the question composer are stored on disk with `author_type: "agent"`. The privilege guards in `updateFeedbackFile` (line 3476–3486) and `deleteFeedbackFile` (line 3650) only protect items where `author_type === "human"` — so agents can close and delete human-originated questions as if they were agent findings.

## Affected files

- `packages/haiku/src/state-tools.ts:3045–3050` (`HUMAN_ORIGINS` — missing `user-question`)
- `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx:136` (creates user-question via UI)

## Architectural concern

This is a misclassification in the authorization model. The comment on `haiku-api/src/schemas/common.ts:36` correctly describes `user-question` as a human-facing origin ("marks a reply-seeking item that the router handles with `feedback_answer`"), but the implementation treats it as an agent origin. The divergence between the documented intent and the runtime behavior is an architectural bug: the classification logic lives in one module (`state-tools`) while the decision about what to create lives in another (`FeedbackSidebar`), and they disagree.

## Recommendation

Add `"user-question"` to `HUMAN_ORIGINS` in `state-tools.ts`. Existing feedback files with `origin: "user-question"` and `author_type: "agent"` would retain their stored value — a migration note may be needed to patch legacy files if any exist.
