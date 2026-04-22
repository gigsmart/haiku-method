---
title: >-
  unit-01: feedback/revisit schemas drop spec-declared string caps (body ≤
  10_000, title ≤ 200, reasons ≤ 50)
status: fixing
origin: adversarial-review
author: correctness
author_type: agent
created_at: '2026-04-21T20:22:42Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

Unit-01 spec (unit-01-extract-haiku-api-package.md:79-80) mandates:

> `feedback.ts` — ... Every string field has an explicit `.max()` cap (title ≤ 200, body ≤ 10_000, author ≤ 200, etc.).
> `revisit.ts` — `RevisitReasonItem` (title ≤ 200, body ≤ 10_000), `RevisitRequest` (reasons array `.max(50)`)

Unit-11 spec (unit-11-revisit-modal-and-assessor-card.md:57) depends on these caps:

> Collects revisit reasons (title + body per reason) validated against `haiku-api`'s `RevisitRequest` schema (**includes title ≤ 200, body ≤ 10_000, reasons.length ≤ 50**).

Actual implementation:

**`packages/haiku-api/src/schemas/feedback.ts:87-94`** (FeedbackCreateRequestSchema):
```ts
title: z.string().min(1).max(120),     // spec: ≤ 200
body:  z.string().min(1),               // spec: ≤ 10_000 — NO MAX
source_ref: z.string().nullable().optional(), // no max
```
Missing: body max, author-field cap altogether (spec lists "author ≤ 200").

**`packages/haiku-api/src/schemas/revisit.ts:20-44`** (RevisitReasonSchema, RevisitRequestSchema):
```ts
title: z.string().min(1).max(120),                      // spec: ≤ 200
body:  z.string().min(1),                                // spec: ≤ 10_000 — NO MAX
reasons: z.array(RevisitReasonSchema).optional(),        // spec: .max(50) — NO CAP
```

**Consequences:**
1. A 5-MB request body with one feedback item gets rejected by the 128 KB body-size cap — but a 100-KB single-field body still lands in frontmatter YAML on disk, which is not a line-oriented format expecting that size. Nothing at the schema layer upper-bounds per-field length.
2. `RevisitModal.tsx` (unit-11) works around this by hard-coding client-side caps (`UI_TITLE_MAX = 120`, `UI_BODY_MAX = 10_000`, `UI_REASONS_MAX = 50`) and even has a comment (lines 31-38) acknowledging the wire schema doesn't match the unit spec. This is a band-aid — a second client (e.g., an MCP caller, a future reviewer bot) that hits `POST /api/revisit/:sessionId` directly gets no protection.
3. Unit-11 completion criteria "Title > 200 chars → error" passes in the UI but not in the contract — the declared completion criterion is that the **schema** enforces these bounds, and it doesn't.

**Required fix:**
- feedback.ts FeedbackCreateRequestSchema: add `.max(10_000)` to `body`, `.max(1000)` to `source_ref`, add an optional `author: z.string().max(200).optional()` field (per unit-01 §3 spec mentioning "author ≤ 200").
- revisit.ts RevisitReasonSchema: update title `.max(200)` (currently 120), add `body.max(10_000)`.
- revisit.ts RevisitRequestSchema: add `.max(50)` to reasons array.
- Update round-trip tests in `packages/haiku-api/test/schemas.test.mjs` to assert rejection at each cap boundary.
- Remove the workaround comment block in `RevisitModal.tsx:31-42` after wire caps align.
