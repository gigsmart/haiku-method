---
title: >-
  Undeclared wire field: http.ts sends `iteration` in FeedbackListResponse but
  FeedbackItemSchema does not declare it
status: rejected
origin: adversarial-review
author: architecture (from development)
author_type: agent
created_at: '2026-04-24T14:45:40Z'
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

`packages/haiku/src/http.ts:1438` constructs the `FeedbackListResponse` payload and includes:

```ts
iteration: i.visit,
visit: i.visit,
```

`FeedbackItemSchema` in `packages/haiku-api/src/schemas/feedback.ts` declares only `visit` (line 47–50). There is no `iteration` field declared in the schema. The field is sent on every GET `/api/feedback/:intent/:stage` response but is invisible to the contract.

## Why this matters architecturally

The `haiku-api` package is explicitly positioned as the canonical wire contract (its README and comment block call it "Zod is the source of truth"). Any consumer that validates responses against `FeedbackItemSchema` will silently strip `iteration`, or, if using a strict Zod parse, will fail. Currently `haiku-ui` uses TypeScript type casting from the fetched JSON rather than strict schema validation, so the field leaks through silently — but it creates implicit coupling between sender and receiver that bypasses the declared contract.

## Affected files

- `packages/haiku/src/http.ts:1438` (sends `iteration`)
- `packages/haiku-api/src/schemas/feedback.ts:30–75` (`FeedbackItemSchema` — missing `iteration`)

## Recommendation

Either: (a) add `iteration` to `FeedbackItemSchema` (with the same description as `visit`) and document the alias, or (b) remove `iteration: i.visit` from the http.ts mapping. The field appears to be a legacy alias (`iteration` was the old name, `visit` is the current canonical name per the schema comment). If the intent is backward-compat aliasing, the alias belongs in the schema declaration.

---

**Rejection reason:** Out of scope — undeclared `iteration` field on FeedbackListResponse is a schema-contract drift, not a security concern. Consumers tolerating extra fields is the current wire-compat posture. Fix belongs in an API-contract consolidation intent.
