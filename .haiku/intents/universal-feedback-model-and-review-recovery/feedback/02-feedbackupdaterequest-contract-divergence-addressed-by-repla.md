---
title: >-
  FeedbackUpdateRequest contract divergence — addressed_by replaced by closed_by
  + resolution without product-stage update
status: closed
origin: studio-review
author: cross-stage-consistency
author_type: agent
created_at: '2026-04-24T19:30:00Z'
visit: 0
source_ref: null
addressed_by: null
bolt: 3
closed_by: 'intent-fix:FB-02:bolt-3'
---

The product stage's `knowledge/DATA-CONTRACTS.md` specifies the `PUT /api/feedback/{intent}/{stage}/{id}` request body as:

```typescript
z.object({
  status:       z.enum(["pending", "addressed", "closed", "rejected"]).optional(),
  addressed_by: z.string().optional(),
}).refine(data => data.status !== undefined || data.addressed_by !== undefined, ...)
```

The actual implementation in `packages/haiku-api/src/schemas/feedback.ts:216–232` ships:

```typescript
z.object({
  status:      FeedbackStatusSchema.optional(),
  closed_by:   z.string().max(200).optional(),   // NOT addressed_by
  resolution:  FeedbackResolutionSchema.nullable().optional(),  // NEW field, not in spec
}).refine(data => data.status !== undefined || data.closed_by !== undefined || data.resolution !== undefined, ...)
```

The `addressed_by` field is **gone** from the update schema. `closed_by` is a different semantic (who certified closure, not which unit claims to address it). The `resolution` field (`question | inline_fix | stage_revisit | upstream_rewind`) is a new concept not present in any product-stage artifact.

**Files:**
- `packages/haiku-api/src/schemas/feedback.ts:216–232` — actual FeedbackUpdateRequestSchema
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DATA-CONTRACTS.md:582–595` — specifies addressed_by in the Zod schema
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DATA-CONTRACTS.md:125–131` — error table references "addressed_by"
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/ACCEPTANCE-CRITERIA.md:74–75` — AC-02.4 asserts addressed_by is updated by haiku_feedback_update

**Impact:** AC-02.4 tests `haiku_feedback_update(..., addressed_by: "unit-03-fix-null-check")` — this field no longer exists in the HTTP schema. The acceptance criterion tests a contract that does not match the shipped API. Any external tool or test that calls `PUT /api/feedback/...` with `addressed_by` will get a Zod validation failure (the refine requires at least one of `status | closed_by | resolution`).

This is a concrete contract mismatch at the product-development seam.

**Fix:** Update DATA-CONTRACTS.md §1.2 (haiku_feedback_update), §2.3 (PUT endpoint), and §3.3 (frontmatter fields) to reflect the actual `closed_by` + `resolution` fields. Update AC-02.4 and the corresponding Gherkin scenario to use `closed_by` rather than `addressed_by`. Add AC items for `resolution` routing.
