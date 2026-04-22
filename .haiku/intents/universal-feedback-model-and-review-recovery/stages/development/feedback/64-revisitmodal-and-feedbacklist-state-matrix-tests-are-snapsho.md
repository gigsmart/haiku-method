---
title: >-
  RevisitModal and FeedbackList state-matrix tests are snapshot-only (no
  behavior assertions)
status: fixing
origin: adversarial-review
author: test-quality
author_type: agent
created_at: '2026-04-21T20:26:11Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

**Severity:** Low-Medium — snapshot-only tests mask behavioral regressions.

**Files:**
- `packages/haiku-ui/src/components/__tests__/RevisitModal.states.test.tsx`
- `packages/haiku-ui/src/components/feedback/__tests__/FeedbackList.states.test.tsx` (partial — has one behavior assertion, the rest are snapshots)
- `packages/haiku-ui/src/components/__tests__/StageProgressStrip.states.test.tsx`
- `packages/haiku-ui/src/components/__tests__/AssessorSummaryCard.states.test.tsx`
- `packages/haiku-ui/src/components/feedback/__tests__/*.states.test.tsx` (multiple files)

**RevisitModal.states.test.tsx** is the clearest case — the whole file is:
```ts
it("renders every documented state cell (snapshot)", () => {
  const { container } = render(<div>...six variants...</div>)
  expect(container.firstChild).toMatchSnapshot()
})
```
One snapshot, no behavioral assertions. A regression that breaks `onClose` dispatch, breaks validation, or renders the wrong copy for `targetStage="product"` is only caught if the HTML string changes. But the snapshot locks in HTML structure, not semantics — rename a className and you get a diff; silently swap two targetStage labels and you might not (depending on what the snapshot captured).

**FeedbackList.states.test.tsx** adds `onRetry` callback coverage (line 48-49) but the `default`, `loading`, `error`, and `empty` states are each an isolated `toMatchSnapshot` with no behavior assertion beyond "aria-busy=true" on loading (line 36) and text presence on empty (line 58). State transitions (default → loading → error → retry → default) are not tested.

**Why this matters:**
- Snapshot diffs are noisy proof-of-change, not proof-of-behavior. A developer who refactors className generation will see every snapshot fail and mass-update them with `-u`, losing any regression signal.
- The mandate explicitly lists this pattern as a fail: "tests assert on behavior and outcomes, not implementation details." Snapshot of raw HTML is implementation detail — it captures the output but not the invariants that should hold.

**Suggested fix:**
For each state-matrix file, add one *behavioral* assertion per state cell alongside (or instead of) the snapshot:
- `RevisitModal open=false` → `container.innerHTML === ""` (already checked elsewhere; move it into this file).
- `RevisitModal open=true, targetStage="product"` → dispatch a submit and verify the stubbed `submitRevisit` is called with `stage: "product"` in the body.
- `FeedbackList error state` → Retry click calls onRetry AND the list re-renders (e.g. remount with new items prop) without the error banner.
- `FeedbackList loading state` → aria-busy=true AND at least one skeleton row is present AND polite region is not written to (loading should be silent).

Mandate reference: "tests assert on behavior and outcomes, not implementation details" + "verify test names describe the scenario and expected result" — "state matrix snapshot" is not a scenario/expected-result pair.
