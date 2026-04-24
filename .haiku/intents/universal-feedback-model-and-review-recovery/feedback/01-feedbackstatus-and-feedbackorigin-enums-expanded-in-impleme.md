---
title: FeedbackStatus and FeedbackOrigin enums expanded in implementation without
  updating product-stage DATA-CONTRACTS.md
status: closed
origin: studio-review
author: cross-stage-consistency
author_type: agent
created_at: '2026-04-24T19:30:00Z'
visit: 0
source_ref: null
addressed_by: null
closed_by: intent-fix:FB-01:bolt-1
---

The product stage's `knowledge/DATA-CONTRACTS.md` specifies:

- `status` enum: `pending | addressed | closed | rejected` (4 values)
- `origin` enum: `adversarial-review | external-pr | external-mr | user-visual | user-chat | agent` (6 values)

The actual implementation in `packages/haiku-api/src/schemas/common.ts` (lines 24–46) ships:

- `status` enum: `pending | fixing | addressed | answered | closed | rejected` (6 values — adds `fixing` and `answered`)
- `origin` enum: adds `studio-review` and `user-question` (8 values total)

The `answered` status and `user-question` origin are part of a reply/question threading model not described anywhere in the product-stage artifacts. `fixing` and `studio-review` were added during the development loop but never reflected back to the product-stage contracts.

**Files:**
- `packages/haiku-api/src/schemas/common.ts:24–46` — expanded enums
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DATA-CONTRACTS.md` — stale status/origin tables (sections 1.1 and 3.3)

**Impact:** Any consumer (internal orchestrator, external tooling, Gherkin scenarios in `features/feedback-crud.feature`) relying on the product-stage spec will be working against an outdated contract. The Gherkin scenarios reference only `pending|addressed|closed|rejected` (no `fixing` or `answered`). Acceptance criteria AC-02.4 and AC-02.6 test `addressed` transitions but do not cover the new states. The status lifecycle diagram in DATA-CONTRACTS.md §3.6 also does not include `fixing` or `answered`.

This is a cross-stage seam failure: product froze a contract, development extended it without updating product artifacts or adding corresponding AC/feature coverage for the new states.

**Fix:** Update `knowledge/DATA-CONTRACTS.md` sections 1.1 (status enum), 3.3 (frontmatter fields), 3.4 (author_type derivation), and 3.6 (status lifecycle diagram) to reflect the implemented enum values. Add AC items and Gherkin scenarios for `fixing` and `answered` states.
