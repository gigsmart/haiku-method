---
title: Mock feedback fixtures use placeholder data; realistic edge cases are untested
status: fixing
origin: adversarial-review
author: test-quality
author_type: agent
created_at: '2026-04-21T20:25:04Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

**Severity:** Medium — the test data is minimal placeholder copy, not realistic content, so string-handling edge cases are not exercised.

**File:** `packages/haiku-ui/src/components/feedback/__tests__/mockItems.ts`

```ts
items.push({
  feedback_id: id,
  title: `Fixture feedback item ${id}`,
  body: `Body copy for ${id}. Lorem ipsum dolor sit amet.`,
  ...
  closed_by: status === "closed" ? "unit-99-assessor" : null,
})
```

The fixture generator is used by every FeedbackList, FeedbackItem, FeedbackSummaryBar, and AnnotationCanvas test. Every item is a 20-character title + single-sentence body with no:
- Multi-line bodies (feedback from adversarial reviewers is frequently multi-paragraph with code fences, file-line refs, and bullet lists).
- Long titles near the 120-char cap enforced on the backend (`packages/haiku/src/state-tools.ts` writeFeedbackFile checks ≤ 120).
- Markdown special characters (backticks, asterisks, brackets, pipes) that need escaping when rendered inline.
- Unicode (the product legitimately ships H·AI·K·U — the mid-dot unicode — users logging feedback about the product are likely to paste it back).
- Embedded newlines or carriage returns.
- Cross-stage `closed_by` values that reference different stages (every closed item uses the same `unit-99-assessor` slug).

**Why this matters:**
- The mandate says "test data is realistic, not minimal placeholder values." Lorem ipsum is the canonical failure mode this rule targets.
- The FeedbackItem snapshot tests at `FeedbackItem.states.test.tsx:94-97` capture exactly this mock data and pin the rendered HTML. If the component breaks on a real 2,000-char body with embedded code fences, the snapshot tests pass because they never see one.
- Consider the FeedbackList virtualization test (`FeedbackList.virtualization.test.tsx:31-47`): 500 items each 20 chars long is ~10 KB of title text. A real list of 500 findings with typical body sizes is 500 KB or more; virtualization budgets under realistic payloads are untested.

**Suggested fix:**
1. Seed a small library of realistic fixture titles/bodies in `mockItems.ts` and rotate through them:
   - Multi-paragraph body with code fence: `"...handler at `src/api/feedback.ts:42` throws:\n\n```ts\nthrow new Error('...')\n```\n\n..."`
   - Markdown-heavy body with nested lists + inline emphasis + links.
   - Body at ~2 KB (common for adversarial review bodies) and at ~10 KB (long-tail but real).
   - Title at 120 chars exactly + title with a leading dot + title with emoji/mid-dot characters.
2. Rotate `closed_by` across several unit slugs including intent-scope (`null` when status=rejected vs `unit-NN-xxxx` when closed).

Mandate reference: "test data is realistic, not minimal placeholder values".
