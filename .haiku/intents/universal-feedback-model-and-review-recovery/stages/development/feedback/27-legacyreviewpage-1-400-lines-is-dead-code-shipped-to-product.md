---
title: 'LegacyReviewPage (~1,400 lines) is dead code shipped to production'
status: fixing
origin: adversarial-review
author: performance
author_type: agent
created_at: '2026-04-21T20:23:09Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

## Finding

`packages/haiku-ui/src/components/ReviewPage.tsx:157-1659` exports `LegacyReviewPage` — a 1,400-line monolithic composition that is **not imported anywhere** in the bundled code.

Verification:
```
$ rg 'LegacyReviewPage' packages/haiku-ui/src
packages/haiku-ui/src/components/ReviewPage.tsx:150: * as `LegacyReviewPage` so tests...
packages/haiku-ui/src/components/ReviewPage.tsx:157:export function LegacyReviewPage(...)
```

Only the docstring references it. The canonical entry `packages/haiku-ui/src/pages/review/ReviewPage.tsx` re-uses only the `IntentReview`, `UnitReview`, `RereviewBanner`, and `markdownToSimpleHtml` helpers from the file — the top-level `LegacyReviewPage` component body (lines 157-522) is unreachable user code.

Because the file is `export`ed, Rollup/esbuild treeshaking **cannot** drop it from the single-chunk build (`manualChunks: undefined` + `inlineDynamicImports: true` keep everything in one graph, and the named export is reachable from the public API surface of the module).

## Impact

The dead `LegacyReviewPage` body includes:
- Full draft persistence (`loadDraft`/`saveDraft`)
- Full comment state handlers (`handleDeleteComment`, `handleEditComment`, `handleClearAll`, `handleScrollTo`)
- Full sidebar tab rendering with `<FeedbackPanel>` + `<ReviewSidebar>` wiring
- All markup for the sticky sidebar

Conservatively ~15 KB of un-minified source → ~5-8 KB gzipped that ships on every page load for nothing. On top of an already over-budget bundle (see the minification finding), this is pure waste.

## Mandate violation

Performance mandate requires "bundle size impact is reasonable for frontend changes." Keeping 1,400 lines of unused React code alive in a bundle that is already 84% over its size target is not reasonable.

## Suggested fix

Option A (lowest risk): Gate the export behind a dev-only conditional, e.g. move `LegacyReviewPage` to `packages/haiku-ui/src/components/ReviewPage.legacy.tsx` and `export { ReviewPage } from "../pages/review/ReviewPage"` only.

Option B (clean): Delete `LegacyReviewPage` entirely. If the docstring claim "tests depend on the original composition" is real, those tests also need to move or be rewritten — grep shows no current test importing `LegacyReviewPage` as a symbol:
```
$ rg 'LegacyReviewPage' packages/haiku-ui  # → 0 matches outside the file itself
```

## File references

- `packages/haiku-ui/src/components/ReviewPage.tsx:144-155` (docstring claiming tests need it)
- `packages/haiku-ui/src/components/ReviewPage.tsx:157-522` (the dead function body)
- `packages/haiku-ui/src/components/ReviewPage.tsx:153-155` (the re-export that's the ACTUAL entry point)
- `packages/haiku-ui/src/pages/review/ReviewPage.tsx` (the real ReviewPage — 185 lines — that gets rendered)
