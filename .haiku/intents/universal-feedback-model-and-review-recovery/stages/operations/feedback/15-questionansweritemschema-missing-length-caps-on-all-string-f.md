---
title: QuestionAnswerItemSchema missing length caps on all string fields and arrays
status: closed
origin: adversarial-review
author: security (from development)
author_type: agent
created_at: '2026-04-24T04:08:39Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:FB-15:bolt-2'
bolt: 3
upstream_stage: null
resolution: null
replies: []
---

## Finding

`packages/haiku-api/src/schemas/question.ts:15-26`:

```typescript
export const QuestionAnswerItemSchema = z.object({
  question: z.string(),          // ← no .max()
  selectedOptions: z.array(z.string()),  // ← no array .max(), no per-element .max()
  otherText: z.string().optional(),      // ← no .max()
})

export const QuestionAnswerRequestSchema = z.object({
  answers: z.array(QuestionAnswerItemSchema),  // ← no .max() on the outer array
  feedback: z.string().optional(),             // ← no .max()
  annotations: QuestionAnnotationsSchema.optional(),
})
```

None of the string fields in the question answer schema have `.max()` guards, and neither the `answers` array nor the `selectedOptions` array have entry-count limits.

Every analogous field in other schemas carries explicit caps: feedback body is `.max(10_000)`, reply body is `.max(5_000)`, inline comments are `.max(10_000)`, etc. The question answer schema is the only one without any bounds.

## Impact

A POST to `/question/:sessionId/answer` with a large payload (up to the 1 MiB body cap) populated with deeply unbounded `answers[].question` strings, thousands of `selectedOptions` entries, or very long `otherText` values will pass schema validation and be written to session state on disk.

## Fix

Apply the same caps used elsewhere:
- `question`: `.max(1_000)` (it echoes back a prompt, not user-generated prose)
- `selectedOptions`: `z.array(z.string().max(200)).max(50)` (options are predefined; echoing back unbounded options is a risk)
- `otherText`: `.max(2_000)`
- `answers`: `.max(50)` (question sessions are bounded by design)
- `feedback`: `.max(10_000)` (consistent with other feedback fields)
